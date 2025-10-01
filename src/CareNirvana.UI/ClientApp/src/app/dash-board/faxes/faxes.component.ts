import { Component, OnInit, ViewChild, ElementRef, DestroyRef } from '@angular/core';
import { MatTableDataSource } from '@angular/material/table';
import { finalize } from 'rxjs';
import { DashboardServiceService, FaxFile as ApiFaxFile } from 'src/app/service/dashboard.service.service';
import { PdfOcrService, OcrResult } from 'src/app/service/pdfocr.service';
import { extractPriorAuth, extractTexasFromText, extractGeorgiaFromText, extractArizonaFromText } from 'src/app/service/priorauth.extractor';
import { PriorAuth } from 'src/app/service/priorauth.schema';
import { HttpClient } from '@angular/common/http';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
// Keep this in sync with your C# FaxFile DTO
export interface FaxFile {
  faxId?: number;

  fileName: string;        // maps to filename
  url?: string;            // maps to storedpath in repo via FaxFile.Url
  originalName?: string;
  contentType?: string;
  sizeBytes?: number;
  sha256Hex?: string;

  receivedAt?: string;     // ISO
  uploadedBy?: number | null;
  uploadedAt?: string | null;

  pageCount?: number;
  memberId?: number | null;
  workBasket?: string | null;
  priority?: 1 | 2 | 3;
  status?: string;         // 'New'|'Processing'|'Ready'|'Failed' ...
  processStatus?: string;  // 'Pending'|'Processing'|'Ready'|'Failed'

  metaJson?: string;       // <-- STRING that contains JSON

  ocrText?: string | null;
  ocrJsonPath?: string | null;

  createdBy?: number | null;
  createdOn?: string | null;
  updatedOn?: string | null;
  updatedBy?: number | null;
  fileBytes?: string;
}

// Match the GET /faxfiles response
export interface FaxFileListResponse {
  Items: FaxFile[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

@Component({
  selector: 'app-faxes',
  templateUrl: './faxes.component.html',
  styleUrl: './faxes.component.css'
})

export class FaxesComponent implements OnInit {

  // Table
  columns = ['fileName', 'receivedAt', 'member', 'workBasket', 'priority', 'status', 'actions'];
  dataSource = new MatTableDataSource<FaxFile>([]);
  total = 0;
  page = 1;
  pageSize = 10;

  // Filters / search
  search = '';
  statusFilter?: string;

  // UI state
  loading = false;
  uploading = false;
  saving = false;

  // Selection / preview
  selectedFax?: FaxFile;
  details: any; // bind your OCR later

  @ViewChild('fileInput') fileInput?: ElementRef<HTMLInputElement>;
  result: OcrResult | null = null;
  student?: { name?: string; studentNumber?: string; address?: string };
  isProcessing = false;
  error: string | null = null;
  progress = 0;
  //error = signal<string | null>(null);
  priorAuth: PriorAuth | null = null;
  uploadPercent = 0;
  currentUserId?: number;
  previewUrl?: SafeResourceUrl | null = null;
  previewOpen = false;
  showPreview = false;
  constructor(private pdfOcr: PdfOcrService, private destroyRef: DestroyRef,
    private api: DashboardServiceService, private sanitizer: DomSanitizer,
    private http: HttpClient) { }

  // helper: pick the most likely Texas page, falling back to last page
  private pickTexasPage(byPage: { page: number; text: string }[]): number {
    // look for tokens that only appear on the filled form page
    const signals = [
      /Planned Service or Procedure Code/i,
      /Member or Medicaid ID/i,
      /Issuer Name:/i,
      /Submission Date:/i,
      /Requesting Provider or Facility Name:/i,
      /Service Provider or Facility Name:/i
    ];
    const scored = byPage.map(p => ({
      page: p.page,
      score: signals.reduce((a, re) => a + (re.test(p.text) ? 1 : 0), 0)
    })).sort((a, b) => b.score - a.score);

    // best score, else prefer last page (Texas form is often on page 2)
    return (scored[0]?.score ?? 0) > 0 ? scored[0].page : (byPage[byPage.length - 1]?.page || 1);
  }

  ngOnInit(): void {
    this.reload();
  }

  // -------- List / paging --------
  reload(): void {
    this.loading = true;
    console.log('Reload faxes', { search: this.search, page: this.page, pageSize: this.pageSize, status: this.statusFilter });
    this.api.getFaxFiles(this.search ?? '', this.page, this.pageSize, this.statusFilter)
      .pipe(finalize(() => this.loading = false))
      .subscribe({
        next: (res: FaxFileListResponse) => {
          console.log('Got faxes', res);
          const rawItems = this.getItems(res);
          console.log('Got faxes Items', rawItems);

          // 🔁 normalize every row to camelCase FaxFile
          const rows = rawItems.map(this.normalizeFax);

          this.dataSource.data = rows;
          this.total = this.getTotal(res);

          // keep selection in sync if visible in page (compare against normalized rows)
          if (this.selectedFax) {
            const found = rows.find(x => x.faxId === this.selectedFax!.faxId);
            if (!found) this.selectedFax = undefined;
            else this.selectedFax = found; // refresh with latest copy
          }
        },
        error: _ => {
          this.dataSource.data = [];
          this.total = 0;
        }
      });
  }

  // Put this helper in your component (or a utils file)
  private normalizeFax = (r: any): FaxFile => ({
    faxId: r.faxId ?? r.FaxId,
    fileName: r.fileName ?? r.FileName,
    receivedAt: r.receivedAt ?? r.ReceivedAt,
    pageCount: r.pageCount ?? r.PageCount,
    memberId: r.memberId ?? r.MemberId ?? null,
    workBasket: r.workBasket ?? r.WorkBasket ?? null,
    priority: r.priority ?? r.Priority ?? 2,
    status: r.status ?? r.Status ?? 'New',
    url: r.url ?? r.Url ?? null,
    originalName: r.originalName ?? r.OriginalName ?? null,
    contentType: r.contentType ?? r.ContentType ?? null,
    sizeBytes: r.sizeBytes ?? r.SizeBytes ?? null,
    sha256Hex: r.sha256Hex ?? r.Sha256Hex ?? null,
    fileBytes: r.fileBytes ?? r.FileBytes ?? null,
    uploadedBy: r.uploadedBy ?? r.UploadedBy ?? null,
    uploadedAt: r.uploadedAt ?? r.UploadedAt ?? null,
    processStatus: r.processStatus ?? r.ProcessStatus ?? 'Pending',
    metaJson: r.metaJson ?? r.MetaJson ?? null,
    ocrText: r.ocrText ?? r.OcrText ?? null,
    ocrJsonPath: r.ocrJsonPath ?? r.OcrJsonPath ?? null,
    createdBy: r.createdBy ?? r.CreatedBy ?? null,
    createdOn: r.createdOn ?? r.CreatedOn ?? null,
    updatedOn: r.updatedOn ?? r.UpdatedOn ?? null,
    updatedBy: r.updatedBy ?? r.UpdatedBy ?? null
  });

  // If the list object itself might be camel/Pascal, normalize those too:
  private getItems = (res: any) => (res?.items ?? res?.Items ?? []) as any[];
  private getTotal = (res: any) => (res?.total ?? res?.Total ?? 0);

  onSearchEnter(): void {
    this.page = 1;
    this.reload();
  }

  onPageChange(pageIndexZeroBased: number): void {
    this.page = pageIndexZeroBased + 1;
    this.reload();
  }

  // -------- Preview --------

  openPreview(row: any): void {
    this.selectedFax = row;

    const fileBytes = row.FileBytes ?? row.fileBytes ?? null;
    const contentType = row.ContentType ?? row.contentType ?? 'application/pdf';
    const fileUrl = row.Url ?? row.url ?? null;
    this.showPreview = true;
    console.log('Previewing fax', this.showPreview);

    const base64 = row.FileBytes ?? row.fileBytes ?? null;
    if (base64) {
      this.onFileChosen(undefined, base64, row.OriginalName ?? 'preview.pdf');
    }

    // Prefer inlined bytes if present
    if (fileBytes) {
      const u8 = this.base64ToUint8Array(fileBytes);
      const objUrl = this.makePdfBlobUrl(u8, contentType);
      this.previewUrl = this.sanitizer.bypassSecurityTrustResourceUrl(objUrl);
      return;
    }

    // Fallback to server URL if available (streaming endpoint preferred)
    if (fileUrl) {
      this.previewUrl = this.sanitizer.bypassSecurityTrustResourceUrl(fileUrl);
      return;
    }

    // No bytes/URL — clear preview
    this.previewUrl = null;
  }

  closePreview(): void {
    this.showPreview = false;
    this.selectedFax = undefined;
    this.previewUrl = null;          // if you created an ObjectURL, you can also revoke it here
    this.priorAuth = null;           // clear OCR details if you prefer
    this.progress = 0;
    this.error = '';
  }

  // -------- Upload + Insert --------
  onAddClick(): void {
    this.fileInput?.nativeElement.click();
  }

  async saveFileData(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    // allow re-selecting the same file
    input.value = '';

    // --- derive file fields
    const contentType = file.type || 'application/pdf';
    const sizeBytes = file.size;
    const originalName = file.name;
    const [sha256Hex, fileDataBase64] = await Promise.all([
      this.computeSha256Hex(file),
      this.readFileAsBase64(file)
    ]);

    const fileBytes = fileDataBase64.includes('base64,')
      ? fileDataBase64.split('base64,')[1]
      : fileDataBase64;

    // --- pull UI fields (adjust form control names as needed)
    //const memberId: number | null = this.form?.get('memberId')?.value ?? null;
    //const workBasket: string | null = this.form?.get('workBasket')?.value ?? null;
    const priority: 1 | 2 | 3 = 2;
    const pageCount: number = 1;

    // --- status/audit/meta
    const nowIso = new Date().toISOString();
    const uploadedBy: number | null = this.currentUserId ?? null;
    const createdBy: number | null = this.currentUserId ?? null;
    const fileName = originalName; // display name in DB
    // { "metaJson": "{\"source\":\"UI:Faxes\",\"note\":\"test upload\"}" }


    // --- payload for insertFaxFile (JSON)
    const payload: ApiFaxFile = {
      fileName: originalName,
      url: undefined,                 // let API set the actual saved path (or send ''/null)
      originalName,
      contentType,
      sizeBytes,
      sha256Hex,

      receivedAt: nowIso,
      uploadedBy,
      uploadedAt: nowIso,

      pageCount,
      memberId: null,
      workBasket: null,
      priority,
      status: 'New',
      processStatus: 'Pending',
      metaJson: "{\"source\":\"UI:Faxes\",\"note\":\"test upload\"}",
      createdBy,
      createdOn: nowIso,
      updatedOn: null,
      updatedBy: null,
      fileBytes
    };

    // call your API
    this.uploading = true;
    this.uploadPercent = 0; // (optional, kept for UI consistency)
    console.log('Inserting fax file', { payload, fileDataBase64 });
    this.api.insertFaxFile(payload).subscribe({
      next: () => {
        this.uploading = false;
        this.uploadPercent = 0;
        //this.form?.reset({ priority: 2, pageCount: 1 });
        this.reload?.(); // refresh grid/cards
      },
      error: (err) => {
        console.error('insertFaxFile failed', err);
        this.uploading = false;
        this.uploadPercent = 0;
        // show snackbar/toast here if you have one
      }
    });
  }


  // -------- Update --------
  saveUpdate(): void {
    if (!this.selectedFax) return;

    //const toSave: ApiFaxFile = {
    //  ...this.selectedFax,
    //  updatedOn: new Date().toISOString(),
    //  updatedBy: this.selectedFax.updatedBy ?? 1
    //};

    //this.saving = true;
    //this.api.updateFaxFile(toSave)
    //  .pipe(finalize(() => (this.saving = false)))
    //  .subscribe({
    //    next: () => this.reload(),
    //    error: () => alert('Update failed')
    //  });
  }

  // -------- Helpers --------
  priorityLabel(p?: number): string {
    if (p === 1) return 'High';
    if (p === 3) return 'Low';
    return 'Normal';
  }
  priorityClass(p?: number): string {
    if (p === 1) return 'pri-high';
    if (p === 3) return 'pri-low';
    return 'pri-normal';
  }


  showFilters = false;
  // quick search
  quickSearchTerm = '';

  toggleFilters(): void { this.showFilters = !this.showFilters; }

  onQuickSearch(ev: Event): void {
    const v = (ev.target as HTMLInputElement).value ?? '';
    this.quickSearchTerm = v.trim().toLowerCase();
  }


  async onFileChosen(evt?: Event, fileBytesBase64?: string, fileName = 'preview.pdf') {

    let file: File | null = null;

    if (fileBytesBase64) {
      // Convert base64 → Uint8Array → File
      const pure = fileBytesBase64.includes('base64,')
        ? fileBytesBase64.split('base64,')[1]
        : fileBytesBase64;
      const bin = atob(pure);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) {
        bytes[i] = bin.charCodeAt(i);
      }
      file = new File([bytes], fileName, { type: 'application/pdf' });
    } else if (evt) {
      // From <input type="file">
      file = (evt.target as HTMLInputElement).files?.[0] ?? null;
    }

    if (!file) return;

    this.isProcessing = true; this.error = ''; this.progress = 0;

    try {
      function getTexasPageTextFast(res: { byPage: Array<{ text?: string }> }, formPage: number): string {
        // Safely read the text already produced by the first extract() call
        const pg = res.byPage?.[formPage];
        const t = (pg?.text ?? '').trim();
        return t;
      }
      const res = await this.pdfOcr.extract(file, p => this.progress = Math.round(p.progress * 100));
      let pa = extractPriorAuth(res.text);

      const isTexas = /TEXAS STANDARD PRIOR AUTHORIZATION|NOFR001/i.test(res.text);
      const missingCore =
        !(pa.patient?.name) || !(pa.patient?.memberId) || !(pa.services?.[0]?.code) || !(pa.review?.type);

      if (isTexas && missingCore) {
        const formPage = this.pickTexasPage(res.byPage);


        //  Parse Texas fields from that page and merge
        let pageText = getTexasPageTextFast(res, formPage);

        if (!pageText) {
          // Keep progress monotonic without expensive recomputation
          console.log('Re-OCRing Texas page bump started');
          const bump = (p: { progress: number }) =>
            (this.progress = Math.max(this.progress, Math.round(p.progress * 100)));
          console.log('Re-OCRing Texas page bump', bump);
          pageText = await this.pdfOcr.ocrPageText(file, 2);
        }

        const tx = extractTexasFromText(pageText);
        pa = {
          ...pa,
          source: { template: 'Texas TDI NOFR001', confidence: 0.95 },
          submission: { ...(pa.submission ?? {}), ...(tx.submission ?? {}) },
          patient: { ...(pa.patient ?? {}), ...(tx.patient ?? {}) },
          providerRequesting: { ...(pa.providerRequesting ?? {}), ...(tx.providerRequesting ?? {}) },
          providerServicing: { ...(pa.providerServicing ?? {}), ...(tx.providerServicing ?? {}) },
          review: { ...(pa.review ?? {}), ...(tx.review ?? {}) },
          services: (tx.services?.length ? tx.services : pa.services) ?? []
        };
      }

      const p1Text = res.byPage.find(p => p.page === 1)?.text
        ?? await this.pdfOcr.ocrPageText(file, 1);

      const looksAZ = /CSO-1179A|CMDP|PRIOR AUTHORIZATION FOR MEDICAL\/SURGICAL SERVICES/i.test(p1Text);

      const looksGA = /Georgia Medical Prior Authorization Request Form|GA-P-0229/i.test(p1Text);
      console.log('P1Text', p1Text);
      if (looksAZ) {
        const az = extractArizonaFromText(p1Text);
        console.log('Extracted AZ:', az);
        pa = {
          ...pa,
          source: { template: 'AZ CMDP CSO-1179A', confidence: 0.95 },
          submission: { ...(pa.submission ?? {}), ...(az.submission ?? {}) },
          patient: { ...(pa.patient ?? {}), ...(az.patient ?? {}) },
          providerRequesting: { ...(pa.providerRequesting ?? {}), ...(az.providerRequesting ?? {}) },
          providerServicing: { ...(pa.providerServicing ?? {}), ...(az.providerServicing ?? {}) },
          review: { ...(pa.review ?? {}), ...(az.review ?? {}) },
          services: (az.services?.length ? az.services : pa.services) ?? []
        };
      }

      if (looksGA) {
        const ga = extractGeorgiaFromText(p1Text);           // <-- now line-aware
        console.log('Extracted GA:', ga);
        pa = {
          ...pa,
          source: { template: 'GA CareSource GA-P-0229', confidence: 0.95 },
          submission: { ...(pa.submission ?? {}), ...(ga.submission ?? {}) },
          patient: { ...(pa.patient ?? {}), ...(ga.patient ?? {}) },
          providerRequesting: { ...(pa.providerRequesting ?? {}), ...(ga.providerRequesting ?? {}) },
          providerServicing: { ...(pa.providerServicing ?? {}), ...(ga.providerServicing ?? {}) },
          review: { ...(pa.review ?? {}), ...(ga.review ?? {}) },
          services: (ga.services?.length ? ga.services : pa.services) ?? []
        };
      }


      this.priorAuth = pa;

      const url = 'https://carenirvanabre-b2ananexbwedbfes.eastus2-01.azurewebsites.net/api/DecisionTable/rundecision?decisionTableName=PayorCatalogueSpec';

      const body = {
        'Service Code': "11920",//this.smartAuthCheckForm.get('serviceCode')?.value,
        'LOB': 'TX Medicaid',
        "Start Date": "01-01-2026",
        "End Date": "01-01-2027"
      };

      this.http.post(url, body, { responseType: 'text' }).subscribe({
        next: (text: string) => {
          console.log('Raw response:', text);

          // Optional: try to parse if it sometimes sends JSON
          let data: any = text;
          try { data = JSON.parse(text); } catch { /* keep as plain text */ }

          // Example: handle simple “Y/N” contract
          if (typeof data === 'string' && data.trim() === 'Y') {
            // success path
          } else {
            // handle other values or parsed JSON object
          }
        },
        error: (err) => {
          console.error('Decision Table call failed:', err);
        }
      });


    } catch (e: any) {
      this.error = e?.message || 'Failed to parse PDF';
      this.priorAuth = null;
    } finally {
      this.isProcessing = false;
    }
  }

  private async computeSha256Hex(file: File): Promise<string> {
    const buffer = await file.arrayBuffer();
    const hash = await crypto.subtle.digest('SHA-256', buffer);
    const bytes = Array.from(new Uint8Array(hash));
    return bytes.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  private readFileAsBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => {
        const res = fr.result as string; // "data:application/pdf;base64,AAA..."
        const base64 = res.split(',')[1] || '';
        resolve(base64);
      };
      fr.onerror = reject;
      fr.readAsDataURL(file);
    });
  }

  // 3) Helper: make ISO safely
  private toIso(d: Date | string | null | undefined): string | null {
    if (!d) return null;
    const dt = typeof d === 'string' ? new Date(d) : d;
    return isNaN(dt.getTime()) ? null : dt.toISOString();
  }

  private base64ToUint8Array(b64: string): Uint8Array {
    // ensure it's raw base64 (no data:...;base64, prefix)
    const pure = b64.includes('base64,') ? b64.split('base64,')[1] : b64;
    const binary = atob(pure);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  private makePdfBlobUrl(bytes: Uint8Array, contentType = 'application/pdf'): string {
    const blob = new Blob([bytes], { type: contentType || 'application/pdf' });
    return URL.createObjectURL(blob);
  }

}

function cryptoRandom(): string {
  const bytes = new Uint8Array(16);
  (window.crypto || (window as any).msCrypto).getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}


