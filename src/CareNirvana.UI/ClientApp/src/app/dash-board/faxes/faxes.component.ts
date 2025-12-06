import { Component, OnInit, ViewChild, ElementRef, DestroyRef } from '@angular/core';
import { MatTableDataSource } from '@angular/material/table';
import { finalize } from 'rxjs';
import { DashboardServiceService, FaxFile as ApiFaxFile } from 'src/app/service/dashboard.service.service';
import { PdfOcrService, OcrResult } from 'src/app/service/pdfocr.service';
import { extractPriorAuth, extractTexasFromText, extractGeorgiaFromText, extractArizonaFromText } from 'src/app/service/priorauth.extractor';
import { PriorAuth } from 'src/app/service/priorauth.schema';
import { HttpClient } from '@angular/common/http';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { PDFDocument } from 'pdf-lib';

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
  parentFaxId?: number | null;
  deletedOn?: string | null;
  deletedBy?: number | null;

  // client-side helper properties:
  children?: FaxFile[];
  hasChildren?: boolean;
  isChild?: boolean;
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
  isLoadingDetails: boolean = false;
  currentIndex: number = -1;

  splitFirstPageCount: number | null = 1;
  isSplitting = false;


  faxesRaw: FaxFile[] = [];
  groupedFaxes: FaxFile[] = []; // what we bind to the table


  // backing list from API (getfaxfiles)
  allFaxes: any[] = [];

  // workbasket chips (fax-only)
  faxWorkBaskets: { id: number; name: string; count: number }[] = [];
  selectedWorkBasket: string | null = null;
  totalFaxCount = 0;

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

    this.api.getuserworkgroups(Number(sessionStorage.getItem('loggedInUserid'))).subscribe({
      next: (res: any[]) => {
        console.log('User work groups:', res);

        this.faxWorkBaskets = (res || [])
          .filter(wg => wg.isFax === true)
          .map(wg => ({
            id: wg.workBasketId,
            name: wg.workBasketName,
            count: 0
          }));
        this.workBasketOptions = this.faxWorkBaskets.map(wb => ({
          value: wb.name,   // we store workBasket as its name in the fax row
          label: wb.name
        }));
        this.updateFaxCounts();
      },
      error: (err) => {
        console.error('Error fetching user work groups:', err);
      }
    });
  }

  // -------- List / paging --------
  reload(): void {
    this.loading = true;

    this.api.getFaxFiles(this.search ?? '', this.page, this.pageSize, this.statusFilter)
      .pipe(finalize(() => this.loading = false))
      .subscribe({
        next: (res: FaxFileListResponse) => {
          const rawItems = this.getItems(res);
          console.log("data", rawItems);
          // 🔁 normalize every row to camelCase FaxFile
          const rows = rawItems.map(this.normalizeFax);
          this.faxesRaw = rawItems || [];
          this.buildFaxHierarchy();
          //this.dataSource.data = rows;

          // keep selection in sync if visible in page (compare against normalized rows)
          if (this.selectedFax) {
            const found = rows.find(x => x.faxId === this.selectedFax!.faxId);
            if (!found) this.selectedFax = undefined;
            else this.selectedFax = found; // refresh with latest copy
          }
        },
        error: _ => {
          this.faxesRaw = [];
          this.groupedFaxes = [];
          this.dataSource.data = [];
          this.total = 0;
          this.allFaxes = [];

          this.updateFaxCounts();
        }
      });
  }

  private buildFaxHierarchy(): void {
    const byId = new Map<number, FaxFile>();

    // initialize map + helper flags
    this.faxesRaw.forEach(f => {
      f.children = [];
      f.hasChildren = false;
      f.isChild = false;
      byId.set(f.faxId ?? 0, f);
    });

    const roots: FaxFile[] = [];

    this.faxesRaw.forEach(f => {
      const parentId = f.parentFaxId ?? 0;

      // If parentFaxId has a valid parent in list -> attach as child
      if (parentId > 0 && byId.has(parentId)) {
        const parent = byId.get(parentId)!;
        parent.children!.push(f);
        parent.hasChildren = true;
        f.isChild = true;
      } else {
        // Either parentFaxId is 0/null OR parent not found -> treat as root
        roots.push(f);
      }
    });

    // flatten for mat-table: parent followed by its children
    const flat: FaxFile[] = [];
    roots.forEach(p => {
      flat.push(p);
      if (p.children && p.children.length) {
        p.children.forEach(c => flat.push(c));
      }
    });

    this.groupedFaxes = flat;
    this.dataSource.data = this.groupedFaxes;
    this.allFaxes = this.groupedFaxes || [];
    this.total = this.getTotal(this.groupedFaxes);
    this.applyWorkBasketFilter();
    // update chip counts
    this.updateFaxCounts();
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

    // 🔹 Start details loader & clear stale data
    this.isLoadingDetails = true;
    this.priorAuth = null;

    // Show the split view immediately
    this.showPreview = true;

    const data = this.dataSource?.data || [];
    const idx = data.findIndex(d => d.faxId === row.faxId);

    // if we find the fax in the list, use that index, otherwise default to 0
    this.currentIndex = idx >= 0 ? idx : 0;

    this.api.getFaxFileById(row.faxId).subscribe({
      next: (res: any) => {
        const fileBytes = res.fileBytes ?? res.FileBytes ?? null;
        const contentType = res.contentType ?? res.ContentType ?? 'application/pdf';
        const fileUrl = res.url ?? res.Url ?? null;

        // If backend returns base64 data, pass it to your existing handler
        const base64 = fileBytes;
        if (base64) {
          // NOTE: if onFileChosen triggers OCR/extraction, keep the loader on.
          // Be sure to set `this.isLoadingDetails = false` when you set `this.priorAuth`.
          this.onFileChosen(undefined, base64, row.OriginalName ?? 'preview.pdf');
        }

        if (fileBytes) {
          const u8 = this.base64ToUint8Array(fileBytes);
          const objUrl = this.makePdfBlobUrl(u8, contentType);
          this.previewUrl = this.sanitizer.bypassSecurityTrustResourceUrl(objUrl);
          return; // Keep loader running until priorAuth is set elsewhere.
        }

        // Fallback: stream from server
        if (fileUrl) {
          this.previewUrl = this.sanitizer.bypassSecurityTrustResourceUrl(fileUrl);
          return; // Keep loader running until priorAuth is set elsewhere.
        }

        // If nothing usable came back, clear preview and stop loader
        this.previewUrl = null;
        this.isLoadingDetails = false;
      },
      error: (err) => {
        console.error('Error fetching fax file:', err);
        // Stop loader on failure
        this.isLoadingDetails = false;
        this.previewUrl = null;
      }
    });
  }

  closePreview(): void {
    this.showPreview = false;
    this.selectedFax = undefined;
    this.previewUrl = null;          // if you created an ObjectURL, you can also revoke it here
    this.priorAuth = null;           // clear OCR details if you prefer
    this.progress = 0;
    this.error = '';
    this.currentIndex = -1;
  }

  // -------- Upload + Insert --------
  onAddClick(): void {
    this.fileInput?.nativeElement.click();
  }

  async saveFileData(e?: Event | null, fileOverride?: File): Promise<void> {
    // if split provided a file, use that
    let file: File | undefined;

    if (fileOverride) {
      file = fileOverride;
    } else if (e) {
      const input = e.target as HTMLInputElement;
      file = input.files?.[0];
      if (input) {
        input.value = ''; // allow re-selecting same file
      }
    }

    if (!file) {
      return;
    }

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
      workBasket: "2",
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

    //filename : this.selectedFax.filename,
    //  memberid : this.selectedFax.memberid,
    //  workbasket : this.selectedFax.workbasket,
    //  priority : this.selectedFax.priority,
    //  status : this.selectedFax.status,
    //  processstatus : this.selectedFax.processstatus,
    //  updatedon : this.selectedFax.updatedon,
    //  updatedby : this.selectedFax.updatedby,
    //  deletedon : this.selectedFax.deletedon,
    //  deletedby : this.selectedFax.deletedby

    const toSave: ApiFaxFile = {

      /*memberId: this.selectedFax.memberid,*/
      faxId: this.selectedFax.faxId,
      workBasket: "2",//this.selectedFax.workBasket ?? undefined,
      fileName: this.selectedFax.fileName,
      priority: this.selectedFax.priority,
      status: this.selectedFax.status,
      /*processStatus: this.selectedFax.processstatus,*/
      //deletedOn: this.selectedFax.deletedOn,
      //deletedBy: this.selectedFax.deletedBy ?? 1,
      updatedOn: new Date().toISOString(),
      updatedBy: this.selectedFax.updatedBy ?? 1
    };

    this.saving = true;
    this.api.updateFaxFile(toSave)
      .pipe(finalize(() => (this.saving = false)))
      .subscribe({
        next: () => this.reload(),
        error: () => alert('Update failed')
      });
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
          const bump = (p: { progress: number }) =>
            (this.progress = Math.max(this.progress, Math.round(p.progress * 100)));
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

      if (pa.patient?.name && pa.patient.name.toLowerCase().includes('john doe')) {
        pa.patient.name = 'John Doe';
      }

      if (pa.providerRequesting?.name && pa.providerRequesting.name.toLowerCase().includes('priya')) {
        pa.providerRequesting.name = 'Priya Gowda';
      }

      if (Array.isArray(pa.services) && pa.services.length > 0) {
        const firstService = pa.services[0];
        if (firstService?.description?.toLowerCase().includes('documentation')) {
          firstService.description = 'Office Visit';
        }
      }

      const p1Text = res.byPage.find(p => p.page === 1)?.text
        ?? await this.pdfOcr.ocrPageText(file, 1);

      this.priorAuth = pa;
      this.isLoadingDetails = false;
      const url = 'https://carenirvanabre-b2ananexbwedbfes.eastus2-01.azurewebsites.net/api/DecisionTable/rundecision?decisionTableName=PayorCatalogueSpec';

      const body = {
        'Service Code': "11920",//this.smartAuthCheckForm.get('serviceCode')?.value,
        'LOB': 'TX Medicaid',
        "Start Date": "01-01-2026",
        "End Date": "01-01-2027"
      };


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

  showNext(): void {
    const data = this.dataSource?.data || [];
    const total = data.length;

    if (!total) {
      return;
    }

    if (this.currentIndex < 0) {
      this.currentIndex = 0;
    } else if (this.currentIndex < total - 1) {
      this.currentIndex++;
    } else {
      // Already at last record
      return;
    }

    const next = data[this.currentIndex];
    if (next) {
      this.openPreview(next);
    }
  }

  showPrevious(): void {
    const data = this.dataSource?.data || [];
    const total = data.length;

    if (!total) {
      return;
    }

    if (this.currentIndex <= 0) {
      this.currentIndex = 0;
    } else {
      this.currentIndex--;
    }

    const prev = data[this.currentIndex];
    if (prev) {
      this.openPreview(prev);
    }
  }


  // holds the currently loaded PDF bytes for preview/splitting
  private currentFaxBytes: Uint8Array | null = null;
  private currentFaxContentType: string = 'application/pdf';
  private currentFaxOriginalName: string | null = null;


  async splitCurrentFaxOnClient(): Promise<void> {
    if (!this.selectedFax || !this.selectedFax.pageCount || this.selectedFax.pageCount < 2) {
      alert('Not enough pages to split.');
      return;
    }

    const total = this.selectedFax.pageCount;
    const first = this.splitFirstPageCount ?? 1;
    console.log("Step 3", this.selectedFax);
    if (first <= 0 || first >= total) {
      alert(`First document pages must be between 1 and ${total - 1}.`);
      return;
    }

    this.api.getFaxFileById(this.selectedFax.faxId ?? 0).subscribe({
      next: (res: any) => {
        const fileBytes = res.fileBytes ?? res.FileBytes ?? null;
        const contentType = res.contentType ?? res.ContentType ?? 'application/pdf';
        const fileUrl = res.url ?? res.Url ?? null;

        this.currentFaxContentType = contentType;
        this.currentFaxOriginalName = this.selectedFax?.fileName ?? 'preview.pdf';

        // If backend returns base64 data, pass it to your existing handler
        const base64 = fileBytes;
        if (base64) {
          // OCR / extraction
          this.onFileChosen(undefined, base64, this.currentFaxOriginalName);

          // ✅ Also decode to bytes and keep for splitting
          const u8 = this.base64ToUint8Array(base64);
          console.log('Decoded bytes length for splitting:', u8.length);
          this.currentFaxBytes = u8;

          // Build preview URL from bytes
          const objUrl = this.makePdfBlobUrl(u8, contentType);
          this.previewUrl = this.sanitizer.bypassSecurityTrustResourceUrl(objUrl);
          return;
        }

        // Fallback: stream from server (no bytes)
        if (fileUrl) {
          this.previewUrl = this.sanitizer.bypassSecurityTrustResourceUrl(fileUrl);
          this.currentFaxBytes = null; // we don't have raw bytes in this path
          return;
        }

        // If nothing usable came back, clear preview and stop loader
        this.previewUrl = null;
        this.currentFaxBytes = null;
        this.isLoadingDetails = false;
      },
      error: err => {
        console.error('getFaxFileById error', err);
        this.previewUrl = null;
        this.currentFaxBytes = null;
        this.isLoadingDetails = false;
      }
    });

    // ✅ 1) Get raw PDF bytes from the fax, not from a URL
    // ✅ Use the bytes captured when we loaded the fax
    const bytes = this.currentFaxBytes;
    console.log('splitCurrentFaxOnClient bytes len =', bytes?.length ?? -1);

    if (!bytes || bytes.length === 0) {
      alert('No PDF data loaded for this fax. Open the fax first, then try splitting.');
      return;
    }

    // optional sanity check
    console.log('First 4 bytes:', Array.from(bytes.slice(0, 4)));

    const originalPdf = await PDFDocument.load(bytes);
    const pageCount = originalPdf.getPageCount();

    console.log('original PDF pageCount', pageCount);

    if (pageCount !== total) {
      console.warn('pageCount mismatch', { db: total, pdf: pageCount });
    }

    const pdf1 = await PDFDocument.create();
    const pdf2 = await PDFDocument.create();

    const part1Indices = Array.from({ length: first }, (_, i) => i);
    const part2Indices = Array.from({ length: pageCount - first }, (_, i) => i + first);

    const copied1 = await pdf1.copyPages(originalPdf, part1Indices);
    copied1.forEach(p => pdf1.addPage(p));

    const copied2 = await pdf2.copyPages(originalPdf, part2Indices);
    copied2.forEach(p => pdf2.addPage(p));

    const bytes1 = await pdf1.save();
    const bytes2 = await pdf2.save();

    const originalName = this.currentFaxOriginalName || this.selectedFax.fileName || 'document.pdf';
    const dot = originalName.lastIndexOf('.');
    const base = dot >= 0 ? originalName.substring(0, dot) : originalName;
    const ext = dot >= 0 ? originalName.substring(dot) : '.pdf';

    const file1Name = `${base}_Split1${ext}`;
    const file2Name = `${base}_Split2${ext}`;

    const blob1 = new Blob([bytes1], { type: 'application/pdf' });
    const blob2 = new Blob([bytes2], { type: 'application/pdf' });

    const file1 = new File([blob1], file1Name, { type: 'application/pdf' });
    const file2 = new File([blob2], file2Name, { type: 'application/pdf' });

    await this.saveFileData(null, file1);
    await this.saveFileData(null, file2);
  }

  // FaxesComponent




  openSplitDialog(row: FaxFile): void {
    /* open split dialog, then use saveFileData(...) */
  }

  openUpdateWorkBasketDialog(row: FaxFile): void {
    /* open WB dialog */
  }

  renameFax(row: FaxFile): void {
    /* prompt for new name + saveFileData(...) */
  }

  deleteFax(row: FaxFile): void {
    /* confirm + delete */
  }



  /* Update Methods */
  // Inline edit mode for preview pane
  editMode: 'none' | 'rename' | 'workbasket' | 'deleteConfirm' = 'none';

  // Dropdown options for work baskets (we'll fill from user work groups)
  workBasketOptions: { value: string; label: string }[] = [];

  // Inline edit state (table-level, not preview)
  editingFileNameFaxId: number | null = null;
  editingWorkBasketFaxId: number | null = null;
  tempFileName: string = '';
  tempWorkBasket: string | null = null;

  // Cancel any preview-banner edit (still used for delete confirm if you want)
  cancelInlineEdit(): void {
    this.editMode = 'none';
  }

  // --- Rename ---

  // --- Rename (inline in table) ---

  renameFaxInline(row: FaxFile): void {
    // Only one editor at a time
    this.editingWorkBasketFaxId = null;
    this.editingFileNameFaxId = row.faxId ?? null;
    this.tempFileName = row.fileName;
  }

  saveRename(row: FaxFile): void {
    const name = (this.tempFileName || '').trim();
    if (!name) return;

    this.selectedFax = {
      ...row,
      fileName: name,
      updatedBy: this.currentUserId ?? row.updatedBy ?? 1
    };

    this.saveUpdate();
    this.editingFileNameFaxId = null;
  }

  cancelRename(): void {
    this.editingFileNameFaxId = null;
    this.tempFileName = '';
  }


  // --- Work Basket ---

  openUpdateWorkBasketInline(row: FaxFile): void {
    this.editingFileNameFaxId = null;
    this.editingWorkBasketFaxId = row.faxId ?? null;

    const current = row.workBasket;

    if (current && this.workBasketOptions.some(w => w.value === current)) {
      this.tempWorkBasket = current;
    } else if (this.workBasketOptions.length) {
      this.tempWorkBasket = this.workBasketOptions[0].value;
    } else {
      this.tempWorkBasket = current || null;
    }
  }

  saveWorkBasket(row: FaxFile): void {
    if (!this.tempWorkBasket) return;

    this.selectedFax = {
      ...row,
      workBasket: this.tempWorkBasket,
      updatedBy: this.currentUserId ?? row.updatedBy ?? 1
    };

    this.saveUpdate();
    this.editingWorkBasketFaxId = null;
  }

  cancelWorkBasketEdit(): void {
    this.editingWorkBasketFaxId = null;
    this.tempWorkBasket = null;
  }

  // --- Priority toggle (1 <-> 2) ---

  updatePriority(row: FaxFile): void {
    // No dialog; just toggle and save
    this.selectedFax = {
      ...row,
      priority: row.priority === 1 ? 2 : 1,
      updatedBy: this.currentUserId ?? row.updatedBy ?? 1
    };

    this.saveUpdate();
  }

  // --- Delete (inline confirmation) ---

  //deleteFaxInline(row: FaxFile): void {
  //  this.openPreview(row);
  //  this.editMode = 'deleteConfirm';
  //}

  //confirmDelete(): void {
  //  if (!this.selectedFax) return;

  //  this.selectedFax = {
  //    ...this.selectedFax,
  //    deletedOn: new Date().toISOString(),
  //    deletedBy: this.currentUserId ?? this.selectedFax.deletedBy ?? 1,
  //    status: 'Deleted' // if your backend expects a status change
  //  };

  //  this.saveUpdate();
  //}
  deletingFaxId: number | null = null;
  deleteMessage: string = '';
  openDeleteInline(row: FaxFile): void {
    // Close other inline editors
    this.editingFileNameFaxId = null;
    this.editingWorkBasketFaxId = null;

    this.deletingFaxId = row.faxId ?? null;

    // Build message depending on selection
    if (row.hasChildren) {
      this.deleteMessage = `This will delete "${row.fileName}" and all its split pages. Continue?`;
    } else if ((row as any).isChild) {
      this.deleteMessage = `This will delete the split page "${row.fileName}". Continue?`;
    } else {
      this.deleteMessage = `Are you sure you want to delete "${row.fileName}"?`;
    }
  }

  confirmDelete(row: FaxFile): void {
    if (!row || !row.faxId) {
      return;
    }

    const nowIso = new Date().toISOString();

    // Mark the selected fax for delete; saveUpdate will use deletedBy/deletedOn
    this.selectedFax = {
      ...row,
      deletedBy: this.currentUserId ?? row.deletedBy ?? 1,
      deletedOn: nowIso
    };

    this.saveUpdate();

    // Clear inline UI
    this.deletingFaxId = null;
    this.deleteMessage = '';
  }

  cancelDelete(): void {
    this.deletingFaxId = null;
    this.deleteMessage = '';
  }

  /* END Update Methods */

  private updateFaxCounts(): void {
    const data = this.allFaxes || [];
    this.totalFaxCount = data.length;

    this.faxWorkBaskets.forEach(wb => {
      wb.count = data.filter(f => (f.workBasket || '') === wb.name).length;
    });
  }
  private applyWorkBasketFilter(): void {
    const source = this.allFaxes || [];

    if (!this.selectedWorkBasket) {
      this.dataSource.data = source;
      return;
    }

    this.dataSource.data = source.filter(
      f => (f.workBasket || '') === this.selectedWorkBasket
    );
  }

  selectWorkBasket(name: string | null): void {
    this.selectedWorkBasket = name;
    this.applyWorkBasketFilter();
  }

}

function cryptoRandom(): string {
  const bytes = new Uint8Array(16);
  (window.crypto || (window as any).msCrypto).getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}


