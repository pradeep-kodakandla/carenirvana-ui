import { Component, OnInit, ViewChild, ElementRef, DestroyRef, AfterViewInit } from '@angular/core';
import { MatTableDataSource } from '@angular/material/table';
import { MatSort } from '@angular/material/sort';
import { MatPaginator } from '@angular/material/paginator';
import { MatSnackBar } from '@angular/material/snack-bar';
import { finalize, firstValueFrom } from 'rxjs';
import { DashboardServiceService, FaxFile as ApiFaxFile } from 'src/app/service/dashboard.service.service';
import { PdfOcrService, OcrResult } from 'src/app/service/pdfocr.service';
import { extractPriorAuth, extractTexasFromText, extractArizonaFromText } from 'src/app/service/priorauth.extractor';
import { PriorAuth } from 'src/app/service/priorauth.schema';
import { HttpClient } from '@angular/common/http';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { PDFDocument } from 'pdf-lib';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SmartCheckResultDialogComponent, SmartCheckDialogAction, SmartCheckDialogData } from 'src/app/member/UM/steps/authsmartcheck/smartcheck-result-dialog.component';
import { RulesengineService, ExecuteTriggerResponse } from 'src/app/service/rulesengine.service';
import { HeaderService } from 'src/app/service/header.service';
import { Router } from '@angular/router';
import { FaxAuthPrefill } from './fax-auth-prefill.interface';
import { AuthdetailsComponent } from 'src/app/member/UM/steps/authdetails/authdetails.component';

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
  memberDetailsId?: number | null;
  memberId?: number | null;
  memberName?: string | null;

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

export class FaxesComponent implements OnInit, AfterViewInit {

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
  @ViewChild(MatSort) sort!: MatSort;
  @ViewChild(MatPaginator) paginator!: MatPaginator;
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

  /** Monotonic counter — incremented every time a new extraction starts.
   *  Each async onFileChosen captures its own snapshot; if a newer extraction
   *  has started by the time it finishes, the stale result is discarded. */
  private _extractionGen = 0;

  /** Subscription for the current getFaxFileById call so we can cancel the
   *  previous one when navigating to a new fax. */
  private _faxFetchSub: { unsubscribe(): void } | null = null;

  splitFirstPageCount: number | null = 1;
  isSplitting = false;

  loadedMemberId: number | null = null;

  faxesRaw: FaxFile[] = [];
  groupedFaxes: FaxFile[] = []; // what we bind to the table


  // backing list from API (getfaxfiles)
  allFaxes: any[] = [];

  // workbasket chips (fax-only)
  faxWorkBaskets: { id: number; name: string; count: number }[] = [];
  selectedWorkBasket: string | null = null;
  totalFaxCount = 0;

  // ── Linked Auth metadata (parsed from metaJson when auth already exists) ──
  linkedAuthMeta: {
    linkedAuthNumber: string;
    linkedAuthId: number;
    linkedAt: string;
    parentFaxId?: number;
    [key: string]: any;
  } | null = null;

  // ── Auth Form (fax-to-auth) ─────────────────────────────────────────
  showAuthForm = false;
  currentFaxPrefill: FaxAuthPrefill | null = null;
  @ViewChild('authDetailsRef') authDetailsRef?: AuthdetailsComponent;

  constructor(private pdfOcr: PdfOcrService, private destroyRef: DestroyRef,
    private api: DashboardServiceService, private sanitizer: DomSanitizer,
    private rulesengineService: RulesengineService,
    private headerService: HeaderService,
    private router: Router,
    private snackBar: MatSnackBar,
    private http: HttpClient) {
    // snackBar is intentionally kept injected for compatibility with older call-sites,
    // but we now show messages inline below the search bar.
    void this.snackBar;
  }

  // Inline message (replaces toast/snackbar)
  inlineMessageText: string | null = null;
  inlineMessageType: 'success' | 'error' = 'success';
  private inlineMessageTimer: any = null;

  private showInlineMessage(message: string, type: 'success' | 'error' = 'success', ms = 4000): void {
    this.inlineMessageText = message;
    this.inlineMessageType = type;

    if (this.inlineMessageTimer) {
      clearTimeout(this.inlineMessageTimer);
      this.inlineMessageTimer = null;
    }

    this.inlineMessageTimer = setTimeout(() => {
      this.inlineMessageText = null;
      this.inlineMessageTimer = null;
    }, ms);
  }

  private toast(message: string, isError = false): void {
    // Keep existing call-sites intact, but render the message below the search bar instead of a toast/snackbar.
    this.showInlineMessage(message, isError ? 'error' : 'success', 4000);
  }

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

  // helper: pick the most likely Arizona CMDP page
  private pickArizonaPage(byPage: { page: number; text: string }[]): number {
    const signals = [
      /CSO-1179A/i,
      /CMDP/i,
      /COMPREHENSIVE MEDICAL AND DENTAL/i,
      /REFERRING PHYSICIAN/i,
      /PRIOR AUTHORIZATION FOR MEDICAL/i,
      /HCPCS\/CPT/i
    ];
    const scored = byPage.map(p => ({
      page: p.page,
      score: signals.reduce((a, re) => a + (re.test(p.text) ? 1 : 0), 0)
    })).sort((a, b) => b.score - a.score);

    return (scored[0]?.score ?? 0) > 0 ? scored[0].page : (byPage[0]?.page || 1);
  }

  ngOnInit(): void {
    this.reload();

    this.currentUserId = Number(sessionStorage.getItem('loggedInUserid')) || 1;
    this.api.getuserworkgroups(Number(sessionStorage.getItem('loggedInUserid'))).subscribe({
      next: (res: any[]) => {

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

  ngAfterViewInit(): void {
    this.dataSource.sort = this.sort;
    this.dataSource.paginator = this.paginator;

    // Custom sorting data accessor for columns that don't map 1:1 to property names
    this.dataSource.sortingDataAccessor = (item: FaxFile, sortHeaderId: string): string | number => {
      switch (sortHeaderId) {
        case 'fileName': return (item.fileName || '').toLowerCase();
        case 'receivedAt': return item.receivedAt ? new Date(item.receivedAt).getTime() : 0;
        case 'member': return (item.memberName || '').toLowerCase();
        case 'workBasket': return (item.workBasket || '').toLowerCase();
        case 'priority': return item.priority ?? 2;
        case 'status': return (item.status || '').toLowerCase();
        default: return '';
      }
    };
  }

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
          console.log("Raw faxes", rows);
          this.faxesRaw = rows; // ✅ always work with normalized rows
          console.log("Normalized faxes", this.faxesRaw);
          this.total = this.getTotal(res);
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

    // Initialize helper flags and map, but only when we have a real id
    (this.faxesRaw || []).forEach(f => {
      f.children = [];
      f.hasChildren = false;
      f.isChild = false;

      const id = f.faxId;
      if (id !== undefined && id !== null && id > 0) {
        byId.set(id, f);
      }
    });

    const roots: FaxFile[] = [];

    (this.faxesRaw || []).forEach(f => {
      const parentId = f.parentFaxId ?? null;

      // If parentFaxId has a valid parent in list -> attach as child
      if (parentId && parentId > 0 && byId.has(parentId)) {
        const parent = byId.get(parentId)!;
        parent.children!.push(f);
        parent.hasChildren = true;
        f.isChild = true;
      } else {
        // Either parentFaxId is null/0 OR parent not found -> treat as root
        roots.push(f);
      }
    });

    // Flatten for mat-table: parent followed by its children
    const flat: FaxFile[] = [];
    roots.forEach(p => {
      flat.push(p);
      if (p.children && p.children.length) {
        p.children.forEach(c => flat.push(c));
      }
    });

    this.groupedFaxes = flat;
    this.dataSource.data = this.groupedFaxes;

    // Keep an unfiltered reference for chip counts & workbasket filtering
    this.allFaxes = this.groupedFaxes || [];
    // total comes from API paging response; keep as-is

    this.applyWorkBasketFilter();
    this.updateFaxCounts();
  }

  // Put this helper in your component (or a utils file)
  private normalizeFax = (r: any): FaxFile => ({
    faxId: r.faxId ?? r.FaxId,
    fileName: r.fileName ?? r.FileName,
    receivedAt: r.receivedAt ?? r.ReceivedAt,
    pageCount: r.pageCount ?? r.PageCount,
    memberId: r.memberId ?? r.MemberId ?? null,
    memberName: r.memberName ?? r.MemberName ?? null,
    memberDetailsId: r.memberDetailsId ?? r.MemberDetailsId ?? null,
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
    updatedBy: r.updatedBy ?? r.UpdatedBy ?? null,
    parentFaxId: r.parentFaxId ?? r.ParentFaxId ?? null,
    deletedOn: r.deletedOn ?? r.DeletedOn ?? null,
    deletedBy: r.deletedBy ?? r.DeletedBy ?? null
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

    // Parse linked auth metadata — if auth already linked, skip Smart Auth Check
    this.linkedAuthMeta = this.parseLinkedAuthMeta(row.metaJson ?? row.MetaJson ?? null);

    // 🔹 Cancel any in-flight fetch / extraction from the previous fax
    this._faxFetchSub?.unsubscribe();
    this._faxFetchSub = null;
    this._extractionGen++;            // invalidate any running onFileChosen

    // 🔹 Start details loader & clear stale data
    this.isLoadingDetails = true;
    this.priorAuth = null;

    // Show the split view immediately
    this.showPreview = true;

    const data = this.dataSource?.data || [];
    const idx = data.findIndex(d => d.faxId === row.faxId);

    // if we find the fax in the list, use that index, otherwise default to 0
    this.currentIndex = idx >= 0 ? idx : 0;

    this._faxFetchSub = this.api.getFaxFileById(row.faxId).subscribe({
      next: (res: any) => {
        const fileBytes = res.fileBytes ?? res.FileBytes ?? null;
        const contentType = res.contentType ?? res.ContentType ?? 'application/pdf';
        const fileUrl = res.url ?? res.Url ?? null;

        // If backend returns base64 data, pass it to your existing handler
        const base64 = fileBytes;
        if (base64) {
          // NOTE: if onFileChosen triggers OCR/extraction, keep the loader on.
          // Be sure to set `this.isLoadingDetails = false` when you set `this.priorAuth`.
          const uniqueName =
            row.fileName ||
            row.originalName ||
            `fax-${row.faxId}.pdf`;

          this.onFileChosen(undefined, base64, uniqueName);
          //this.onFileChosen(undefined, base64, row.OriginalName ?? 'preview.pdf');
        }

        if (fileBytes) {
          const u8 = this.base64ToUint8Array(fileBytes);
          // ✅ Keep bytes around so we can split without re-fetching
          this.currentFaxBytes = u8;
          this.currentFaxContentType = contentType;
          this.currentFaxOriginalName = row.fileName ?? 'preview.pdf';
          const objUrl = this.makePdfBlobUrl(u8, contentType);
          this.previewUrl = this.sanitizer.bypassSecurityTrustResourceUrl(objUrl);
          return; // Keep loader running until priorAuth is set elsewhere.
        }

        // Fallback: stream from server
        if (fileUrl) {
          this.previewUrl = this.sanitizer.bypassSecurityTrustResourceUrl(fileUrl);
          this.currentFaxBytes = null;
          this.currentFaxContentType = contentType;
          this.currentFaxOriginalName = row.fileName ?? 'preview.pdf';
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
    // Cancel any in-flight fetch / extraction
    this._faxFetchSub?.unsubscribe();
    this._faxFetchSub = null;
    this._extractionGen++;

    this.showPreview = false;
    this.selectedFax = undefined;
    this.previewUrl = null;
    this.currentFaxBytes = null;
    this.currentFaxOriginalName = null;
    this.priorAuth = null;
    this.linkedAuthMeta = null;
    this.progress = 0;
    this.error = '';
    this.currentIndex = -1;
  }

  // -------- Upload + Insert --------
  onAddClick(): void {
    this.fileInput?.nativeElement.click();
  }

  private async getPageCountFromFile(file: File, contentType: string): Promise<number> {
    const isPdf =
      contentType === 'application/pdf' ||
      file.name.toLowerCase().endsWith('.pdf');

    if (!isPdf) return 1;

    try {
      const ab = await file.arrayBuffer();
      const pdf = await PDFDocument.load(ab, { ignoreEncryption: true });
      return pdf.getPageCount() || 1;
    } catch (err) {
      console.warn('Could not read PDF pageCount; defaulting to 1', err);
      return 1;
    }
  }

  private async tryExtractMemberIdFromPdf(file: File): Promise<string | number | null> {
    try {
      // Run extraction without updating the UI progress bar.
      const res: any = await this.pdfOcr.extract(file, () => void 0);

      // First pass: generic extractor over the whole text
      const pa = extractPriorAuth(res?.text ?? '');
      const direct = pa?.patient?.memberId ?? null;
      if (direct) return direct;

      // Texas forms sometimes need the filled form page parsed specifically
      const allText: string = String(res?.text ?? '');
      const isTexas = /TEXAS STANDARD PRIOR AUTHORIZATION|NOFR001/i.test(allText);

      const byPage: Array<{ page: number; text: string }> =
        (res?.byPage ?? []).map((p: any, i: number) => ({
          page: Number(p?.page ?? (i + 1)),
          text: String(p?.text ?? '')
        }));

      if (isTexas && byPage.length) {
        const formPage = this.pickTexasPage(byPage);
        const pageText = byPage.find(p => p.page === formPage)?.text ?? '';
        if (pageText) {
          const tx = extractTexasFromText(pageText);
          const txMember = tx?.patient?.memberId ?? null;
          if (txMember) return txMember;
        }
      }

      // Arizona CMDP forms
      const isArizona = /CSO-1179A|CMDP|COMPREHENSIVE MEDICAL AND DENTAL PROGRAM/i.test(allText);
      if (isArizona && byPage.length) {
        const formPage = this.pickArizonaPage(byPage);
        const pageText = byPage.find(p => p.page === formPage)?.text ?? '';
        if (pageText) {
          const az = extractArizonaFromText(pageText);
          const azMember = az?.patient?.memberId ?? null;
          if (azMember) return azMember;

          // Fallback: extract CMDP ID directly from text
          const cmdpMatch = pageText.match(/CMDP\s+ID\s+NO\.?\s*[\s\n\r]+(\S+)/i);
          if (cmdpMatch?.[1]) return cmdpMatch[1].trim();
        }
      }

      return null;
    } catch (e) {
      console.warn('MemberId extraction from PDF failed; continuing without memberId.', e);
      return null;
    }
  }



  async saveFileData(
    e?: Event | null,
    fileOverride?: File,
    opts?: { parentFaxId?: number | null; inheritFrom?: FaxFile; metaJson?: string; suppressToast?: boolean; suppressReload?: boolean; successMessage?: string }
  ): Promise<void> {
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
    const [sha256Hex, fileDataBase64, pageCount] = await Promise.all([
      this.computeSha256Hex(file),
      this.readFileAsBase64(file),
      this.getPageCountFromFile(file, contentType),
    ]);

    const fileBytes = fileDataBase64.includes('base64,')
      ? fileDataBase64.split('base64,')[1]
      : fileDataBase64;

    // --- inherit fields when saving a split child (or keep defaults)
    const inherit = opts?.inheritFrom;
    console.log("Opts", opts);
    const priority: 1 | 2 | 3 = (inherit?.priority as 1 | 2 | 3) ?? 2;


    let detectedMemberIdRaw: any =
      inherit?.memberId ??
      (this.priorAuth as any)?.patient?.memberId ??
      null;

    // When uploading a new fax via <input type="file">, we haven't populated `priorAuth` yet.
    // Extract memberId from the PDF itself so the save payload can include it.
    if (detectedMemberIdRaw === null || detectedMemberIdRaw === undefined || String(detectedMemberIdRaw).trim() === '') {
      detectedMemberIdRaw = await this.tryExtractMemberIdFromPdf(file);
    }


    const memberId: number | null =
      detectedMemberIdRaw !== null && detectedMemberIdRaw !== undefined && String(detectedMemberIdRaw).trim() !== ''
        ? (Number(detectedMemberIdRaw) as any)
        : null;

    // guard against NaN
    const memberIdToSend: number | null =
      memberId !== null && Number.isFinite(memberId) ? memberId : null;


    const workBasket: string = ('2' ?? '2') as any;

    // --- status/audit/meta
    const nowIso = new Date().toISOString();
    const uploadedBy: number | null = this.currentUserId ?? null;
    const createdBy: number | null = this.currentUserId ?? null;
    const fileName = originalName; // display name in DB

    const parentFaxId: number | null = (opts?.parentFaxId ?? null) as any;
    const metaJson: string =
      opts?.metaJson ?? JSON.stringify({ source: "UI:Faxes" });



    // --- payload for insertFaxFile (JSON)
    const payload: (ApiFaxFile & { parentFaxId?: number | null; metaJson?: string }) = {
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
      memberId: memberIdToSend as any,
      workBasket,
      priority,
      status: 'New',
      processStatus: 'Pending',
      metaJson,
      parentFaxId,
      createdBy,
      createdOn: nowIso,
      updatedOn: null,
      updatedBy: null,
      fileBytes
    };

    // call your API
    this.uploading = true;
    this.uploadPercent = 0; // (optional, kept for UI consistency)

    try {
      await firstValueFrom(this.api.insertFaxFile(payload as any));

      if (!opts?.suppressToast) {
        const msg =
          opts?.successMessage ??
          (parentFaxId
            ? `Split page saved: ${originalName}`
            : `Uploaded successfully: ${originalName}`);
        this.toast(msg, false);
      }

      if (!opts?.suppressReload) {
        this.reload?.(); // refresh grid/cards
      }
    } catch (err) {
      console.error('insertFaxFile failed', err);
      if (!opts?.suppressToast) {
        this.toast(`Failed to save: ${originalName}`, true);
      }
    } finally {
      this.uploading = false;
      this.uploadPercent = 0;
    }
  }

  private coerceMemberIdForApi(raw: any): number | string | null {
    if (raw === null || raw === undefined) return null;
    const s = String(raw).trim();
    if (!s) return null;

    // If it's purely digits, send as number.
    if (/^\d+$/.test(s)) {
      const n = Number(s);
      return Number.isFinite(n) ? n : s;
    }

    // Otherwise send the trimmed string.
    return s;
  }

  // -------- Update --------
  async saveUpdate(): Promise<void> {
    if (!this.selectedFax) return;

    const nowIso = new Date().toISOString();
    const updatedBy = this.selectedFax.updatedBy ?? this.currentUserId ?? 1;

    const detectedMemberIdRaw: any =
      (this.selectedFax as any).memberId ??
      (this.priorAuth as any)?.patient?.memberId ??
      null;

    const memberIdParsed: number | null =
      detectedMemberIdRaw !== null && detectedMemberIdRaw !== undefined && String(detectedMemberIdRaw).trim() !== ''
        ? (Number(detectedMemberIdRaw) as any)
        : null;

    const memberIdToSend: number | null =
      memberIdParsed !== null && Number.isFinite(memberIdParsed) ? memberIdParsed : null;

    // NOTE: ApiFaxFile doesn't include soft-delete fields in typings here, but backend supports them.
    const toSave: any = {
      faxId: this.selectedFax.faxId,
      workBasket: "2", // TODO: wire real workbasket value if needed
      fileName: this.selectedFax.fileName,
      priority: this.selectedFax.priority,
      status: this.selectedFax.status,
      updatedOn: nowIso,
      updatedBy,
      deletedOn: this.selectedFax.deletedOn ?? null,
      deletedBy: this.selectedFax.deletedBy ?? null
    };

    this.saving = true;
    try {
      await firstValueFrom(this.api.updateFaxFile(toSave));
      this.toast('Saved successfully.', false);
      this.reload();
    } catch (e) {
      console.error('updateFaxFile failed', e);
      this.toast('Update failed.', true);
    } finally {
      this.saving = false;
    }
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

    // Capture the current extraction generation — if a newer extraction starts
    // while this one is running, we'll detect it and discard stale results.
    const myGen = ++this._extractionGen;

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
      const res = await this.pdfOcr.extract(file, p => this.progress = Math.round(p.progress * 100));

      // ── Stale guard: if user navigated away, discard this result ──
      if (myGen !== this._extractionGen) return;

      let pa = extractPriorAuth(res.text);

      const allText: string = res.text ?? '';
      const byPage: Array<{ page: number; text: string }> =
        (res.byPage ?? []).map((p: any, i: number) => ({
          page: Number(p?.page ?? (i + 1)),
          text: String(p?.text ?? '')
        }));

      const isTexas = /TEXAS STANDARD PRIOR AUTHORIZATION|NOFR001/i.test(allText);
      const isArizona = /CSO-1179A|CMDP|COMPREHENSIVE MEDICAL AND DENTAL PROGRAM/i.test(allText);

      const missingCore =
        !(pa.patient?.name) || !(pa.patient?.memberId) || !(pa.services?.[0]?.code) || !(pa.review?.type);

      // ── Texas-specific extraction ──
      if (isTexas && missingCore) {
        const formPage = this.pickTexasPage(byPage);

        let pageText = byPage.find(p => p.page === formPage)?.text?.trim() ?? '';

        if (!pageText) {
          pageText = await this.pdfOcr.ocrPageText(file, 2);
          if (myGen !== this._extractionGen) return;
        }

        const tx = extractTexasFromText(pageText);
        pa = {
          ...pa,
          source: { template: 'Texas TDI NOFR001', confidence: 0.95 },
          submission: { ...(pa.submission ?? {}), ...this.stripEmpty(tx.submission) },
          patient: { ...(pa.patient ?? {}), ...this.stripEmpty(tx.patient) },
          providerRequesting: { ...(pa.providerRequesting ?? {}), ...this.stripEmpty(tx.providerRequesting) },
          providerServicing: { ...(pa.providerServicing ?? {}), ...this.stripEmpty(tx.providerServicing) },
          review: { ...(pa.review ?? {}), ...this.stripEmpty(tx.review) },
          services: (tx.services?.length ? tx.services : pa.services) ?? []
        };
      }

      // ── Arizona CMDP-specific extraction ──
      if (isArizona && (!isTexas || missingCore)) {
        const formPage = this.pickArizonaPage(byPage);

        let pageText = byPage.find(p => p.page === formPage)?.text?.trim() ?? '';

        if (!pageText) {
          pageText = await this.pdfOcr.ocrPageText(file, 1);
          if (myGen !== this._extractionGen) return;
        }

        // ★ Log the actual OCR text so we can debug extraction issues
        console.log('AZ CMDP OCR pageText:', pageText);

        // Try the dedicated extractor, strip undefined values
        const az = extractArizonaFromText(pageText);
        const azClean = {
          patient: this.stripEmpty(az?.patient),
          providerRequesting: this.stripEmpty(az?.providerRequesting),
          providerServicing: this.stripEmpty(az?.providerServicing),
          review: this.stripEmpty(az?.review),
          services: az?.services?.filter((s: any) => s?.code || s?.description) ?? [],
          dx: this.stripEmpty(az?.dx),
          setting: this.stripEmpty(az?.setting),
          submission: this.stripEmpty(az?.submission)
        };

        // Merge: generic pa (lowest) → azClean overlays
        pa = {
          ...pa,
          source: { template: 'AZ CMDP CSO-1179A', confidence: 0.95 },
          patient: { ...this.stripEmpty(pa.patient), ...azClean.patient },
          providerRequesting: { ...this.stripEmpty(pa.providerRequesting), ...azClean.providerRequesting },
          providerServicing: { ...this.stripEmpty(pa.providerServicing), ...azClean.providerServicing },
          review: { ...this.stripEmpty(pa.review), ...azClean.review },
          services: (azClean.services.length ? azClean.services : pa.services) ?? [],
          dx: { ...this.stripEmpty(pa.dx), ...azClean.dx },
          setting: { ...this.stripEmpty(pa.setting), ...azClean.setting },
          submission: { ...this.stripEmpty(pa.submission), ...azClean.submission }
        };

        // ★ Post-process: fix known-bad values by scanning the FULL OCR text directly.
        //   This doesn't depend on line structure or extractor accuracy.
        //   It uses the combined text from ALL pages as the source of truth.
        this.postProcessArizonaCmdp(pa, allText);
      }

      console.log('Extracted Prior Auth:', pa);

      // ── Final stale guard: don't overwrite if user navigated away ──
      if (myGen !== this._extractionGen) return;

      this.priorAuth = pa;
      this.isLoadingDetails = false;

      // Only run Smart Auth Check if no auth is already linked
      if (!this.linkedAuthMeta) {
        this.runSmartAuthCheckFromExtracted(pa);
      } else {
        this.resetSmartAuthCheckState();
      }

    } catch (e: any) {
      if (myGen !== this._extractionGen) return;  // stale — don't touch state
      this.error = e?.message || 'Failed to parse PDF';
      this.priorAuth = null;
    } finally {
      if (myGen === this._extractionGen) {
        this.isProcessing = false;
      }
    }
  }
  smartAuthCheckInProgress = false;
  smartAuthCheckCompleted = false;
  smartAuthCheckMatched: boolean | null = null;
  smartAuthCheckAuthRequired: boolean | null = null; // true/false when matched; null when NO_MATCH/unmatched
  smartAuthCheckError = '';

  private resetSmartAuthCheckState(): void {
    this.smartAuthCheckInProgress = false;
    this.smartAuthCheckCompleted = false;
    this.smartAuthCheckMatched = null;
    this.smartAuthCheckAuthRequired = null;
    this.smartAuthCheckError = '';
  }

  private runSmartAuthCheckFromExtracted(pa: PriorAuth): void {
    // reset state for every new file
    this.resetSmartAuthCheckState();

    const firstSvc = pa.services?.[0];

    const serviceCode = (firstSvc?.code ?? '').trim() || 'A9600';
    const fromDate = this.toMdyOrFallback(firstSvc?.startDate, '1/1/2026');
    const toDate = this.toMdyOrFallback(firstSvc?.endDate, '1/1/2027');

    const triggerKeySmart = 'SMART_AUTH_CHECK.BUTTON_CLICK';
    const smartFacts: any = {
      serviceCode,
      procedure: { fromDate, toDate }
    };

    this.smartAuthCheckInProgress = true;

    this.rulesengineService.executeTrigger(triggerKeySmart, smartFacts)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => (this.smartAuthCheckInProgress = false))
      )
      .subscribe({
        next: (res: ExecuteTriggerResponse) => {
          const outputs: Record<string, any> = (res as any)?.outputs ?? {};

          const authRequiredRaw =
            this.getOutput(outputs, 'dt.result.AuthRequired') ||
            this.getOutput(outputs, 'result1'); // fallback

          const matched =
            !!(res as any)?.matched &&
            String((res as any)?.status ?? '').toUpperCase() !== 'NO_MATCH';

          this.smartAuthCheckMatched = matched;
          this.smartAuthCheckAuthRequired = matched ? this.isYes(authRequiredRaw) : null;
          this.smartAuthCheckCompleted = true;
        },
        error: (e: any) => {
          console.error('SMART_AUTH_CHECK trigger failed', e);
          this.smartAuthCheckError = 'Smart Auth Check could not be completed.';
          this.smartAuthCheckCompleted = false;
          this.smartAuthCheckMatched = null;
          this.smartAuthCheckAuthRequired = null;
        }
      });
  }

  private toMdyOrFallback(value: any, fallback: string): string {
    if (value === null || value === undefined) return fallback;
    if (value instanceof Date && !isNaN(value.getTime())) {
      const m = value.getMonth() + 1;
      const d = value.getDate();
      const y = value.getFullYear();
      return `${m}/${d}/${y}`;
    }

    const s = String(value).trim();
    if (!s) return fallback;

    // Already in M/D/YYYY (or MM/DD/YYYY) format
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) return s;

    // Convert YYYY-MM-DD (or YYYY-MM-DDTHH:mm...) -> M/D/YYYY
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (m) {
      const y = Number(m[1]);
      const mo = Number(m[2]);
      const d = Number(m[3]);
      if (!isNaN(y) && !isNaN(mo) && !isNaN(d)) return `${mo}/${d}/${y}`;
    }

    // If user typed relative date tokens (D, D+1, etc) or any other format, pass through as-is.
    // Backend may still be able to interpret it; otherwise the rule may no-match.
    return s;
  }

  private getOutput(outputs: Record<string, any>, key: string): string {
    const v = (outputs ?? ({} as any))[key];
    if (v === null || v === undefined) return '';
    return String(v).trim();
  }

  private isYes(v: any): boolean {
    const s = String(v ?? '').trim().toLowerCase();
    return s === 'y' || s === 'yes' || s === 'true' || s === '1';
  }

  /**
   * Strips undefined, null, and empty-string values from a shallow object.
   * Prevents spread-merge from overwriting good values with empty ones
   * when a form-specific extractor returns explicit undefined keys.
   */
  private stripEmpty<T extends Record<string, any>>(obj: T | undefined | null): Partial<T> {
    if (!obj) return {} as Partial<T>;
    const out: any = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v !== undefined && v !== null && v !== '') {
        out[k] = v;
      }
    }
    return out;
  }

  /**
   * Post-process an already-extracted PriorAuth for AZ CMDP CSO-1179A forms.
   * Instead of building a full extraction from scratch (which fails when OCR
   * text structure varies), this method FIXES specific known-bad values
   * by scanning the raw OCR text with loose patterns.
   *
   * Mutates `pa` in place.
   */
  private postProcessArizonaCmdp(pa: PriorAuth, ocrText: string): void {
    const t = ocrText;

    // ── Helper: collapse OCR stutter-spaces ("Mat t hew" → "Matthew") ──
    const cleanName = (raw: string): string => {
      let prev = '', curr = raw;
      while (curr !== prev) {
        prev = curr;
        curr = curr.replace(/([A-Za-z])\s([a-z])/g, '$1$2');
      }
      return curr.replace(/\s{2,}/g, ' ').trim();
    };

    // ── Fix provider names: collapse OCR stutter-spaces ──
    if (pa.providerRequesting?.name) {
      pa.providerRequesting.name = cleanName(pa.providerRequesting.name);
    }
    if (pa.providerServicing?.name) {
      pa.providerServicing.name = cleanName(pa.providerServicing.name);
    }
    if (pa.patient?.name) {
      pa.patient.name = cleanName(pa.patient.name);
    }

    // ── Fix NPI: find ALL 7-10 digit numbers near "NPI NO." in the text ──
    // The generic extractor often truncates these. We ALWAYS override because
    // existing values are known to be wrong (truncated) for AZ forms.
    const npiPattern = /NPI\s+NO\.?\s*[:\s]*(\d{7,10})/gi;
    const npiHits: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = npiPattern.exec(t)) !== null) {
      npiHits.push(m[1]);
    }

    // Also try: NPI number on its own line or after other text
    if (npiHits.length === 0) {
      const altNpi = /NPI\s+NO\.?[\s\S]{0,30}?(\d{7,10})/gi;
      while ((m = altNpi.exec(t)) !== null) {
        npiHits.push(m[1]);
      }
    }

    if (npiHits.length > 0) {
      // ALWAYS override — the extractor often truncates NPI values.
      // First NPI in text = referring physician; second = servicing provider.
      if (!pa.providerRequesting) pa.providerRequesting = {};
      pa.providerRequesting.npi = npiHits[0];

      if (npiHits.length > 1) {
        if (!pa.providerServicing) pa.providerServicing = {};
        pa.providerServicing.npi = npiHits[1];
      }
    }

    // ── Fix address: strip form label boilerplate ──
    if (pa.providerRequesting?.address) {
      pa.providerRequesting.address = pa.providerRequesting.address
        .replace(/\(?\s*No\.?,?\s*Street,?\s*City,?\s*State,?\s*ZIP\s*\)?\s*/gi, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
    }
    if (pa.providerServicing?.address) {
      pa.providerServicing.address = pa.providerServicing.address
        .replace(/\(?\s*No\.?,?\s*Street,?\s*City,?\s*State,?\s*ZIP\s*\)?\s*/gi, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
    }

    // ── Fix service code: find HCPCS pattern (letter + 4 digits, e.g. A9604) ──
    // The generic extractor often grabs the P.O. Box number (29202) by mistake
    const hcpcsPattern = /\b([A-Z]\d{4})\b/g;
    const hcpcsHits: string[] = [];
    while ((m = hcpcsPattern.exec(t)) !== null) {
      const val = m[1];
      if (/^[A-Z]\d{4}$/.test(val)) hcpcsHits.push(val);
    }

    // Looser fallback: OCR may insert a space in the code ("A 9604" or "A96 04")
    if (hcpcsHits.length === 0) {
      const looseHcpcs = /\b([A-Z])\s?(\d)\s?(\d)\s?(\d)\s?(\d)\b/g;
      while ((m = looseHcpcs.exec(t)) !== null) {
        const code = m[1] + m[2] + m[3] + m[4] + m[5];
        // Skip false positives that look like form IDs or zip codes
        if (!/^[A-Z]0{4}$/.test(code)) hcpcsHits.push(code);
      }
    }

    // Also grab the description from the HCPCS line if possible
    const hcpcsLineMatch = t.match(
      /\b([A-Z]\d{4})\s+([A-Z][A-Z\s\-\/]+?)(?:\s+\$[\d,.]+|$)/im
    );

    // ── Fix service dates: find date patterns near form date labels ──
    const startMatch = t.match(/DATE\s+SERVICE\s+TO\s+BEGIN[\s\S]{0,50}?(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
    const endMatch = t.match(/TO\s+END[\s\S]{0,50}?(\d{1,2}\/\d{1,2}\/\d{2,4})/i);

    // Broader fallback: search near "BEGIN" and "END" keywords
    const startMatch2 = !startMatch ? t.match(/\bBEGIN\b[\s\S]{0,30}?(\d{1,2}\/\d{1,2}\/\d{2,4})/i) : null;
    const endMatch2 = !endMatch ? t.match(/\bTO\s+END\b[\s\S]{0,80}?(\d{1,2}\/\d{1,2}\/\d{2,4})/i) : null;
    const finalStart = startMatch?.[1] || startMatch2?.[1];
    const finalEnd = endMatch?.[1] || endMatch2?.[1];

    // ── Fix servicing provider: find name after "PROVIDER'S NAME" ──
    // Use a very loose apostrophe pattern: any single character between R and S
    const servicingMatch = t.match(
      /PROVIDER.?S\s+NAME\s*\([^)]*\)\s*[\n\r]+\s*([A-Z][a-z]+(?:,\s*[A-Z][a-z]+)?)/i
    );

    // Also try: the name might be on the same line or with different formatting
    const servicingMatch2 = t.match(
      /AHCCCS\s+REGISTERED[\s\S]*?PROVIDER.?S\s+NAME[^)]*\)\s*[\s\n\r]*([A-Z][a-zA-Z]+,?\s*[A-Z]?[a-zA-Z]*)/i
    );

    // ── Fix servicing provider address ──
    const servicingAddrMatch = t.match(
      /PROVIDER.?S\s+ADDRESS\s*\([^)]*\)\s*[\n\r]+\s*(.+?)(?:\s*[\n\r]|$)/i
    );

    // ── Apply fixes to services ──
    const svc = pa.services?.[0];
    if (svc) {
      // Fix service code — ALWAYS override if current code doesn't look like HCPCS (letter+4digits)
      if (hcpcsHits.length > 0 && (!svc.code || !/^[A-Z]\d{4}$/.test(svc.code))) {
        svc.code = hcpcsHits[0];
      }
      // Fix description — fill if missing
      if (hcpcsLineMatch?.[2] && !svc.description) {
        svc.description = hcpcsLineMatch[2].trim();
      }
      // Fix dates — ALWAYS override if we found dates near the form labels
      // Existing values are often undefined or wrong for AZ forms
      if (finalStart) {
        svc.startDate = finalStart;
      }
      if (finalEnd) {
        svc.endDate = finalEnd;
      }
      // Fix diagnosisCode from dx if missing
      if (!svc.diagnosisCode && pa.dx?.codes?.[0]) {
        svc.diagnosisCode = pa.dx.codes[0];
      }
    } else if (hcpcsHits.length > 0 || finalStart || finalEnd) {
      // No services from extractors — build one from scratch
      if (!pa.services) pa.services = [];
      pa.services.push({
        code: hcpcsHits[0] ?? '',
        description: hcpcsLineMatch?.[2]?.trim() ?? '',
        startDate: finalStart ?? '',
        endDate: finalEnd ?? '',
        diagnosisCode: pa.dx?.codes?.[0] ?? '',
        diagnosisDescription: pa.dx?.description ?? ''
      });
    }

    // ── Apply servicing provider fix ──
    const svcProvName = (servicingMatch?.[1] ?? servicingMatch2?.[1] ?? '').trim();
    if (svcProvName && svcProvName.length > 1) {
      if (!pa.providerServicing) pa.providerServicing = {};
      if (!pa.providerServicing.name) {
        pa.providerServicing.name = cleanName(svcProvName);
      }
    }

    // ── Apply servicing address fix ──
    if (servicingAddrMatch?.[1]) {
      const addr = servicingAddrMatch[1]
        .replace(/\(?\s*No\.?,?\s*Street,?\s*City,?\s*State,?\s*ZIP\s*\)?\s*/gi, '')
        .trim();
      if (addr && (!pa.providerServicing?.address || pa.providerServicing.address.length < 3)) {
        if (!pa.providerServicing) pa.providerServicing = {};
        pa.providerServicing.address = addr;
      }
    }

    // ── Fix review type ──
    if (/EMERGENCY\s+URGENT/i.test(t)) {
      if (!pa.review) pa.review = {};
      pa.review.type = 'Urgent';
    }

    // ── Fix dx codes array ──
    if (pa.dx?.description && (!pa.dx.codes || pa.dx.codes.length === 0)) {
      pa.dx.codes = [pa.dx.description.split(/[\s,]+/)[0]];
    }

    console.log('AZ CMDP post-processed pa:', pa);
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

  private async getSelectedFaxPdfBytesOrThrow(): Promise<Uint8Array> {
    // Prefer already-loaded bytes (set during openPreview)
    if (this.currentFaxBytes && this.currentFaxBytes.length) {
      return this.currentFaxBytes;
    }

    const faxId = this.selectedFax?.faxId;
    if (!faxId) {
      throw new Error('No fax selected.');
    }

    // Fetch the fax again and extract bytes
    const res: any = await firstValueFrom(this.api.getFaxFileById(faxId));
    const fileBytes = res?.fileBytes ?? res?.FileBytes ?? null;
    const contentType = res?.contentType ?? res?.ContentType ?? 'application/pdf';
    const fileUrl = res?.url ?? res?.Url ?? null;

    this.currentFaxContentType = contentType;
    this.currentFaxOriginalName = this.selectedFax?.fileName ?? 'preview.pdf';

    if (fileBytes) {
      const u8 = this.base64ToUint8Array(fileBytes);
      this.currentFaxBytes = u8;
      return u8;
    }

    if (fileUrl) {
      const ab = await firstValueFrom(this.http.get(fileUrl, { responseType: 'arraybuffer' }));
      const u8 = new Uint8Array(ab);
      this.currentFaxBytes = u8;
      return u8;
    }

    throw new Error('No PDF bytes available for this fax.');
  }


  async splitCurrentFaxOnClient(): Promise<void> {
    if (!this.selectedFax || !this.selectedFax.pageCount || this.selectedFax.pageCount < 2) {
      this.toast('Not enough pages to split.', true);
      return;
    }

    const total = this.selectedFax.pageCount;
    const firstRaw: any = this.splitFirstPageCount;
    const first = Number.isFinite(Number(firstRaw)) ? Math.trunc(Number(firstRaw)) : 1;

    if (first <= 0 || first >= total) {
      this.toast(`First document pages must be between 1 and ${total - 1}.`, true);
      return;
    }

    this.isSplitting = true;
    this.saving = true;

    try {
      // Ensure we have raw PDF bytes. Prefer cached preview bytes; otherwise fetch from API.
      let bytes = this.currentFaxBytes;

      if (!bytes || bytes.length === 0) {
        const res: any = await firstValueFrom(this.api.getFaxFileById(this.selectedFax.faxId ?? 0));
        const fileBytes = res.fileBytes ?? res.FileBytes ?? null;

        if (!fileBytes) {
          throw new Error('No PDF bytes returned from server.');
        }

        bytes = this.base64ToUint8Array(fileBytes);
        this.currentFaxBytes = bytes;
        this.currentFaxContentType = res.contentType ?? res.ContentType ?? 'application/pdf';
        this.currentFaxOriginalName = this.selectedFax.fileName ?? 'document.pdf';
      }

      const originalPdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const pageCount = originalPdf.getPageCount();

      // Split indices (0-based)
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

      const file1 = new File([new Blob([bytes1], { type: 'application/pdf' })], file1Name, { type: 'application/pdf' });
      const file2 = new File([new Blob([bytes2], { type: 'application/pdf' })], file2Name, { type: 'application/pdf' });

      const parentFaxId = this.selectedFax.faxId ?? null;
      const metaJson = JSON.stringify({ source: 'UI:Faxes', action: 'Split', parentFaxId });

      // Save both split parts as children (suppress per-file toasts/reloads; we'll do one at end)
      await this.saveFileData(null, file1, {
        parentFaxId,
        inheritFrom: this.selectedFax,
        metaJson,
        suppressToast: true,
        suppressReload: true
      });
      await this.saveFileData(null, file2, {
        parentFaxId,
        inheritFrom: this.selectedFax,
        metaJson,
        suppressToast: true,
        suppressReload: true
      });

      this.toast(`Split saved: "${file1Name}" and "${file2Name}".`, false);
      this.reload();
    } catch (e) {
      console.error('Split failed', e);
      this.toast('Split failed. Please try again.', true);
    } finally {
      this.isSplitting = false;
      this.saving = false;
    }
  }

  // FaxesComponent




  openSplitDialog(row: FaxFile): void {
    // The row-menu "Split" should behave the same as splitting from the preview pane:
    // 1) Open the preview for this fax
    // 2) Initialize the split count to 1 (or max-1)
    // 3) User can then click "Split & Save" (preview pane button)
    this.openPreview(row);
    const pc = row.pageCount ?? 0;
    this.splitFirstPageCount = pc > 1 ? 1 : null;
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

  async confirmDelete(row: FaxFile): Promise<void> {
    if (!row || !row.faxId) return;

    const nowIso = new Date().toISOString();
    const deletedBy = this.currentUserId ?? row.deletedBy ?? 1;

    // Build target list: parent + its children if applicable
    const targets: FaxFile[] = [];
    if (row.hasChildren && row.children?.length) {
      targets.push(row, ...(row.children || []));
    } else {
      targets.push(row);
    }

    this.saving = true;
    try {
      await Promise.all(
        targets.map(t => {
          // reuse saveUpdate plumbing by setting selectedFax per item
          this.selectedFax = {
            ...t,
            status: 'Deleted',
            deletedOn: nowIso,
            deletedBy,
            updatedBy: deletedBy
          };
          // suppress duplicate toasts/reloads
          return (async () => {
            const toSave: any = {
              faxId: this.selectedFax!.faxId,
              workBasket: "2",
              fileName: this.selectedFax!.fileName,
              priority: this.selectedFax!.priority,
              status: this.selectedFax!.status,
              updatedOn: nowIso,
              updatedBy: deletedBy,
              deletedOn: nowIso,
              deletedBy
            };
            return firstValueFrom(this.api.updateFaxFile(toSave));
          })();
        })
      );

      this.toast(
        row.hasChildren
          ? `Deleted "${row.fileName}" and its split pages.`
          : `Deleted "${row.fileName}".`,
        false
      );
      this.reload();
    } catch (e) {
      console.error('Delete failed', e);
      this.toast(`Delete failed for "${row.fileName}".`, true);
    } finally {
      this.saving = false;
      this.deletingFaxId = null;
      this.deleteMessage = '';
    }
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


  onMemberClick(memberId: string, memberName: string, memberDetailsId: string): void {
    console.log('Member clicked:', memberId, memberName, memberDetailsId);
    const tabLabel = `Member: ${memberName}`;
    const tabRoute = `/member-info/${memberId}`;

    const existingTab = this.headerService.getTabs().find(tab => tab.route === tabRoute);


    if (existingTab) {
      this.headerService.selectTab(tabRoute);

      const mdId = existingTab.memberDetailsId ?? null;
      if (mdId) sessionStorage.setItem('selectedMemberDetailsId', mdId);
      this.router.navigateByUrl('/', { skipLocationChange: true }).then(() => {
        this.router.navigate([tabRoute]);
      });
    } else {
      this.headerService.addTab(tabLabel, tabRoute, memberId, memberDetailsId);
      sessionStorage.setItem('selectedMemberDetailsId', memberDetailsId);
      this.router.navigateByUrl('/', { skipLocationChange: true }).then(() => {
        this.router.navigate([tabRoute]);
      });
    }


  }

  // ============================================================
  // Fax → Auth Form Methods
  // ============================================================

  openAuthForm(): void {
    if (!this.priorAuth || !this.selectedFax) return;

    const pa = this.priorAuth;

    let authClassName = 'Inpatient';
    if ((pa as any).setting?.outpatient && !(pa as any).setting?.inpatient) {
      authClassName = 'Outpatient';
    }

    // NOTE: pa.review?.type is the request classification ("Prior Authorization",
    // "Concurrent Review" etc.) — this is NOT the UM template type name.
    // Default to "Observation Stay" which is the most common template.
    const authTypeName = 'Observation Stay';

    const parseAddress = (addr: string | undefined) => {
      if (!addr) return {};
      const parts = addr.split(',').map(s => s.trim());
      return {
        address: parts[0] || '',
        city: parts[1] || '',
        state: parts[2] || '',
        zip: parts[3] || ''
      };
    };

    const reqAddr = parseAddress((pa as any).providerRequesting?.address);
    const svcAddr = parseAddress((pa as any).providerServicing?.address);

    this.currentFaxPrefill = {
      mode: 'fax',
      memberId: this.selectedFax.memberId ?? 0,
      memberDetailsId: this.selectedFax.memberDetailsId ?? 0,
      faxId: this.selectedFax.faxId ?? 0,

      authClassName,
      authTypeName,

      diagnosisCodes: (pa as any).dx?.codes ?? ((pa as any).services || [])
        .map((s: any) => s.diagnosisCode)
        .filter(Boolean),

      services: ((pa as any).services ?? []).map((s: any) => ({
        code: s.code,
        description: s.description,
        startDate: s.startDate,
        endDate: s.endDate,
        quantity: s.quantity ?? 1
      })),

      requestingProvider: (pa as any).providerRequesting ? {
        name: (pa as any).providerRequesting.name,
        firstName: (pa as any).providerRequesting.firstName,
        lastName: (pa as any).providerRequesting.lastName,
        npi: (pa as any).providerRequesting.npi,
        phone: (pa as any).providerRequesting.phone,
        fax: (pa as any).providerRequesting.fax,
        ...reqAddr
      } : undefined,

      servicingProvider: (pa as any).providerServicing ? {
        name: (pa as any).providerServicing.name || (pa as any).providerServicing.facility,
        firstName: (pa as any).providerServicing.firstName,
        lastName: (pa as any).providerServicing.lastName,
        npi: (pa as any).providerServicing.npi,
        phone: (pa as any).providerServicing.phone,
        fax: (pa as any).providerServicing.fax,
        ...svcAddr
      } : undefined,

      requestDatetime: (pa as any).submission?.date,
      notes: (pa as any).notes,
      priorAuth: pa
    };

    this.showAuthForm = true;

    setTimeout(() => {
      const pane = document.querySelector('.pane-middle');
      if (pane) pane.scrollTop = 0;
    }, 100);
  }

  cancelAuthForm(): void {
    if (this.authDetailsRef?.authHasUnsavedChanges?.()) {
      if (!confirm('You have unsaved changes. Discard and go back?')) return;
    }
    this.showAuthForm = false;
    this.currentFaxPrefill = null;
  }

  onAuthSaved(event: { authNumber: string; authId: number }): void {
    this.showAuthForm = false;
    this.currentFaxPrefill = null;

    // Immediately reflect linked state in the preview
    const nowIso = new Date().toISOString();
    this.linkedAuthMeta = {
      linkedAuthNumber: event.authNumber,
      linkedAuthId: event.authId,
      linkedAt: nowIso
    };
    this.resetSmartAuthCheckState();

    if (this.selectedFax?.faxId) {
      let existingMeta: any = {};
      if (this.selectedFax.metaJson) {
        try { existingMeta = JSON.parse(this.selectedFax.metaJson); } catch { /* ignore */ }
      }

      const updatedMeta = {
        ...existingMeta,
        linkedAuthNumber: event.authNumber,
        linkedAuthId: event.authId,
        linkedAt: nowIso
      };

      const toSave: any = {
        faxId: this.selectedFax.faxId,
        workBasket: '2',
        fileName: this.selectedFax.fileName,
        priority: this.selectedFax.priority,
        status: 'Processed',
        metaJson: JSON.stringify(updatedMeta),
        updatedOn: nowIso,
        updatedBy: this.currentUserId ?? 1
      };

      this.api.updateFaxFile(toSave).subscribe({
        next: () => {
          this.toast(`Authorization ${event.authNumber} created and linked to fax.`);
          this.reload();
        },
        error: (err) => {
          console.error('Failed to link fax to auth', err);
          this.toast(`Authorization ${event.authNumber} created but fax linking failed.`, true);
          this.reload();
        }
      });
    } else {
      this.toast(`Authorization ${event.authNumber} created successfully.`);
      this.reload();
    }
  }

  getLinkedAuth(row: FaxFile): string | null {
    if (!row.metaJson) return null;
    try {
      const meta = JSON.parse(row.metaJson);
      return meta?.linkedAuthNumber || null;
    } catch {
      return null;
    }
  }

  /** Parse linked auth metadata from a fax's metaJson string. */
  private parseLinkedAuthMeta(metaJson: string | null | undefined): typeof this.linkedAuthMeta {
    if (!metaJson) return null;
    try {
      const meta = JSON.parse(metaJson);
      if (meta?.linkedAuthNumber) {
        return {
          linkedAuthNumber: meta.linkedAuthNumber,
          linkedAuthId: meta.linkedAuthId ?? null,
          linkedAt: meta.linkedAt ?? null,
          parentFaxId: meta.parentFaxId ?? null,
          ...meta
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  /** Navigate to auth detail page when user clicks the auth number link. */
  onAuthClick(authNumber: string, authId: number): void {
    if (!authId) return;

    const memberId = this.selectedFax?.memberId;
    const memberDetailsId = this.selectedFax?.memberDetailsId;

    if (memberId && memberDetailsId) {
      const tabLabel = `Auth: ${authNumber}`;
      const tabRoute = `/member-info/${memberId}`;

      const existingTab = this.headerService.getTabs().find(tab => tab.route === tabRoute);

      sessionStorage.setItem('selectedAuthId', String(authId));
      sessionStorage.setItem('selectedAuthNumber', authNumber);
      sessionStorage.setItem('selectedMemberDetailsId', String(memberDetailsId));

      if (existingTab) {
        this.headerService.selectTab(tabRoute);
        this.router.navigateByUrl('/', { skipLocationChange: true }).then(() => {
          this.router.navigate([tabRoute]);
        });
      } else {
        this.headerService.addTab(tabLabel, tabRoute, String(memberId), String(memberDetailsId));
        this.router.navigateByUrl('/', { skipLocationChange: true }).then(() => {
          this.router.navigate([tabRoute]);
        });
      }
    } else {
      console.log('Auth clicked:', authNumber, authId, '— no member context');
      this.toast(`Authorization ${authNumber} (ID: ${authId})`, false);
    }
  }

}

function cryptoRandom(): string {
  const bytes = new Uint8Array(16);
  (window.crypto || (window as any).msCrypto).getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}


