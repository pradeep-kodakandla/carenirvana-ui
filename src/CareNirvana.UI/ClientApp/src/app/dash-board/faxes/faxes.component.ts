import { Component, OnInit, ViewChild, ElementRef, DestroyRef, AfterViewInit } from '@angular/core';
import { trigger, transition, style, animate } from '@angular/animations';
import { MatTableDataSource } from '@angular/material/table';
import { MatSort } from '@angular/material/sort';
import { MatPaginator } from '@angular/material/paginator';
import { MatSnackBar } from '@angular/material/snack-bar';
import { finalize, firstValueFrom } from 'rxjs';
import { DashboardServiceService, FaxFile as ApiFaxFile } from 'src/app/service/dashboard.service.service';
import { PdfOcrService, OcrResult } from 'src/app/service/pdfocr.service';
import { extractPriorAuth, extractTexasFromText, extractArizonaFromText, extractNhsFromFields, isNevada } from 'src/app/service/priorauth.extractor';
import { detectForms, isMultiForm, splitByForms, FormSpan, SplitResult } from 'src/app/service/multi-form-detector';
import { extractNhsFromText, isNhsText } from 'src/app/service/nhs-text-adapter';
import { PriorAuth } from 'src/app/service/priorauth.schema';
import { HttpClient } from '@angular/common/http';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { PDFDocument, rgb } from 'pdf-lib';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SmartCheckResultDialogComponent, SmartCheckDialogAction, SmartCheckDialogData } from 'src/app/member/UM/steps/authsmartcheck/smartcheck-result-dialog.component';
import { RulesengineService, ExecuteTriggerResponse } from 'src/app/service/rulesengine.service';
import { HeaderService } from 'src/app/service/header.service';
import { AuthDetailApiService } from 'src/app/service/authdetailapi.service';
import { MemberSummary } from 'src/app/service/dashboard.service.service';
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

// ─────────────────────────────────────────────────────────────────────────────
// Auto-Authorization Pipeline types
// ─────────────────────────────────────────────────────────────────────────────

export type PipelineStepStatus = 'pending' | 'running' | 'success' | 'skipped' | 'error';

export interface PipelineStep {
  key: string;
  label: string;
  detail: string;
  status: PipelineStepStatus;
}

export type PipelineOutcome =
  | 'auto-approved'    // Auth created automatically — fax moved to Processed
  | 'requires-review'  // Rules engine returned AuthApprove ≠ Yes → user must review
  | 'no-member-match'  // Member could not be resolved from extracted data
  | 'no-rules-match'   // Rules engine returned NO_MATCH / unmatched
  | 'error';           // Unexpected failure at any step

export interface AutoAuthPipeline {
  id: string;
  faxId: number | null;
  fileName: string;
  steps: PipelineStep[];
  outcome: PipelineOutcome | null;
  authNumber: string | null;
  authId: number | null;
  errorMessage: string;
  dismissed: boolean;
  startedAt: Date;
}

@Component({
  selector: 'app-faxes',
  templateUrl: './faxes.component.html',
  styleUrl: './faxes.component.css',
  animations: [
    trigger('hlLocatorAnim', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(-8px)' }),
        animate('200ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))
      ]),
      transition(':leave', [
        animate('150ms ease-in', style({ opacity: 0, transform: 'translateY(-8px)' }))
      ])
    ])
  ]
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
  statusChipFilter: 'open' | 'processed' | 'all' = 'open';
  openFaxCount = 0;
  processedFaxCount = 0;

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
  priorAuth: PriorAuth | null = null;

  // ── AI Summary (auto-generated on preview) ────────────────────────
  aiSummaryLoading = false;
  aiSummaryError: string | null = null;
  aiSummary: string | null = null;
  aiParsedSummary: string | null = null;
  aiParsedFlags: { title: string; body: string }[] = [];
  aiClinicalMatch: string | null = null;
  aiRecommendation: string | null = null;
  aiRecommendationType: 'approve' | 'deny' | 'pend' | 'info' = 'info';
  uploadPercent = 0;
  currentUserId?: number;
  previewUrl?: SafeResourceUrl | null = null;
  previewOpen = false;
  showPreview = false;
  isLoadingDetails: boolean = false;
  currentIndex: number = -1;

  private _extractionGen = 0;
  private _faxFetchSub: { unsubscribe(): void } | null = null;

  splitFirstPageCount: number | null = 1;
  isSplitting = false;
  splitMode = false;
  splitCompleted = false;

  // ── Field Highlight ────────────────────────────────────────────────
  hlKey: string | null = null;
  hlLabel: string | null = null;
  hlValue: string | null = null;
  hlCategory: string = 'patient';
  hlIsProcessing = false;
  hlMatchCount = 0;
  hlStatus: 'idle' | 'processing' | 'found' | 'not-found' = 'idle';
  private _rawPreviewUrl: string | null = null;
  private _highlightedBlobUrl: string | null = null;

  private _pdfTextItems: Array<{
    str: string; pageIndex: number;
    x: number; y: number; w: number; h: number;
  }> = [];
  private _pdfTextExtracted = false;
  private _pdfjsLib: any = null;
  private _ocrByPage: Array<{ page: number; text: string }> = [];

  private readonly HL_COLORS: Record<string, { r: number; g: number; b: number }> = {
    patient: { r: 0.15, g: 0.39, b: 0.92 },
    review: { r: 0.49, g: 0.23, b: 0.93 },
    service: { r: 0.85, g: 0.47, b: 0.02 },
    provider: { r: 0.02, g: 0.59, b: 0.41 },
    submission: { r: 0.39, g: 0.40, b: 0.95 },
  };

  loadedMemberId: number | null = null;

  faxesRaw: FaxFile[] = [];
  groupedFaxes: FaxFile[] = [];
  allFaxes: any[] = [];

  faxWorkBaskets: { id: number; name: string; count: number }[] = [];
  selectedWorkBasket: string | null = null;
  totalFaxCount = 0;

  // ── Linked Auth metadata ────────────────────────────────────────────
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
  @ViewChild('iframeA') iframeA?: ElementRef<HTMLIFrameElement>;
  @ViewChild('iframeB') iframeB?: ElementRef<HTMLIFrameElement>;

  // ── Discard Changes Dialog ───────────────────────────────────────────
  showDiscardDialog = false;
  discardDialogContext: 'backToDetails' | 'closePreview' = 'backToDetails';
  private _pendingDiscardAction: (() => void) | null = null;

  pdfActiveFrame: 'A' | 'B' = 'A';
  private _pendingFrame: 'A' | 'B' | null = null;

  // ── Auto-Authorization Pipeline ─────────────────────────────────────
  autoAuthPipelines: AutoAuthPipeline[] = [];

  /**
   * Holds the pipeline currently driving a silent auto-save.
   * Cleared in onAuthSaved() / onAutoAuthCancelled() after Steps 4 and 5.
   */
  private _activeAutoAuthPipeline: AutoAuthPipeline | null = null;

  /**
   * Resolves once a specific pipeline's hidden auth-save has fired
   * authSaved or authCancelled. Used by runPipelineForFile() so the
   * multi-form orchestrator can `await` each pipeline before launching
   * the next — this is what stops _activeAutoAuthPipeline from being
   * stomped by a sibling pipeline mid-save (which would otherwise leak
   * past the multi-form run and break the next manual Save Authorization
   * click in Fax mode).
   *
   * Keyed by pipeline.id; the resolver is removed from the map as soon
   * as it fires. Always settle (don't reject) so the orchestrator's
   * for-loop continues on failure.
   */
  private _pipelineDoneResolvers = new Map<string, () => void>();

  /**
   * Controls the hidden pipeline <app-authdetails> instance.
   * true  → Angular renders the component in a display:none container so it
   *         can initialise, load the template, prefill fields, and call save()
   *         entirely without any visible UI change for the user.
   * false → component is destroyed (not in DOM).
   *
   * Deliberately separate from showAuthForm so the manual Generate Auth panel
   * is completely unaffected by the pipeline.
   */
  isAutoSavePipelineActive = false;

  /**
   * Prefill data sent exclusively to the hidden pipeline instance.
   * Separate from currentFaxPrefill (used by the manual auth form).
   */
  pipelineFaxPrefill: FaxAuthPrefill | null = null;

  /** ViewChild for the hidden pipeline auth instance. */
  @ViewChild('pipelineAuthRef') pipelineAuthRef?: AuthdetailsComponent;

  /**
   * Controls the pipeline progress popup dialog.
   * Set to true when the first pipeline is created; user closes it explicitly
   * via closePipelinePopup() once all pipelines have a non-null outcome.
   */
  showPipelinePopup = false;

  /** True when all visible pipelines have reached a terminal outcome. */
  get allPipelinesComplete(): boolean {
    const visible = this.visiblePipelines;
    return visible.length > 0 && visible.every(p => p.outcome !== null);
  }

  closePipelinePopup(): void {
    if (!this.allPipelinesComplete) return; // block while still running
    this.showPipelinePopup = false;
    this.dismissAllCompletedPipelines();
  }

  /** Minimise the popup without dismissing pipelines (user can re-open via notification). */
  minimisePipelinePopup(): void {
    this.showPipelinePopup = false;
  }

  /**
   * Backdrop click — never traps the user. If everything finished, behave like
   * Close (dismiss cards too). Otherwise behave like Minimise (hide the modal,
   * keep cards in the side notification pill so processing keeps running).
   */
  onPipelineBackdropClick(): void {
    if (this.allPipelinesComplete) this.closePipelinePopup();
    else this.minimisePipelinePopup();
  }

  /**
   * Close-button click — same safety net as the backdrop. We used to disable
   * this button while pipelines were running, but that meant a stuck pipeline
   * (e.g. hidden auth-save threw silently) trapped the user behind the modal.
   * Now the button always works: minimise while running, full close when done.
   */
  onPipelineCloseClick(): void {
    if (this.allPipelinesComplete) this.closePipelinePopup();
    else this.minimisePipelinePopup();
  }

  /** Re-open the popup (e.g. if user minimised while steps were running). */
  reopenPipelinePopup(): void {
    if (this.visiblePipelines.length > 0) this.showPipelinePopup = true;
  }

  get visiblePipelines(): AutoAuthPipeline[] {
    return this.autoAuthPipelines.filter(p => !p.dismissed);
  }

  get hasCompletedPipelines(): boolean {
    return this.visiblePipelines.some(p => p.outcome !== null);
  }

  trackByPipelineId(_: number, p: AutoAuthPipeline): string {
    return p.id;
  }

  constructor(private pdfOcr: PdfOcrService, private destroyRef: DestroyRef,
    private api: DashboardServiceService, private sanitizer: DomSanitizer,
    private rulesengineService: RulesengineService,
    private headerService: HeaderService,
    private authDetailApi: AuthDetailApiService,
    private router: Router,
    private snackBar: MatSnackBar,
    private http: HttpClient) {
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
    this.showInlineMessage(message, isError ? 'error' : 'success', 4000);
  }

  private pickTexasPage(byPage: { page: number; text: string }[]): number {
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

    return (scored[0]?.score ?? 0) > 0 ? scored[0].page : (byPage[byPage.length - 1]?.page || 1);
  }

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
          value: wb.name,
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

    // Quick search across visible/relevant fax fields (assignedcomplaints-style)
    this.dataSource.filterPredicate = (row: FaxFile, filter: string) => {
      const q = (filter || '').trim().toLowerCase();
      if (!q) return true;

      const set = [
        row?.fileName,
        row?.originalName,
        row?.memberName,
        row?.memberId?.toString(),
        row?.workBasket,
        row?.status,
        row?.processStatus
      ];

      return set.some(v => (v ?? '').toString().toLowerCase().includes(q));
    };
  }

  reload(): void {
    this.loading = true;

    this.api.getFaxFiles(this.search ?? '', this.page, this.pageSize, this.statusFilter)
      .pipe(finalize(() => this.loading = false))
      .subscribe({
        next: (res: FaxFileListResponse) => {
          const rawItems = this.getItems(res);
          const rows = rawItems.map(this.normalizeFax);
          this.faxesRaw = rows;
          this.total = this.getTotal(res);
          this.buildFaxHierarchy();

          if (this.selectedFax) {
            const found = rows.find(x => x.faxId === this.selectedFax!.faxId);
            if (!found) this.selectedFax = undefined;
            else this.selectedFax = found;
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

      if (parentId && parentId > 0 && byId.has(parentId)) {
        const parent = byId.get(parentId)!;
        parent.children!.push(f);
        parent.hasChildren = true;
        f.isChild = true;
      } else {
        roots.push(f);
      }
    });

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
    this.applyWorkBasketFilter();
    this.updateFaxCounts();
  }

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
    this.linkedAuthMeta = this.parseLinkedAuthMeta(row.metaJson ?? row.MetaJson ?? null);

    this._faxFetchSub?.unsubscribe();
    this._faxFetchSub = null;
    this._extractionGen++;

    this.isLoadingDetails = true;
    this.priorAuth = null;
    this.aiSummary = null;
    this.aiParsedSummary = null; this.aiParsedFlags = [];
    this.aiClinicalMatch = null; this.aiRecommendation = null; this.aiRecommendationType = 'info';
    this.aiSummaryError = null;
    this.aiSummaryLoading = false;
    this.splitMode = false;
    this.splitCompleted = false;
    this.hlKey = null;
    this.hlValue = null;
    this.hlMatchCount = 0;
    this.hlStatus = 'idle';
    this._rawPreviewUrl = null;
    this._pdfTextItems = [];
    this._pdfTextExtracted = false;
    this.pdfActiveFrame = 'A';
    this._pendingFrame = null;
    if (this._highlightedBlobUrl) { URL.revokeObjectURL(this._highlightedBlobUrl); this._highlightedBlobUrl = null; }

    this.showPreview = true;

    const data = this.dataSource?.data || [];
    const idx = data.findIndex(d => d.faxId === row.faxId);
    this.currentIndex = idx >= 0 ? idx : 0;

    this._faxFetchSub = this.api.getFaxFileById(row.faxId).subscribe({
      next: (res: any) => {
        const fileBytes = res.fileBytes ?? res.FileBytes ?? null;
        const contentType = res.contentType ?? res.ContentType ?? 'application/pdf';
        const fileUrl = res.url ?? res.Url ?? null;

        const base64 = fileBytes;
        if (base64) {
          const uniqueName = row.fileName || row.originalName || `fax-${row.faxId}.pdf`;
          this.onFileChosen(undefined, base64, uniqueName);
        }

        if (fileBytes) {
          const u8 = this.base64ToUint8Array(fileBytes);
          this.currentFaxBytes = u8;
          this.currentFaxContentType = contentType;
          this.currentFaxOriginalName = row.fileName ?? 'preview.pdf';
          const objUrl = this.makePdfBlobUrl(u8, contentType);
          this._rawPreviewUrl = objUrl;
          this.previewUrl = this.sanitizer.bypassSecurityTrustResourceUrl(objUrl);
          setTimeout(() => this.loadIntoActiveFrame(objUrl), 0);
          return;
        }

        if (fileUrl) {
          this._rawPreviewUrl = fileUrl;
          this.previewUrl = this.sanitizer.bypassSecurityTrustResourceUrl(fileUrl);
          this.currentFaxBytes = null;
          this.currentFaxContentType = contentType;
          this.currentFaxOriginalName = row.fileName ?? 'preview.pdf';
          setTimeout(() => this.loadIntoActiveFrame(fileUrl), 0);
          return;
        }

        this.previewUrl = null;
        this.isLoadingDetails = false;
      },
      error: (err) => {
        console.error('Error fetching fax file:', err);
        this.isLoadingDetails = false;
        this.previewUrl = null;
      }
    });
  }

  closePreview(): void {
    const doClose = () => {
      this._faxFetchSub?.unsubscribe();
      this._faxFetchSub = null;
      this._extractionGen++;

      this.uninstallAuthFormErrorTraps();
      this.showAuthForm = false;
      this.currentFaxPrefill = null;

      this.showPreview = false;
      this.selectedFax = undefined;
      this.previewUrl = null;
      this.currentFaxBytes = null;
      this.currentFaxOriginalName = null;
      this.priorAuth = null;
      this.aiSummary = null;
      this.aiParsedSummary = null; this.aiParsedFlags = [];
      this.aiClinicalMatch = null; this.aiRecommendation = null; this.aiRecommendationType = 'info';
      this.aiSummaryError = null;
      this.aiSummaryLoading = false;
      this.linkedAuthMeta = null;
      this.progress = 0;
      this.error = '';
      this.currentIndex = -1;
      this.splitMode = false;
      this.splitCompleted = false;
      this.hlKey = null;
      this.hlValue = null;
      this.hlMatchCount = 0;
      this.hlStatus = 'idle';
      this._rawPreviewUrl = null;
      this._pdfTextItems = [];
      this._pdfTextExtracted = false;
      this.pdfActiveFrame = 'A';
      this._pendingFrame = null;
      if (this._highlightedBlobUrl) { URL.revokeObjectURL(this._highlightedBlobUrl); this._highlightedBlobUrl = null; }
    };

    if (this.showAuthForm && this.authDetailsRef?.authHasUnsavedChanges?.()) {
      this.discardDialogContext = 'closePreview';
      this._pendingDiscardAction = doClose;
      this.showDiscardDialog = true;
    } else {
      doClose();
    }
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
      const res: any = await this.pdfOcr.extract(file, () => void 0);

      // ── NHS fast path: AcroForm field values are 100% reliable when present ──
      if (isNevada(res?.text ?? '') && res?.formFields && Object.keys(res.formFields).length) {
        const nhs = extractNhsFromFields(res.formFields);
        if (nhs?.patient?.memberId) return nhs.patient.memberId;
      }

      // ── NHS text path: flattened (printed-to-PDF) NHS forms have no live
      //    AcroForm. The text adapter parses the rendered value layer.
      if (isNhsText(res?.text ?? '')) {
        const nhs = extractNhsFromText(res?.text ?? '');
        if (nhs?.patient?.memberId) return nhs.patient.memberId;
      }

      const pa = extractPriorAuth(res?.text ?? '', res?.formFields ?? {});
      const direct = pa?.patient?.memberId ?? null;
      if (direct) return direct;

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

      const isArizona = /CSO-1179A|CMDP|COMPREHENSIVE MEDICAL AND DENTAL PROGRAM/i.test(allText);
      if (isArizona && byPage.length) {
        const formPage = this.pickArizonaPage(byPage);
        const pageText = byPage.find(p => p.page === formPage)?.text ?? '';
        if (pageText) {
          const az = extractArizonaFromText(pageText);
          const azMember = az?.patient?.memberId ?? null;
          if (azMember) return azMember;

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
    opts?: {
      parentFaxId?: number | null;
      inheritFrom?: FaxFile;
      metaJson?: string;
      suppressToast?: boolean;
      suppressReload?: boolean;
      successMessage?: string;
    }
  ): Promise<number | null> {
    let file: File | undefined;

    if (fileOverride) {
      file = fileOverride;
    } else if (e) {
      const input = e.target as HTMLInputElement;
      file = input.files?.[0];
      if (input) input.value = '';
    }

    if (!file) return null;

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

    const inherit = opts?.inheritFrom;
    const priority: 1 | 2 | 3 = (inherit?.priority as 1 | 2 | 3) ?? 2;

    let detectedMemberIdRaw: any =
      inherit?.memberId ??
      (this.priorAuth as any)?.patient?.memberId ??
      null;

    if (
      detectedMemberIdRaw === null ||
      detectedMemberIdRaw === undefined ||
      String(detectedMemberIdRaw).trim() === ''
    ) {
      detectedMemberIdRaw = await this.tryExtractMemberIdFromPdf(file);
    }

    const memberId: number | null =
      detectedMemberIdRaw !== null &&
        detectedMemberIdRaw !== undefined &&
        String(detectedMemberIdRaw).trim() !== ''
        ? (Number(detectedMemberIdRaw) as any)
        : null;

    const memberIdToSend: number | null =
      memberId !== null && Number.isFinite(memberId) ? memberId : null;

    const workBasket: string = ('2' ?? '2') as any;
    const nowIso = new Date().toISOString();
    const uploadedBy: number | null = this.currentUserId ?? null;
    const createdBy: number | null = this.currentUserId ?? null;
    const parentFaxId: number | null = (opts?.parentFaxId ?? null) as any;
    const metaJson: string = opts?.metaJson ?? JSON.stringify({ source: 'UI:Faxes' });

    const payload: (ApiFaxFile & { parentFaxId?: number | null; metaJson?: string }) = {
      fileName: originalName,
      url: undefined,
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

    this.uploading = true;
    this.uploadPercent = 0;

    try {
      // ── Insert the fax record ─────────────────────────────────────────
      const inserted: any = await firstValueFrom(this.api.insertFaxFile(payload as any));

      // insertFaxFile returns { newId: number } — matches DashboardServiceService signature
      const newFaxId: number | null = inserted?.newId ?? null;

      if (!opts?.suppressToast) {
        const msg =
          opts?.successMessage ??
          (parentFaxId
            ? `Split page saved: ${originalName}`
            : `Uploaded successfully: ${originalName}`);
        this.toast(msg, false);
      }

      if (!opts?.suppressReload) {
        this.reload?.();
      }

      // ── ✨ Trigger the Auto-Authorization Pipeline for real user uploads ──
      // Skip split children — they inherit their parent's authorization workflow.
      const isTopLevelUpload = !parentFaxId && !fileOverride;
      if (isTopLevelUpload && newFaxId) {
        this.triggerAutoAuthorizationPipeline(file, newFaxId).catch((err: any) => {
          console.error('[AutoAuth] Unhandled pipeline error', err);
        });
      }

      return newFaxId;
    } catch (err) {
      console.error('insertFaxFile failed', err);
      if (!opts?.suppressToast) {
        this.toast(`Failed to save: ${originalName}`, true);
      }
      return null;
    } finally {
      this.uploading = false;
      this.uploadPercent = 0;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Auto-Authorization Pipeline
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Builds a fresh pipeline state object with all steps initialised to 'pending'.
   */
  private buildPipeline(faxId: number | null, fileName: string): AutoAuthPipeline {
    return {
      id: `pipeline-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      faxId,
      fileName,
      steps: [
        {
          key: 'extract',
          label: 'Extracting Document Data',
          detail: 'Running optical character recognition on the uploaded fax',
          status: 'pending',
        },
        {
          key: 'member',
          label: 'Verifying Member Identity',
          detail: 'Matching extracted identifiers against the member registry',
          status: 'pending',
        },
        {
          key: 'rules',
          label: 'Evaluating Clinical Decision Rules',
          detail: 'Submitting service codes to the authorization rules engine',
          status: 'pending',
        },
        {
          key: 'auth',
          label: 'Provisioning Authorization',
          detail: 'Creating a closed authorization with auto-approval decision',
          status: 'pending',
        },
        {
          key: 'finalize',
          label: 'Finalizing Record',
          detail: 'Linking authorization to fax and updating processing status',
          status: 'pending',
        },
      ],
      outcome: null,
      authNumber: null,
      authId: null,
      errorMessage: '',
      dismissed: false,
      startedAt: new Date(),
    };
  }

  /** Updates a single step's status and optionally its detail text. */
  private setStep(
    pipeline: AutoAuthPipeline,
    key: string,
    status: PipelineStepStatus,
    detail?: string
  ): void {
    const step = pipeline.steps.find(s => s.key === key);
    if (!step) return;
    step.status = status;
    if (detail !== undefined) step.detail = detail;
    // Trigger Angular change detection on the array reference
    this.autoAuthPipelines = [...this.autoAuthPipelines];
  }

  /**
   * Marks all steps AFTER startKey as 'skipped'.
   * Called whenever the pipeline terminates early.
   */
  private skipRemainingSteps(pipeline: AutoAuthPipeline, afterKey: string): void {
    const idx = pipeline.steps.findIndex(s => s.key === afterKey);
    if (idx < 0) return;
    for (let i = idx + 1; i < pipeline.steps.length; i++) {
      pipeline.steps[i].status = 'skipped';
      pipeline.steps[i].detail = 'Step skipped — pipeline terminated at an earlier stage';
    }
    this.autoAuthPipelines = [...this.autoAuthPipelines];
  }

  /**
   * Runs the OCR extractors against a File object, mirrors the logic in
   * onFileChosen() so the pipeline stays consistent with the preview pane.
   */
  private async runExtractors(file: File): Promise<PriorAuth> {
    const res = await this.pdfOcr.extract(file, () => void 0);
    const allText: string = res?.text ?? '';
    const byPage: Array<{ page: number; text: string }> =
      (res.byPage ?? []).map((p: any, i: number) => ({
        page: Number(p?.page ?? (i + 1)),
        text: String(p?.text ?? '')
      }));

    let pa = extractPriorAuth(allText, res?.formFields ?? {});

    const isTexas = /TEXAS STANDARD PRIOR AUTHORIZATION|NOFR001/i.test(allText);
    const isArizona = /CSO-1179A|CMDP|COMPREHENSIVE MEDICAL AND DENTAL PROGRAM/i.test(allText);
    const missingCore =
      !(pa.patient?.name) ||
      !(pa.patient?.memberId) ||
      !(pa.services?.[0]?.code) ||
      !(pa.review?.type);

    if (isTexas && missingCore && byPage.length) {
      const formPage = this.pickTexasPage(byPage);
      const pageText = byPage.find(p => p.page === formPage)?.text?.trim() ?? '';
      if (pageText) {
        const tx = extractTexasFromText(pageText);
        pa = {
          ...pa,
          source: { template: 'Texas TDI NOFR001', confidence: 0.95 },
          submission: { ...(pa.submission ?? {}), ...this.stripEmpty(tx.submission) },
          patient: { ...(pa.patient ?? {}), ...this.stripEmpty(tx.patient) },
          providerRequesting: { ...(pa.providerRequesting ?? {}), ...this.stripEmpty(tx.providerRequesting) },
          providerServicing: { ...(pa.providerServicing ?? {}), ...this.stripEmpty(tx.providerServicing) },
          review: { ...(pa.review ?? {}), ...this.stripEmpty(tx.review) },
          services: tx.services?.length ? tx.services : pa.services,
        };
      }
    }

    if (isArizona && byPage.length) {
      const formPage = this.pickArizonaPage(byPage);
      const pageText = byPage.find(p => p.page === formPage)?.text?.trim() ?? '';
      if (pageText) {
        const az = extractArizonaFromText(pageText);
        const azClean = {
          patient: this.stripEmpty(az?.patient),
          providerRequesting: this.stripEmpty(az?.providerRequesting),
          providerServicing: this.stripEmpty(az?.providerServicing),
          review: this.stripEmpty(az?.review),
          services: az?.services?.filter((s: any) => s?.code || s?.description) ?? [],
          dx: this.stripEmpty(az?.dx),
          setting: this.stripEmpty(az?.setting),
          submission: this.stripEmpty(az?.submission),
        };
        pa = {
          ...pa,
          source: { template: 'AZ CMDP CSO-1179A', confidence: 0.95 },
          patient: { ...this.stripEmpty(pa.patient), ...azClean.patient },
          providerRequesting: { ...this.stripEmpty(pa.providerRequesting), ...azClean.providerRequesting },
          providerServicing: { ...this.stripEmpty(pa.providerServicing), ...azClean.providerServicing },
          review: { ...this.stripEmpty(pa.review), ...azClean.review },
          services: azClean.services.length ? azClean.services : pa.services,
          dx: { ...this.stripEmpty(pa.dx), ...azClean.dx },
          setting: { ...this.stripEmpty(pa.setting), ...azClean.setting },
          submission: { ...this.stripEmpty(pa.submission), ...azClean.submission },
        };
        this.postProcessArizonaCmdp(pa, allText);
      }
    }

    // ── NHS (Nevada Health Solutions) — AcroForm fillable PDF ──────────────
    // Data lives in PDF form fields, not OCR text. Field values come from
    // pdf.js getFieldObjects() and are 100% reliable when present.
    if (isNevada(allText) && res?.formFields && Object.keys(res.formFields).length) {
      const nhs = extractNhsFromFields(res.formFields);
      pa = {
        ...pa,
        source: { template: 'NHS Nevada Health Solutions', confidence: 0.99 },
        patient: { ...this.stripEmpty(pa.patient), ...this.stripEmpty(nhs.patient) },
        subscriber: { ...this.stripEmpty(pa.subscriber), ...this.stripEmpty(nhs.subscriber) },
        providerRequesting: { ...this.stripEmpty(pa.providerRequesting), ...this.stripEmpty(nhs.providerRequesting) },
        providerServicing: { ...this.stripEmpty(pa.providerServicing), ...this.stripEmpty(nhs.providerServicing) },
        pcp: { ...this.stripEmpty(pa.pcp), ...this.stripEmpty(nhs.pcp) },
        submission: { ...this.stripEmpty(pa.submission), ...this.stripEmpty(nhs.submission) },
        review: { ...this.stripEmpty(pa.review), ...this.stripEmpty(nhs.review) },
        setting: { ...this.stripEmpty(pa.setting), ...this.stripEmpty(nhs.setting) },
        services: (nhs.services?.length ? nhs.services : pa.services) ?? [],
        dx: { ...this.stripEmpty(pa.dx), ...this.stripEmpty(nhs.dx) },
        notes: nhs.notes ?? pa.notes,
      };
    }

    // ── NHS — TEXT fallback for FLATTENED PDFs (no live AcroForm) ──────────
    // Some NHS forms arrive as "printed to PDF" — values are baked into the
    // page content stream and getFieldObjects() returns nothing. The text
    // adapter parses those values out of the rendered text instead.
    else if (isNhsText(allText)) {
      const nhs = extractNhsFromText(allText);
      pa = {
        ...pa,
        source: nhs.source ?? pa.source,
        patient: { ...this.stripEmpty(pa.patient), ...this.stripEmpty(nhs.patient) },
        subscriber: { ...this.stripEmpty(pa.subscriber), ...this.stripEmpty(nhs.subscriber) },
        providerRequesting: { ...this.stripEmpty(pa.providerRequesting), ...this.stripEmpty(nhs.providerRequesting) },
        providerServicing: { ...this.stripEmpty(pa.providerServicing), ...this.stripEmpty(nhs.providerServicing) },
        submission: { ...this.stripEmpty(pa.submission), ...this.stripEmpty(nhs.submission) },
        review: { ...this.stripEmpty(pa.review), ...this.stripEmpty(nhs.review) },
        setting: { ...this.stripEmpty(pa.setting), ...this.stripEmpty(nhs.setting) },
        services: (nhs.services?.length ? nhs.services : pa.services) ?? [],
        dx: { ...this.stripEmpty(pa.dx), ...this.stripEmpty(nhs.dx) },
      };
    }

    return pa;
  }

  /**
   * Returns true iff a detected form span belongs to the NHS Nevada Health
   * Solutions template family. We check both `template` and `label` because
   * `multi-form-detector` has used short codes ('NHS') and longer descriptive
   * strings ('NHS Nevada Health Solutions') interchangeably across versions.
   */
  private isNhsSpan(span: any): boolean {
    if (!span) return false;
    const t = String(span.template ?? '').toLowerCase();
    const l = String(span.label ?? '').toLowerCase();
    return /\bnhs\b|nevada\s+health/.test(t) || /\bnhs\b|nevada\s+health/.test(l);
  }

  /**
   * Main orchestration entry — detects multi-form PDFs and dispatches one
   * pipeline per logical form, otherwise runs a single pipeline as before.
   *
   * Multi-form behaviour:
   *   1. Probe the PDF's per-page text via PdfOcrService.
   *   2. Group pages into FormSpans by template header (NHS / Texas / AZ / GA).
   *   3. If >1 form found AND every detected span is NHS, physically split
   *      the PDF using pdf-lib, persist each split as a CHILD fax
   *      (parentFaxId = faxId), capture the child's newly assigned faxId,
   *      and run the pipeline against THAT id. Each child's status is
   *      therefore independently driven by its own pipeline:
   *      both succeed → both Processed; one fails → only the successful child
   *      is Processed, the other stays New. The parent record is left
   *      untouched — it is just the container.
   *   4. If only one form is found, OR if any detected span is non-NHS
   *      (Arizona CMDP, Texas TDI, Georgia, etc.), run the existing
   *      single-form pipeline against the original file unchanged. The
   *      split path is intentionally NHS-only — non-NHS uploads never
   *      get sliced into children regardless of how many form headers
   *      they happen to contain.
   */
  private async triggerAutoAuthorizationPipeline(file: File, faxId: number): Promise<void> {
    // 1. Probe per-page text. Cheap — same call runExtractors() makes anyway.
    let byPage: Array<{ page: number; text: string }> = [];
    try {
      const probe = await this.pdfOcr.extract(file, () => void 0);
      byPage = (probe.byPage ?? []).map((p: any, i: number) => ({
        page: Number(p?.page ?? (i + 1)),
        text: String(p?.text ?? ''),
      }));
    } catch (err) {
      console.warn('[AutoAuth] Pre-extract probe failed; falling back to single-form pipeline', err);
    }

    // 2. Detect logical forms.
    const spans = detectForms(byPage);

    // 3. Decide whether to split.
    //    Splitting is now restricted to NHS PDFs by product requirement —
    //    other templates (AZ CMDP, Texas TDI, etc.) always run as single-form
    //    even if detectForms() returns multiple spans.
    const multiForm = isMultiForm(spans);
    const allNhs = spans.length > 0 && spans.every(s => this.isNhsSpan(s));
    const shouldSplit = multiForm && allNhs;

    this.faxAuthLog('Multi-form split decision', {
      faxId,
      fileName: file.name,
      spanCount: spans.length,
      spans: spans.map(s => ({ label: (s as any).label, template: (s as any).template, pageRange: (s as any).pageRange })),
      multiForm,
      allNhs,
      shouldSplit,
    });

    // Single-form path (or non-NHS multi-form) — preserves original behaviour
    // exactly. Pipeline drives the parent fax (faxId) directly.
    if (!shouldSplit) {
      return this.runPipelineForFile(file, faxId, spans[0]?.label ?? file.name);
    }

    // 4. NHS multi-form path — split, persist children, run pipeline per split.
    let splits: SplitResult[];
    try {
      splits = await splitByForms(file, spans);
    } catch (err) {
      console.error('[AutoAuth] Split failed; falling back to single-form pipeline', err);
      return this.runPipelineForFile(file, faxId, file.name);
    }

    this.toast(
      `${file.name} contains ${splits.length} forms — splitting and running each through the pipeline separately.`,
      false,
    );

    // 4a. Persist each split as a CHILD fax under the original and capture
    //     the child's newly assigned faxId. parentFaxId on saveFileData()
    //     suppresses its own auto-pipeline — that's intentional; we drive
    //     each child's pipeline ourselves below so they each get their own
    //     row AND their own status update on finalize.
    type SplitJob = { split: SplitResult; childFaxId: number };
    const jobs: SplitJob[] = [];
    for (const split of splits) {
      try {
        const childFaxId = await this.saveFileData(null, split.file, {
          parentFaxId: faxId,
          inheritFrom: this.selectedFax ?? undefined,
          metaJson: JSON.stringify({
            source: 'UI:Faxes',
            action: 'AutoSplit',
            parentFaxId: faxId,
            formLabel: split.span.label,
            template: split.span.template,
            pageRange: split.span.pageRange,
          }),
          suppressToast: true,
          suppressReload: true,
        });
        if (childFaxId !== null && Number.isFinite(childFaxId)) {
          jobs.push({ split, childFaxId });
        } else {
          console.warn('[AutoAuth] Split persisted but no child faxId returned', split.span.label);
        }
      } catch (err) {
        console.error('[AutoAuth] Failed to persist split child', split.span.label, err);
      }
    }

    // 4b. Refresh the listing once now so the user sees the new child rows
    //     (still in New / Pending status) before the per-child pipelines run.
    this.reload?.();

    // 4c. Run pipelines sequentially against each CHILD fax id. The parent
    //     id is intentionally NEVER passed in here, so onAuthSaved() updates
    //     the child record — never the parent. If a child's pipeline fails
    //     or terminates early, that child stays in its current state (New)
    //     while siblings that succeed move to Processed.
    //
    //     Display name uses split.file.name (e.g. "NHS_Prior_Authorization_
    //     Forms_Form1of2.pdf") rather than split.span.label so the pipeline
    //     popup row matches the file name shown in the fax listing exactly.
    //     Mixing the two — popup showing "Form 2 of 2 (NHS, p2)" while the
    //     row shows "..._Form2of2.pdf" — was confusing operators trying to
    //     correlate the two views during a multi-split run.
    for (const job of jobs) {
      try {
        await this.runPipelineForFile(job.split.file, job.childFaxId, job.split.file.name);
      } catch (err) {
        console.error('[AutoAuth] Pipeline failed for split', job.split.file.name, err);
      }
    }

    // 4d. Final refresh so the listing reflects the post-pipeline status of
    //     each child (Processed / New / etc.).
    this.reload?.();
  }

  /**
   * Runs the full Auto-Authorization pipeline against a single File.
   *
   *   Extract → Match Member → Rules Engine → Create Auth (if approved) → Finalize
   *
   * `displayName` is what shows up in the pipeline popup row. For multi-form
   * splits the caller passes the persisted child file name (e.g.
   * "NHS_Prior_Authorization_Forms_Form1of2.pdf") so the popup label matches
   * the row in the fax listing exactly — operators can correlate the two
   * views without mentally translating between a descriptive span label and
   * the actual file name.
   */
  private async runPipelineForFile(file: File, faxId: number, displayName: string): Promise<void> {
    // Defensive cleanup: tear down ANY leftover hidden-pipeline state from a
    // previous run before we start a fresh one. Without this, a previously
    // wedged pipeline (e.g. authdetails.save() threw silently and never
    // emitted authSaved/authCancelled) would still own _activeAutoAuthPipeline
    // and isAutoSavePipelineActive — so the new pipeline would race the dead
    // one, the modal backdrop would never reach allPipelinesComplete, and
    // every Save Authorization click would land on the backdrop instead of
    // the visible auth form's button.
    if (this._activeAutoAuthPipeline || this.isAutoSavePipelineActive) {
      const stale = this._activeAutoAuthPipeline;
      this._activeAutoAuthPipeline = null;
      this.isAutoSavePipelineActive = false;
      this.pipelineFaxPrefill = null;
      if (stale && stale.outcome === null) {
        // Mark the abandoned pipeline as errored so it counts toward
        // allPipelinesComplete and the user can dismiss the popup.
        stale.outcome = 'error';
        stale.errorMessage = 'Auto-save did not complete — please review manually.';
        this.skipRemainingSteps(stale, 'auth');
      }
      // Resolve any outstanding gate so a stuck await on the old pipeline
      // unblocks. Idempotent.
      if (stale) this.resolvePipelineDone(stale.id);
    }

    const pipeline = this.buildPipeline(faxId, displayName);
    this.autoAuthPipelines = [...this.autoAuthPipelines, pipeline];
    this.showPipelinePopup = true;   // auto-open the popup as soon as processing starts

    // ─── STEP 1: OCR Extraction ─────────────────────────────────────────────
    this.setStep(pipeline, 'extract', 'running',
      'Analyzing document structure and extracting text…');

    let pa: PriorAuth;

    try {
      pa = await this.runExtractors(file);
      if (!pa) throw new Error('Extraction returned no structured data.');
      this.setStep(pipeline, 'extract', 'success',
        'Document data extracted successfully');
    } catch (err: any) {
      this.setStep(pipeline, 'extract', 'error',
        `Extraction failed: ${err?.message ?? 'Unknown error'}`);
      pipeline.outcome = 'error';
      pipeline.errorMessage = 'Document extraction could not be completed. Please review the fax manually.';
      this.skipRemainingSteps(pipeline, 'extract');
      return;
    }

    // ─── STEP 2: Member Match ───────────────────────────────────────────────
    this.setStep(pipeline, 'member', 'running',
      'Querying member registry with extracted identifiers…');

    let memberDetailsId: number | null = null;
    let resolvedMemberId: number | null = null;

    try {
      const extractedMemberId =
        (pa as any)?.patient?.memberId ?? null;

      if (!extractedMemberId) {
        throw new Error('No member identifier could be extracted from the document.');
      }

      // Use searchMembers (the actual API method) to resolve the member by extracted memberId.
      // searchMembers returns MemberSummary[] — take the first exact match.
      let member: MemberSummary | null = null;
      try {
        const results = await firstValueFrom(
          this.api.searchMembers({ memberId: String(extractedMemberId), pageSize: 1 })
        );
        member = results?.[0] ?? null;
      } catch {
        // searchMembers failed — fall back to raw extracted id without memberDetailsId
      }

      resolvedMemberId = member?.memberDetailsId
        ? Number(member.memberId ?? extractedMemberId)
        : Number(extractedMemberId);
      memberDetailsId = member?.memberDetailsId ?? null;

      if (!resolvedMemberId || !Number.isFinite(resolvedMemberId)) {
        throw new Error('Member could not be uniquely identified.');
      }

      const memberDisplayName = member
        ? `${member.firstName ?? ''} ${member.lastName ?? ''}`.trim() || `ID ${resolvedMemberId}`
        : `ID ${resolvedMemberId}`;

      this.setStep(pipeline, 'member', 'success',
        `Member verified: ${memberDisplayName}`);
    } catch (err: any) {
      this.setStep(pipeline, 'member', 'error',
        err?.message ?? 'Member identity could not be verified');
      pipeline.outcome = 'no-member-match';
      pipeline.errorMessage =
        'The member referenced in this fax could not be matched in the registry. ' +
        'Please assign a member manually and use the Generate Auth workflow.';
      this.skipRemainingSteps(pipeline, 'member');
      return;
    }

    // ─── STEP 3: Rules Engine ───────────────────────────────────────────────
    this.setStep(pipeline, 'rules', 'running',
      'Submitting service codes to the clinical decision engine…');

    let authApprove: string | null = null;
    let rulesMatched = false;

    try {
      const firstSvc = (pa as any).services?.[0];
      const serviceCode = (firstSvc?.code ?? '').trim() || 'A9600';
      const fromDate = this.toMdyOrFallback(firstSvc?.startDate, '1/1/2026');
      const toDate = this.toMdyOrFallback(firstSvc?.endDate, '1/1/2027');

      const res: ExecuteTriggerResponse = await firstValueFrom(
        this.rulesengineService.executeTrigger('SMART_AUTH_CHECK.BUTTON_CLICK', {
          serviceCode,
          procedure: { fromDate, toDate },
        })
      );

      const outputs: Record<string, any> = (res as any)?.outputs ?? {};
      const authApproveRaw =
        this.getOutput(outputs, 'dt.result.AuthApprove') ||
        this.getOutput(outputs, 'result2');

      rulesMatched = !!(res as any)?.matched &&
        String((res as any)?.status ?? '').toUpperCase() !== 'NO_MATCH';
      authApprove = rulesMatched ? (authApproveRaw || null) : null;

      if (!rulesMatched) {
        this.setStep(pipeline, 'rules', 'skipped',
          'No matching clinical policy found for this service code — manual review required');
        pipeline.outcome = 'no-rules-match';
        pipeline.errorMessage =
          'The rules engine did not find a matching policy for the extracted service code. ' +
          'This fax requires manual authorization review.';
        this.skipRemainingSteps(pipeline, 'rules');
        return;
      }

      if (!this.isYes(authApprove)) {
        this.setStep(pipeline, 'rules', 'success',
          `Decision: Authorization Required — Approve Decision: ${authApprove ?? 'No'}`);
        pipeline.outcome = 'requires-review';
        pipeline.errorMessage =
          'The rules engine indicates this authorization requires clinical review. ' +
          'Please open the fax and use the Generate Auth workflow to proceed.';
        this.skipRemainingSteps(pipeline, 'rules');
        return;
      }

      this.setStep(pipeline, 'rules', 'success',
        `Decision: Auto Approved — service code ${serviceCode} cleared by clinical policy`);
    } catch (err: any) {
      this.setStep(pipeline, 'rules', 'error',
        `Rules engine error: ${err?.message ?? 'Unknown error'}`);
      pipeline.outcome = 'error';
      pipeline.errorMessage = 'The clinical rules engine returned an unexpected error. Please retry.';
      this.skipRemainingSteps(pipeline, 'rules');
      return;
    }

    // ─── STEP 4: Trigger silent auto-save via hidden AuthdetailsComponent ─────
    //
    // The auth form panel (showAuthForm) is NOT shown to the user here.
    // Instead, a separate <app-authdetails #pipelineAuthRef> instance lives in
    // a display:none container in the template, controlled by isAutoSavePipelineActive.
    //
    // Setting isAutoSavePipelineActive = true causes Angular to instantiate that
    // hidden component with [faxPrefill]="pipelineFaxPrefill".  The component runs
    // its full lifecycle: loads enrollment, auth class, template JSON, prefills all
    // OCR fields — then after 900 ms calls save() automatically (autoSave: true).
    //
    // This means the user sees ONLY the pipeline progress panel, nothing else.
    // If they click the fax filename during this time, the normal preview opens
    // independently — the hidden component is completely separate.
    this.setStep(pipeline, 'auth', 'running',
      'Preparing authorization data — initiating auto-save…');

    // Register the pipeline so onAuthSaved() can close out Steps 4 and 5.
    this._activeAutoAuthPipeline = pipeline;

    // Populate the hidden component's prefill (separate from currentFaxPrefill).
    this.pipelineFaxPrefill = this.buildAutoAuthPrefill(
      pa, resolvedMemberId, memberDetailsId, faxId, authApprove ?? 'Yes'
    );

    // Set up a completion gate BEFORE we render the hidden form. The hidden
    // form's authSaved / authCancelled output will resolve this promise via
    // resolvePipelineDone(), so the multi-form orchestrator can sequence
    // pipelines safely without _activeAutoAuthPipeline being stomped.
    //
    // Belt-and-braces timeout: if the hidden form never emits (which CAN
    // happen — authdetails.save()'s catch block silently swallows API
    // errors without emitting authCancelled), we resolve after 30s anyway
    // so the orchestrator never wedges. Critically we also set the
    // pipeline's outcome to 'error' here, otherwise allPipelinesComplete
    // stays false forever and the modal backdrop traps the user.
    const completion = new Promise<void>((resolve) => {
      this._pipelineDoneResolvers.set(pipeline.id, resolve);
      setTimeout(() => {
        if (this._pipelineDoneResolvers.has(pipeline.id)) {
          console.warn('[AutoAuth] pipeline timed out waiting for auth-save', pipeline.id);
          this._pipelineDoneResolvers.delete(pipeline.id);
          // Critical: clear the active-pipeline pointer so the next manual
          // "Save Authorization" click is treated as a manual save, not a
          // pipeline event.
          if (this._activeAutoAuthPipeline?.id === pipeline.id) {
            this._activeAutoAuthPipeline = null;
            this.isAutoSavePipelineActive = false;
            this.pipelineFaxPrefill = null;
          }
          // Mark the pipeline terminal so the popup unblocks and the user
          // can dismiss it. Without this, allPipelinesComplete stays false
          // and the backdrop sits over the page indefinitely.
          if (pipeline.outcome === null) {
            this.setStep(pipeline, 'auth', 'error',
              'Auto-save timed out — use Generate Auth on the fax row to complete manually');
            pipeline.outcome = 'error';
            pipeline.errorMessage =
              'The authorization could not be created automatically (auto-save timed out). ' +
              'This fax remains in the queue — open it and use Generate Auth to proceed.';
            this.skipRemainingSteps(pipeline, 'auth');
            this.autoAuthPipelines = [...this.autoAuthPipelines];
          }
          resolve();
        }
      }, 30000);
    });

    // Render the hidden component — ngOnInit fires → initFromFaxPrefill() → save().
    this.isAutoSavePipelineActive = true;

    // Wait for the hidden save to complete (or cancel/timeout) before returning.
    // This is what guarantees the multi-form orchestrator's `await runPipelineForFile`
    // is truly serial.
    await completion;
  }

  /**
   * Called by onAuthSaved / onAutoAuthCancelled to release the gate set up
   * in runPipelineForFile(). Idempotent — safe to call multiple times or
   * for a pipeline that was never gated.
   */
  private resolvePipelineDone(pipelineId: string | undefined): void {
    if (!pipelineId) return;
    const r = this._pipelineDoneResolvers.get(pipelineId);
    if (r) {
      this._pipelineDoneResolvers.delete(pipelineId);
      r();
    }
  }
  // ── END triggerAutoAuthorizationPipeline ────────────────────────────────────

  // ── Pipeline public methods ──────────────────────────────────────────────

  /** Dismiss a single completed pipeline card. */
  dismissPipeline(pipelineId: string): void {
    const p = this.autoAuthPipelines.find(x => x.id === pipelineId);
    if (p) {
      p.dismissed = true;
      this.autoAuthPipelines = [...this.autoAuthPipelines];
    }
  }

  /** Dismiss all completed (non-null outcome) pipeline cards in one action. */
  dismissAllCompletedPipelines(): void {
    this.autoAuthPipelines.forEach(p => {
      if (p.outcome !== null) p.dismissed = true;
    });
    this.autoAuthPipelines = [...this.autoAuthPipelines];
  }

  /**
   * Navigate to the auto-created authorization record —
   * mirrors the existing onAuthClick() pattern using headerService tabs.
   */
  viewAutoAuth(pipeline: AutoAuthPipeline): void {
    if (!pipeline.authId || !pipeline.authNumber) return;

    const fax = this.faxesRaw.find(f => f.faxId === pipeline.faxId);
    const memberId = fax?.memberId;
    const memberDetailsId = fax?.memberDetailsId;

    if (!memberId || !memberDetailsId) {
      // Fallback: switch to Processed tab so the user can locate the record
      this.selectStatusChip('processed');
      this.showInlineMessage(
        `Authorization ${pipeline.authNumber} is now visible in the Processed tab.`,
        'success',
        6000
      );
      return;
    }

    const memId = String(memberId);
    const memDetId = String(memberDetailsId);
    const authNo = String(pipeline.authNumber);

    const urlTree = this.router.createUrlTree([
      '/member-info',
      memId,
      'auth',
      authNo,
      'details'
    ]);
    const tabRoute = this.router.serializeUrl(urlTree);
    const tabLabel = `Auth # ${authNo}`;

    const existingTab = this.headerService.getTabs().find((t: any) => t.route === tabRoute);
    if (existingTab) {
      this.headerService.selectTab(tabRoute);
    } else {
      this.headerService.addTab(tabLabel, tabRoute, memId, memDetId);
    }
    this.router.navigateByUrl(tabRoute);
  }

  /**
   * Builds a FaxAuthPrefill from OCR-extracted PriorAuth data for the pipeline.
   * Mirrors openAuthForm() and adds autoSave: true so AuthdetailsComponent
   * calls its own save() automatically once the template is prefilled.
   *
   * Setting authApprove: 'Yes' triggers the existing auto-approve path inside
   * save(), which:
   *   • resolves Auth Status "Close" + Auth Status Reason "Decisioned" from
   *     the live template dropdown datasources
   *   • seeds Decision Status: Approved / Decision Status Code: Auto Approved
   *     via seedDecisionAfterSave()
   *   • stamps authClosedDatetime
   */
  private buildAutoAuthPrefill(
    pa: any,
    memberId: number,
    memberDetailsId: number | null,
    faxId: number,
    authApprove: string
  ): FaxAuthPrefill {
    let authClassName = 'Inpatient';
    if (pa.setting?.outpatient && !pa.setting?.inpatient) {
      authClassName = 'Outpatient';
    }

    const reqAddr = this.parseProviderAddress(pa.providerRequesting?.address);
    const svcAddr = this.parseProviderAddress(pa.providerServicing?.address);

    return {
      mode: 'fax',
      memberId: memberId,
      memberDetailsId: memberDetailsId ?? 0,
      faxId: faxId,

      // autoSave: true causes AuthdetailsComponent to call save() automatically
      // 900 ms after applyFaxPrefillToTemplateFields() completes.
      autoSave: true,

      // authApprove: 'Yes' activates the auto-approve path in save(), which sets
      // Auth Status = Closed, Auth Status Reason = Decisioned, and seeds
      // Decision Status: Approved / Decision Status Code: Auto Approved.
      authApprove: authApprove,

      authClassName: authClassName,
      authTypeName: 'Observation Stay',

      diagnosisCodes: (pa.dx?.codes?.length ? pa.dx.codes : null)
        ?? (pa.services ?? []).map((s: any) => s.diagnosisCode).filter(Boolean),

      services: (pa.services ?? []).map((s: any) => ({
        code: s.code,
        description: s.description,
        startDate: s.startDate,
        endDate: s.endDate,
        quantity: s.quantity ?? 1,
      })),

      requestingProvider: pa.providerRequesting ? {
        name: pa.providerRequesting.name,
        firstName: pa.providerRequesting.firstName,
        lastName: pa.providerRequesting.lastName,
        npi: pa.providerRequesting.npi,
        phone: pa.providerRequesting.phone,
        fax: pa.providerRequesting.fax,
        ...reqAddr,
      } : undefined,

      servicingProvider: pa.providerServicing ? {
        name: pa.providerServicing.name || pa.providerServicing.facility,
        firstName: pa.providerServicing.firstName,
        lastName: pa.providerServicing.lastName,
        npi: pa.providerServicing.npi,
        phone: pa.providerServicing.phone,
        fax: pa.providerServicing.fax,
        ...svcAddr,
      } : undefined,

      requestDatetime: new Date().toISOString(),
      actualAdmissionDatetime: new Date().toISOString(),
      requestType: 'Prospective',
      notes: pa.notes,
      priorAuth: pa,
    };
  }

  /**
   * Called when AuthdetailsComponent emits authCancelled.
   *
   * Case A — pipeline auto-save failed (_activeAutoAuthPipeline is set):
   *   Tears down the hidden component, updates Step 4 to 'error', leaves the
   *   fax in the Open queue so the user can complete it manually via Generate Auth.
   *
   * Case B — user manually cancelled the visible auth form (no pipeline):
   *   Closes the form panel with an unsaved-changes guard if needed.
   */
  onAutoAuthCancelled(): void {
    const wasFromHiddenPipeline = this.isAutoSavePipelineActive;
    const pipeline = this._activeAutoAuthPipeline;

    this.faxAuthLog('⚠️ onAutoAuthCancelled() FIRED', {
      caseDetected: (pipeline || wasFromHiddenPipeline) ? 'A — pipeline auto-save failure' : 'B — manual cancel',
      hasActivePipeline: !!pipeline,
      isAutoSavePipelineActive: wasFromHiddenPipeline,
      authHasUnsavedChanges: this.authDetailsRef?.authHasUnsavedChanges?.() ?? null,
      showAuthForm: this.showAuthForm,
    });

    this._activeAutoAuthPipeline = null;

    if (pipeline || wasFromHiddenPipeline) {
      // ── Case A: pipeline auto-save failure ────────────────────────────────
      // Tear down the hidden pipeline instance; leave showAuthForm untouched.
      this.isAutoSavePipelineActive = false;
      this.pipelineFaxPrefill = null;

      if (pipeline) {
        this.setStep(
          pipeline, 'auth', 'error',
          'Auto-save could not be completed — please use the Generate Auth button to proceed manually'
        );
        pipeline.outcome = 'error';
        pipeline.errorMessage =
          'The authorization could not be created automatically. ' +
          'This fax remains in the Open queue — click it and use the Generate Auth button ' +
          'to complete the authorization with the pre-populated OCR data.';
        this.skipRemainingSteps(pipeline, 'auth');
        this.autoAuthPipelines = [...this.autoAuthPipelines];

        // Release the multi-form orchestrator's gate so the next sibling pipeline
        // can run. Always last — anything before this can throw without leaking.
        this.resolvePipelineDone(pipeline.id);
      }
      return;
    }

    // ── Case B: manual cancel (no pipeline) ───────────────────────────────
    if (this.authDetailsRef?.authHasUnsavedChanges?.()) {
      this.discardDialogContext = 'backToDetails';
      this._pendingDiscardAction = () => {
        this.uninstallAuthFormErrorTraps();
        this.showAuthForm = false;
        this.currentFaxPrefill = null;
      };
      this.showDiscardDialog = true;
    } else {
      this.uninstallAuthFormErrorTraps();
      this.showAuthForm = false;
      this.currentFaxPrefill = null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // (All original methods below — unchanged)
  // ═══════════════════════════════════════════════════════════════════════════

  private coerceMemberIdForApi(raw: any): number | string | null {
    if (raw === null || raw === undefined) return null;
    const s = String(raw).trim();
    if (!s) return null;
    if (/^\d+$/.test(s)) {
      const n = Number(s);
      return Number.isFinite(n) ? n : s;
    }
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
      detectedMemberIdRaw !== null &&
        detectedMemberIdRaw !== undefined &&
        String(detectedMemberIdRaw).trim() !== ''
        ? (Number(detectedMemberIdRaw) as any)
        : null;

    const memberIdToSend: number | null =
      memberIdParsed !== null && Number.isFinite(memberIdParsed) ? memberIdParsed : null;

    const toSave: any = {
      faxId: this.selectedFax.faxId,
      workBasket: '2',
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

  getStatusChipClass(status: string): string {
    switch ((status || '').toLowerCase()) {
      case 'new': return 'chip-status-new';
      case 'processing': return 'chip-status-processing';
      case 'ready': return 'chip-status-ready';
      case 'processed': return 'chip-status-processed';
      case 'failed': return 'chip-status-failed';
      case 'deleted': return 'chip-status-deleted';
      default: return 'chip-soft';
    }
  }

  quickSearchTerm = '';

  onQuickSearch(ev: Event): void {
    const v = (ev.target as HTMLInputElement)?.value ?? '';
    this.quickSearchTerm = v;
    this.dataSource.filter = (v || '').trim().toLowerCase();
    if (this.dataSource.paginator) this.dataSource.paginator.firstPage();
  }

  async onFileChosen(evt?: Event, fileBytesBase64?: string, fileName = 'preview.pdf') {
    const myGen = ++this._extractionGen;

    let file: File | null = null;

    if (fileBytesBase64) {
      const pure = fileBytesBase64.includes('base64,')
        ? fileBytesBase64.split('base64,')[1]
        : fileBytesBase64;
      const bin = atob(pure);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      file = new File([bytes], fileName, { type: 'application/pdf' });
    } else if (evt) {
      file = (evt.target as HTMLInputElement).files?.[0] ?? null;
    }

    if (!file) return;

    this.isProcessing = true; this.error = ''; this.progress = 0;

    try {
      const res = await this.pdfOcr.extract(file, p => this.progress = Math.round(p.progress * 100));

      if (myGen !== this._extractionGen) return;

      let pa = extractPriorAuth(res.text, res?.formFields ?? {});

      const allText: string = res.text ?? '';
      const byPage: Array<{ page: number; text: string }> =
        (res.byPage ?? []).map((p: any, i: number) => ({
          page: Number(p?.page ?? (i + 1)),
          text: String(p?.text ?? '')
        }));

      this._ocrByPage = byPage;

      const isTexas = /TEXAS STANDARD PRIOR AUTHORIZATION|NOFR001/i.test(allText);
      const isArizona = /CSO-1179A|CMDP|COMPREHENSIVE MEDICAL AND DENTAL PROGRAM/i.test(allText);
      const missingCore =
        !(pa.patient?.name) || !(pa.patient?.memberId) ||
        !(pa.services?.[0]?.code) || !(pa.review?.type);

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

      if (isArizona && (!isTexas || missingCore)) {
        const formPage = this.pickArizonaPage(byPage);
        let pageText = byPage.find(p => p.page === formPage)?.text?.trim() ?? '';
        if (!pageText) {
          pageText = await this.pdfOcr.ocrPageText(file, 1);
          if (myGen !== this._extractionGen) return;
        }
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
        this.postProcessArizonaCmdp(pa, allText);
      }

      // ── NHS (Nevada Health Solutions) — AcroForm fillable PDF ───────────
      // Data lives in PDF form fields, not OCR text. Field values come from
      // pdf.js getFieldObjects() and are 100% reliable when present.
      if (isNevada(allText) && res?.formFields && Object.keys(res.formFields).length) {
        const nhs = extractNhsFromFields(res.formFields);
        pa = {
          ...pa,
          source: { template: 'NHS Nevada Health Solutions', confidence: 0.99 },
          patient: { ...this.stripEmpty(pa.patient), ...this.stripEmpty(nhs.patient) },
          subscriber: { ...this.stripEmpty(pa.subscriber), ...this.stripEmpty(nhs.subscriber) },
          providerRequesting: { ...this.stripEmpty(pa.providerRequesting), ...this.stripEmpty(nhs.providerRequesting) },
          providerServicing: { ...this.stripEmpty(pa.providerServicing), ...this.stripEmpty(nhs.providerServicing) },
          pcp: { ...this.stripEmpty(pa.pcp), ...this.stripEmpty(nhs.pcp) },
          submission: { ...this.stripEmpty(pa.submission), ...this.stripEmpty(nhs.submission) },
          review: { ...this.stripEmpty(pa.review), ...this.stripEmpty(nhs.review) },
          setting: { ...this.stripEmpty(pa.setting), ...this.stripEmpty(nhs.setting) },
          services: (nhs.services?.length ? nhs.services : pa.services) ?? [],
          dx: { ...this.stripEmpty(pa.dx), ...this.stripEmpty(nhs.dx) },
          notes: nhs.notes ?? pa.notes,
        };
      }
      // ── NHS — TEXT fallback for FLATTENED PDFs (no live AcroForm) ────────
      else if (isNhsText(allText)) {
        const nhs = extractNhsFromText(allText);
        pa = {
          ...pa,
          source: nhs.source ?? pa.source,
          patient: { ...this.stripEmpty(pa.patient), ...this.stripEmpty(nhs.patient) },
          subscriber: { ...this.stripEmpty(pa.subscriber), ...this.stripEmpty(nhs.subscriber) },
          providerRequesting: { ...this.stripEmpty(pa.providerRequesting), ...this.stripEmpty(nhs.providerRequesting) },
          providerServicing: { ...this.stripEmpty(pa.providerServicing), ...this.stripEmpty(nhs.providerServicing) },
          submission: { ...this.stripEmpty(pa.submission), ...this.stripEmpty(nhs.submission) },
          review: { ...this.stripEmpty(pa.review), ...this.stripEmpty(nhs.review) },
          setting: { ...this.stripEmpty(pa.setting), ...this.stripEmpty(nhs.setting) },
          services: (nhs.services?.length ? nhs.services : pa.services) ?? [],
          dx: { ...this.stripEmpty(pa.dx), ...this.stripEmpty(nhs.dx) },
        };
      }

      if (myGen !== this._extractionGen) return;

      this.priorAuth = pa;
      this.isLoadingDetails = false;

      // ── DEBUG: show what extraction produced for this PDF ─────────────────
      // Run the same upload twice (once with AZ, once with NHS) and diff the
      // two `[FAX→AUTH] Extraction complete` console entries. Anything that
      // looks malformed (e.g. provider.name containing the whole address line)
      // is a candidate for the next bug.
      this.faxAuthLog('Extraction complete', {
        sourceTemplate: (pa as any)?.source?.template ?? null,
        patient: {
          name: (pa as any)?.patient?.name ?? null,
          memberId: (pa as any)?.patient?.memberId ?? null,
          dob: (pa as any)?.patient?.dob ?? null,
        },
        providerRequesting: (pa as any)?.providerRequesting ?? null,
        providerServicing: (pa as any)?.providerServicing ?? null,
        services: (pa as any)?.services ?? null,
        dx: (pa as any)?.dx ?? null,
        review: (pa as any)?.review ?? null,
        setting: (pa as any)?.setting ?? null,
        notes: (pa as any)?.notes ?? null,
        selectedFax_memberId: this.selectedFax?.memberId ?? null,
        selectedFax_memberDetailsId: this.selectedFax?.memberDetailsId ?? null,
      });

      if (!this.linkedAuthMeta) {
        this.runSmartAuthCheckFromExtracted(pa);
      } else {
        this.resetSmartAuthCheckState();
      }

    } catch (e: any) {
      if (myGen !== this._extractionGen) return;
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
  smartAuthCheckAuthRequired: boolean | null = null;
  smartAuthCheckAuthApprove: string | null = null;
  smartAuthCheckError = '';

  private resetSmartAuthCheckState(): void {
    this.smartAuthCheckInProgress = false;
    this.smartAuthCheckCompleted = false;
    this.smartAuthCheckMatched = null;
    this.smartAuthCheckAuthRequired = null;
    this.smartAuthCheckAuthApprove = null;
    this.smartAuthCheckError = '';
  }

  private runSmartAuthCheckFromExtracted(pa: PriorAuth): void {
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
            this.getOutput(outputs, 'result1');

          const authApproveRaw =
            this.getOutput(outputs, 'dt.result.AuthApprove') ||
            this.getOutput(outputs, 'result2');

          const matched =
            !!(res as any)?.matched &&
            String((res as any)?.status ?? '').toUpperCase() !== 'NO_MATCH';

          this.smartAuthCheckMatched = matched;
          this.smartAuthCheckAuthRequired = matched ? this.isYes(authRequiredRaw) : null;
          this.smartAuthCheckAuthApprove = matched ? (authApproveRaw || null) : null;
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
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) return s;
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (m) {
      const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
      if (!isNaN(y) && !isNaN(mo) && !isNaN(d)) return `${mo}/${d}/${y}`;
    }
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

  private stripEmpty<T extends Record<string, any>>(obj: T | undefined | null): Partial<T> {
    if (!obj) return {} as Partial<T>;
    const out: any = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v !== undefined && v !== null && v !== '') out[k] = v;
    }
    return out;
  }

  /**
   * Parse a free-form provider address string into discrete
   * { address, city, state, zip } parts for the auth form prefill.
   *
   * Handles the variety of shapes producers actually send:
   *   "Street, City, State, ZIP"             — clean 4-part (e.g. AZ CMDP)
   *   "Street, City, State, ZIP, USA"        — trailing country token
   *   "Street, City, State ZIP"              — 3-part with state+ZIP merged
   *   "Street, City, State ZIP\nUSA"         — NHS Nevada Health Solutions
   *                                            AcroForm: country wraps to a
   *                                            new line inside the same field
   *   "Street"                                — bare street, rest blank
   *
   * Why this exists: the previous inline `parseAddress` did a naive
   * `addr.split(',')` and assigned parts[2] to `state`. For NHS the third
   * comma chunk is "CO 93564\nUSA", which goes straight into the auth
   * record's state field and silently fails backend validation
   * (state column is short and doesn't accept newlines).
   * AuthdetailsComponent.save()'s catch block swallows the resulting API
   * error without emitting authCancelled (see comment at the pipeline
   * timeout handler), so the user sees the Save Authorization click do
   * absolutely nothing — exactly the bug reported for NHS forms while
   * AZ CMDP forms continued to work.
   */
  /**
   * Centralised debug logger for the Fax → Auth flow.
   * Tag every log with [FAX→AUTH] so you can filter by it in DevTools:
   *   filter:  FAX→AUTH
   * Each call also prints a small summary object so the structure is
   * easy to expand without scrolling through giant nested dumps.
   */
  private faxAuthLog(label: string, data?: any): void {
    // eslint-disable-next-line no-console
    console.log(
      `%c[FAX→AUTH] %c${label}`,
      'color:#fff;background:#7c3aed;padding:1px 4px;border-radius:3px;font-weight:bold;',
      'color:#7c3aed;font-weight:bold;',
      data ?? ''
    );
  }

  private parseProviderAddress(addr: string | undefined | null): { address: string; city: string; state: string; zip: string } {
    const empty = { address: '', city: '', state: '', zip: '' };
    if (!addr) return empty;

    // Normalise: collapse newlines/extra whitespace so multi-line AcroForm
    // values fold into the comma stream, then strip trailing country tokens.
    // The country may appear with or without a separating comma, e.g.
    //   "..., CO 93564, USA"   (comma-separated)
    //   "..., CO 93564 USA"    (space only — NHS prints it this way)
    // so we run the strip with an optional comma boundary.
    const normalised = String(addr)
      .replace(/[\r\n]+/g, ', ')
      .replace(/\s{2,}/g, ' ')
      .replace(/[,\s]+(USA|U\.S\.A\.?|US|United\s+States(?:\s+of\s+America)?)\s*$/i, '')
      .trim();

    const parts = normalised.split(',').map(s => s.trim()).filter(Boolean);
    if (parts.length === 0) return empty;

    // 4+ parts: street, city, state, zip (extras ignored — usually country)
    if (parts.length >= 4) {
      return {
        address: parts[0],
        city: parts[1],
        state: parts[2],
        zip: parts[3]
      };
    }

    // 3 parts: street, city, "<state> <zip>" — split state from ZIP
    if (parts.length === 3) {
      const stateZip = parts[2];
      // Match "<state-name-or-code> <ZIP>" with ZIP = 5 digits (+ optional -4)
      const m = /^(.+?)\s+(\d{5}(?:-\d{4})?)\s*$/.exec(stateZip);
      if (m) {
        return {
          address: parts[0],
          city: parts[1],
          state: m[1].trim(),
          zip: m[2].trim()
        };
      }
      // No ZIP detected — keep it in `state` only if it's a plausible length,
      // otherwise drop it so we never push garbage into the state column.
      return {
        address: parts[0],
        city: parts[1],
        state: stateZip.length <= 30 ? stateZip : '',
        zip: ''
      };
    }

    // 2 parts: street, city
    if (parts.length === 2) {
      return { address: parts[0], city: parts[1], state: '', zip: '' };
    }

    // 1 part: street only
    return { address: parts[0], city: '', state: '', zip: '' };
  }

  private postProcessArizonaCmdp(pa: PriorAuth, ocrText: string): void {
    const t = ocrText;

    const cleanName = (raw: string): string => {
      let prev = '', curr = raw;
      while (curr !== prev) {
        prev = curr;
        curr = curr.replace(/([A-Za-z])\s([a-z])/g, '$1$2');
      }
      return curr.replace(/\s{2,}/g, ' ').trim();
    };

    if (pa.providerRequesting?.name) pa.providerRequesting.name = cleanName(pa.providerRequesting.name);
    if (pa.providerServicing?.name) pa.providerServicing.name = cleanName(pa.providerServicing.name);
    if (pa.patient?.name) pa.patient.name = cleanName(pa.patient.name);

    const npiHits: string[] = [];
    let m: RegExpExecArray | null;

    const npiPattern1 = /NPI\s+NO\.?\s*[:\s]*([\d][\d\s]{6,12})/gi;
    while ((m = npiPattern1.exec(t)) !== null) {
      const digits = m[1].replace(/\s/g, '');
      if (digits.length >= 7 && digits.length <= 10) npiHits.push(digits);
    }

    if (npiHits.length === 0) {
      const npiPattern2 = /NPI\s+NO\.?\s*[\n\r]+([\d][\d\s]{6,12})/gi;
      while ((m = npiPattern2.exec(t)) !== null) {
        const digits = m[1].replace(/\s/g, '');
        if (digits.length >= 7 && digits.length <= 10) npiHits.push(digits);
      }
    }

    if (npiHits.length === 0) {
      const npiPattern3 = /NPI\s+NO\.?[\s\S]{0,50}?([\d][\d\s]{6,12})/gi;
      while ((m = npiPattern3.exec(t)) !== null) {
        const digits = m[1].replace(/\s/g, '');
        if (digits.length >= 7 && digits.length <= 10) npiHits.push(digits);
      }
    }

    if (npiHits.length > 0) {
      if (!pa.providerRequesting) pa.providerRequesting = {};
      pa.providerRequesting.npi = npiHits[0];
      if (npiHits.length > 1) {
        if (!pa.providerServicing) pa.providerServicing = {};
        pa.providerServicing.npi = npiHits[1];
      }
    }

    if (pa.providerRequesting?.address) {
      pa.providerRequesting.address = pa.providerRequesting.address
        .replace(/\(?\s*No\.?,?\s*Street,?\s*City,?\s*State,?\s*ZIP\s*\)?\s*/gi, '')
        .replace(/\s{2,}/g, ' ').trim();
    }
    if (pa.providerServicing?.address) {
      pa.providerServicing.address = pa.providerServicing.address
        .replace(/\(?\s*No\.?,?\s*Street,?\s*City,?\s*State,?\s*ZIP\s*\)?\s*/gi, '')
        .replace(/\s{2,}/g, ' ').trim();
    }

    const hcpcsPattern = /\b([A-Z]\d{4})\b/g;
    const hcpcsHits: string[] = [];
    while ((m = hcpcsPattern.exec(t)) !== null) {
      const val = m[1];
      if (/^[A-Z]\d{4}$/.test(val)) hcpcsHits.push(val);
    }

    if (hcpcsHits.length === 0) {
      const looseHcpcs = /\b([A-Z])\s?(\d)\s?(\d)\s?(\d)\s?(\d)\b/g;
      while ((m = looseHcpcs.exec(t)) !== null) {
        const code = m[1] + m[2] + m[3] + m[4] + m[5];
        if (!/^[A-Z]0{4}$/.test(code)) hcpcsHits.push(code);
      }
    }

    const hcpcsLineMatch = t.match(/\b([A-Z]\d{4})\s+([A-Z][A-Z\s\-\/]+?)(?:\s+\$[\d,.]+|$)/im);

    const dateLoose = /(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{2,4})/;
    const extractDate = (text: string): string | undefined => {
      const dm = text.match(dateLoose);
      return dm ? `${dm[1]}/${dm[2]}/${dm[3]}` : undefined;
    };

    const beginChunk = t.match(/DATE\s+SERVICE\s+TO\s+BEGIN([\s\S]{0,80})/i);
    const endChunk = t.match(/\bTO\s+END\b([\s\S]{0,80})/i);

    const finalStart = beginChunk ? extractDate(beginChunk[1]) : undefined;
    const finalEnd = endChunk ? extractDate(endChunk[1]) : undefined;
    const finalStart2 = !finalStart ? extractDate((t.match(/BEGIN[\s\S]{0,50}/i) || [''])[0]) : undefined;
    const finalEnd2 = !finalEnd ? extractDate((t.match(/TO\s+END[\s\S]{0,100}/i) || [''])[0]) : undefined;

    const startDate = finalStart || finalStart2;
    const endDate = finalEnd || finalEnd2;

    const servicingMatch = t.match(/PROVIDER.?S\s+NAME\s*\([^)]*\)\s*[\n\r]+\s*([A-Z][a-z]+(?:,\s*[A-Z][a-z]+)?)/i);
    const servicingMatch2 = t.match(/AHCCCS\s+REGISTERED[\s\S]*?PROVIDER.?S\s+NAME[^)]*\)\s*[\s\n\r]*([A-Z][a-zA-Z]+,?\s*[A-Z]?[a-zA-Z]*)/i);
    const servicingAddrMatch = t.match(/PROVIDER.?S\s+ADDRESS\s*\([^)]*\)\s*[\n\r]+\s*(.+?)(?:\s*[\n\r]|$)/i);

    const svc = pa.services?.[0];
    if (svc) {
      if (hcpcsHits.length > 0 && (!svc.code || !/^[A-Z]\d{4}$/.test(svc.code))) svc.code = hcpcsHits[0];
      if (hcpcsLineMatch?.[2] && !svc.description) svc.description = hcpcsLineMatch[2].trim();
      if (startDate) svc.startDate = startDate;
      if (endDate) svc.endDate = endDate;
      if (!svc.diagnosisCode && pa.dx?.codes?.[0]) svc.diagnosisCode = pa.dx.codes[0];
    } else if (hcpcsHits.length > 0 || startDate || endDate) {
      if (!pa.services) pa.services = [];
      pa.services.push({
        code: hcpcsHits[0] ?? '',
        description: hcpcsLineMatch?.[2]?.trim() ?? '',
        startDate: startDate ?? '',
        endDate: endDate ?? '',
        diagnosisCode: pa.dx?.codes?.[0] ?? '',
        diagnosisDescription: pa.dx?.description ?? ''
      });
    }

    const svcProvName = (servicingMatch?.[1] ?? servicingMatch2?.[1] ?? '').trim();
    if (svcProvName && svcProvName.length > 1) {
      if (!pa.providerServicing) pa.providerServicing = {};
      if (!pa.providerServicing.name) pa.providerServicing.name = cleanName(svcProvName);
    }

    if (servicingAddrMatch?.[1]) {
      const addr = servicingAddrMatch[1]
        .replace(/\(?\s*No\.?,?\s*Street,?\s*City,?\s*State,?\s*ZIP\s*\)?\s*/gi, '')
        .trim();
      if (addr && (!pa.providerServicing?.address || pa.providerServicing.address.length < 3)) {
        if (!pa.providerServicing) pa.providerServicing = {};
        pa.providerServicing.address = addr;
      }
    }

    if (/EMERGENCY\s+URGENT/i.test(t)) {
      if (!pa.review) pa.review = {};
      pa.review.type = 'Urgent';
    }

    if (pa.dx?.description && (!pa.dx.codes || pa.dx.codes.length === 0)) {
      pa.dx.codes = [pa.dx.description.split(/[\s,]+/)[0]];
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
        const res = fr.result as string;
        const base64 = res.split(',')[1] || '';
        resolve(base64);
      };
      fr.onerror = reject;
      fr.readAsDataURL(file);
    });
  }

  private toIso(d: Date | string | null | undefined): string | null {
    if (!d) return null;
    const dt = typeof d === 'string' ? new Date(d) : d;
    return isNaN(dt.getTime()) ? null : dt.toISOString();
  }

  private base64ToUint8Array(b64: string): Uint8Array {
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
    if (!total) return;
    if (this.currentIndex < 0) this.currentIndex = 0;
    else if (this.currentIndex < total - 1) this.currentIndex++;
    else return;
    const next = data[this.currentIndex];
    if (next) this.openPreview(next);
  }

  showPrevious(): void {
    const data = this.dataSource?.data || [];
    const total = data.length;
    if (!total) return;
    if (this.currentIndex <= 0) this.currentIndex = 0;
    else this.currentIndex--;
    const prev = data[this.currentIndex];
    if (prev) this.openPreview(prev);
  }

  private currentFaxBytes: Uint8Array | null = null;
  private currentFaxContentType: string = 'application/pdf';
  private currentFaxOriginalName: string | null = null;

  private async getSelectedFaxPdfBytesOrThrow(): Promise<Uint8Array> {
    if (this.currentFaxBytes && this.currentFaxBytes.length) return this.currentFaxBytes;

    const faxId = this.selectedFax?.faxId;
    if (!faxId) throw new Error('No fax selected.');

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

  toggleSplitMode(): void {
    this.splitMode = !this.splitMode;
    if (this.splitMode) {
      this.splitCompleted = false;
      const pc = this.selectedFax?.pageCount ?? 0;
      this.splitFirstPageCount = pc > 1 ? 1 : null;
    }
  }

  // ── Field Highlight ──────────────────────────────────────────────────────

  private loadPdfJs(): Promise<any> {
    if (this._pdfjsLib) return Promise.resolve(this._pdfjsLib);
    if ((window as any).pdfjsLib) {
      this._pdfjsLib = (window as any).pdfjsLib;
      return Promise.resolve(this._pdfjsLib);
    }
    return new Promise((resolve, reject) => {
      const PDFJS_VERSION = '3.11.174';
      const script = document.createElement('script');
      script.src = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.min.js`;
      script.onload = () => {
        const lib = (window as any).pdfjsLib;
        if (!lib) { reject(new Error('pdfjsLib not found on window after script load')); return; }
        lib.GlobalWorkerOptions.workerSrc =
          `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.js`;
        this._pdfjsLib = lib;
        resolve(lib);
      };
      script.onerror = () => reject(new Error('Failed to load pdf.js from CDN'));
      document.head.appendChild(script);
    });
  }

  async highlightField(category: string, label: string, value: any, key: string): Promise<void> {
    const str = value != null ? String(value).trim() : null;

    if (this.hlKey === key) { this.clearHighlight(); return; }
    if (!str || str === '—' || str === '-') { this.clearHighlight(); return; }

    this.hlKey = key;
    this.hlLabel = label;
    this.hlValue = str;
    this.hlCategory = category;
    this.hlIsProcessing = true;
    this.hlStatus = 'processing';
    this.hlMatchCount = 0;

    if (!this.currentFaxBytes) {
      console.warn('[FieldHighlight] No currentFaxBytes available');
      this.hlIsProcessing = false;
      this.hlStatus = 'not-found';
      return;
    }

    try {
      const pdfjsLib = await this.loadPdfJs();

      if (!this._pdfTextExtracted) {
        await this.extractPdfTextPositions(pdfjsLib, this.currentFaxBytes);
      }

      const matches = this.findMatchingTextItems(str);

      if (matches.length === 0) {
        this.hlIsProcessing = false;
        this.hlStatus = 'not-found';
        return;
      }

      const color = this.HL_COLORS[category] || this.HL_COLORS['patient'];
      const highlightedBytes = await this.drawHighlightsOnPdf(this.currentFaxBytes, matches, color);

      if (this._highlightedBlobUrl) URL.revokeObjectURL(this._highlightedBlobUrl);
      const blob = new Blob([highlightedBytes], { type: 'application/pdf' });
      this._highlightedBlobUrl = URL.createObjectURL(blob);
      this.swapToUrl(this._highlightedBlobUrl);

      this.hlMatchCount = matches.length;
      this.hlStatus = 'found';

    } catch (err) {
      console.error('[FieldHighlight] Error:', err);
      this.hlStatus = 'not-found';
    } finally {
      this.hlIsProcessing = false;
    }
  }

  clearHighlight(): void {
    this.hlKey = null;
    this.hlLabel = null;
    this.hlValue = null;
    this.hlCategory = 'patient';
    this.hlIsProcessing = false;
    this.hlMatchCount = 0;
    this.hlStatus = 'idle';

    if (this._highlightedBlobUrl) {
      const oldUrl = this._highlightedBlobUrl;
      this._highlightedBlobUrl = null;
      setTimeout(() => URL.revokeObjectURL(oldUrl), 500);
    }
    if (this._rawPreviewUrl) this.swapToUrl(this._rawPreviewUrl);
  }

  copyHighlightValue(): void {
    if (this.hlValue) {
      navigator.clipboard.writeText(this.hlValue).then(() => this.toast('Value copied to clipboard'));
    }
  }

  private loadIntoActiveFrame(url: string): void {
    const iframe = this.pdfActiveFrame === 'A' ? this.iframeA : this.iframeB;
    if (iframe?.nativeElement) iframe.nativeElement.src = url;
  }

  private swapToUrl(url: string): void {
    const standby: 'A' | 'B' = this.pdfActiveFrame === 'A' ? 'B' : 'A';
    this._pendingFrame = standby;
    const iframe = standby === 'A' ? this.iframeA : this.iframeB;
    if (iframe?.nativeElement) iframe.nativeElement.src = url;
  }

  onIframeLoaded(frame: 'A' | 'B'): void {
    if (frame === this._pendingFrame) {
      this.pdfActiveFrame = frame;
      this._pendingFrame = null;
    }
  }

  private async extractPdfTextPositions(pdfjsLib: any, pdfBytes: Uint8Array): Promise<void> {
    this._pdfTextItems = [];

    const loadingTask = pdfjsLib.getDocument({ data: pdfBytes.slice() });
    const pdf = await loadingTask.promise;

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1.0 });
      const textContent = await page.getTextContent();

      for (const item of textContent.items) {
        if (!item.str || !item.str.trim()) continue;
        const tx = item.transform;
        const fontSize = Math.abs(tx[3]) || 12;
        const x = tx[4];
        const y = tx[5];
        const w = item.width || (item.str.length * fontSize * 0.6);
        this._pdfTextItems.push({ str: item.str, pageIndex: pageNum - 1, x, y, w, h: fontSize });
      }

      // ── AcroForm Widget annotations ──────────────────────────────────────
      // For fillable PDFs (e.g. NHS forms) the user-typed values do NOT appear
      // in getTextContent(). They live in form-field widget annotations, each
      // with its own rect [x1, y1, x2, y2] in PDF user-space (origin bottom-
      // left — same coords already used by drawHighlightsOnPdf via pdf-lib).
      try {
        const annots = await page.getAnnotations();
        for (const a of (annots || [])) {
          if (!a || a.subtype !== 'Widget') continue;
          // Pick the field's current value first, falling back to default.
          let val: any = a.fieldValue;
          if (val == null || val === '') val = a.defaultFieldValue;
          if (val == null) continue;
          // Some checkbox/radio widgets surface "/Off" or "Off" — skip those,
          // they aren't user-visible text and would create false matches.
          const str = String(Array.isArray(val) ? val.join(' ') : val).trim();
          if (!str || /^\/?Off$/i.test(str)) continue;

          const rect: number[] | undefined = a.rect;
          if (!rect || rect.length < 4) continue;
          const x = Math.min(rect[0], rect[2]);
          const y0 = Math.min(rect[1], rect[3]);
          const w = Math.abs(rect[2] - rect[0]);
          const h = Math.abs(rect[3] - rect[1]);

          this._pdfTextItems.push({
            str,
            pageIndex: pageNum - 1,
            x, y: y0, w, h,
          });

          // For composite fields like "Amelia Cook / 10083" or
          // "5256 Medical Plaza, San Antonio, TX 72165 USA" the user may click
          // a partial value on the left (just "Amelia Cook" or just the city).
          // Index each space- or "/"-separated token under the same rect so
          // partial-string clicks still resolve to this rectangle.
          const parts = str.split(/\s*\/\s*|\s{2,}|,\s+/).map(s => s.trim()).filter(s => s.length >= 2);
          for (const part of parts) {
            if (part === str) continue;
            this._pdfTextItems.push({
              str: part,
              pageIndex: pageNum - 1,
              x, y: y0, w, h,
            });
          }
        }
      } catch (e) {
        // Non-fillable PDFs (or pdf.js without annotation support) land here —
        // safe to ignore and fall through to text-content-only matching.
        console.debug('[FieldHighlight] getAnnotations failed (non-fillable PDF?)', e);
      }

      page.cleanup();
    }
    pdf.destroy();
    this._pdfTextExtracted = true;
  }

  private findMatchingTextItems(searchValue: string): Array<{
    pageIndex: number; x: number; y: number; w: number; h: number;
  }> {
    if (!this._pdfTextItems.length || !searchValue) return [];

    const needle = searchValue.toLowerCase().trim();
    const results: Array<{ pageIndex: number; x: number; y: number; w: number; h: number }> = [];
    const added = new Set<string>();

    const addItem = (item: typeof this._pdfTextItems[0]) => {
      const k = `${item.pageIndex}:${Math.round(item.x)}:${Math.round(item.y)}`;
      if (added.has(k)) return;
      added.add(k);
      results.push({ pageIndex: item.pageIndex, x: item.x, y: item.y, w: item.w, h: item.h });
    };

    for (const item of this._pdfTextItems) {
      if (item.str.toLowerCase().includes(needle)) addItem(item);
    }

    if (results.length === 0) {
      const words = needle.split(/[\s,]+/).filter(w => w.length >= 2);
      for (const item of this._pdfTextItems) {
        const lower = item.str.toLowerCase();
        for (const word of words) {
          if (lower.includes(word)) { addItem(item); break; }
        }
      }
    }

    if (results.length === 0) {
      const stripped = needle.replace(/[\s\-().\/]/g, '');
      if (stripped.length >= 3) {
        for (const item of this._pdfTextItems) {
          const itemStripped = item.str.replace(/[\s\-().\/]/g, '').toLowerCase();
          if (itemStripped.includes(stripped) || stripped.includes(itemStripped)) addItem(item);
        }
      }
    }

    if (results.length === 0) {
      const byPage = new Map<number, typeof this._pdfTextItems>();
      for (const item of this._pdfTextItems) {
        if (!byPage.has(item.pageIndex)) byPage.set(item.pageIndex, []);
        byPage.get(item.pageIndex)!.push(item);
      }
      for (const [pageIdx, items] of byPage) {
        const sorted = [...items].sort((a, b) => {
          const dy = b.y - a.y;
          return Math.abs(dy) < 3 ? a.x - b.x : dy;
        });
        for (let i = 0; i < sorted.length - 1; i++) {
          const combined = (sorted[i].str + ' ' + sorted[i + 1].str).toLowerCase();
          if (combined.includes(needle)) { addItem(sorted[i]); addItem(sorted[i + 1]); }
        }
      }
    }

    return results;
  }

  private async drawHighlightsOnPdf(
    originalBytes: Uint8Array,
    positions: Array<{ pageIndex: number; x: number; y: number; w: number; h: number }>,
    color: { r: number; g: number; b: number }
  ): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.load(originalBytes, { ignoreEncryption: true });
    const pages = pdfDoc.getPages();
    const pad = 2;

    for (const pos of positions) {
      const page = pages[pos.pageIndex];
      if (!page) continue;
      page.drawRectangle({
        x: pos.x - pad, y: pos.y - pad,
        width: pos.w + pad * 2, height: pos.h + pad * 2,
        color: rgb(color.r, color.g, color.b),
        opacity: 0.25,
        borderColor: rgb(color.r, color.g, color.b),
        borderWidth: 1.5, borderOpacity: 0.8,
      });
      page.drawRectangle({
        x: pos.x - pad, y: pos.y - pad - 2,
        width: pos.w + pad * 2, height: 3,
        color: rgb(color.r, color.g, color.b),
        opacity: 0.65,
      });
    }
    return await pdfDoc.save();
  }

  // ── Count helpers for category badges ──

  countIdentifiedPatientFields(pa: any): number {
    if (!pa?.patient) return 0;
    const p = pa.patient;
    return [p.name, p.memberId, p.dob, p.phone].filter(v => !!v).length;
  }

  countIdentifiedReviewFields(pa: any): number {
    let c = 0;
    if (pa?.review?.type) c++;
    if (pa?.setting?.inpatient) c++;
    if (pa?.setting?.outpatient) c++;
    return c;
  }

  countIdentifiedServiceFields(pa: any): number {
    let c = 0;
    for (const s of pa?.services ?? []) {
      if (s.code) c++; if (s.description) c++;
      if (s.startDate) c++; if (s.endDate) c++;
      if (s.diagnosisCode || s.diagnosisDescription) c++;
    }
    if (pa?.dx?.codes?.length) c++;
    return c;
  }

  countIdentifiedProviderFields(pa: any): number {
    let c = 0;
    const r = pa?.providerRequesting;
    if (r) { if (r.name) c++; if (r.npi) c++; if (r.phone) c++; if (r.fax) c++; }
    const s = pa?.providerServicing;
    if (s) { if (s.name || s.facility) c++; if (s.npi) c++; if (s.phone) c++; if (s.fax) c++; }
    return c;
  }

  // ── AI Summary ──────────────────────────────────────────────────────────

  async generateAiSummary(pa?: PriorAuth): Promise<void> {
    const paData = pa || this.priorAuth;
    if (!paData || this.aiSummaryLoading) return;

    this.aiSummaryLoading = true;
    this.aiSummaryError = null;
    this.aiSummary = null;
    this.aiParsedSummary = null; this.aiParsedFlags = [];
    this.aiClinicalMatch = null; this.aiRecommendation = null; this.aiRecommendationType = 'info';

    try {
      const inputData = this.buildPaDataText(paData);
      const value = 'test';

      const summary: string = await firstValueFrom(
        this.authDetailApi.getFaxSummary(inputData, value)
      ) as string;

      if (!summary) throw new Error('Empty response from AI summary service');
      this.parseAiSections(summary);
    } catch (err: any) {
      console.error('[AISummary] Error:', err);
      this.aiSummaryError =
        err?.error?.title || err?.error?.message || err?.message ||
        'Failed to generate summary. Please try again.';
    } finally {
      this.aiSummaryLoading = false;
    }
  }

  private parseAiSections(fullText: string): void {
    const text = fullText
      .replace(/\\r\\n/g, '\n').replace(/\\r/g, '\n').replace(/\\n/g, '\n')
      .replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();

    this.aiSummary = text || null;

    const section1Regex = /(?:SECTION\s*1|PA Clinical Summary)[^\n]*\n([\s\S]*?)(?=(?:SECTION\s*2|Critical Flags Identified)|$)/i;
    const s1Match = section1Regex.exec(text);
    if (s1Match) {
      this.aiParsedSummary = s1Match[1]
        .replace(/^[-—=]+$/gm, '').replace(/##\s*/g, '').replace(/\*\*/g, '').trim();
    } else {
      const flagsStart = text.search(/Critical Flags Identified/i);
      this.aiParsedSummary = flagsStart > 0
        ? text.substring(0, flagsStart).replace(/##\s*/g, '').replace(/\*\*/g, '').trim()
        : text;
    }

    this.aiClinicalMatch = null;
    this.aiRecommendation = null;
    this.aiRecommendationType = 'info';
  }

  private buildPaDataText(pa: PriorAuth): string {
    const lines: string[] = [];
    lines.push(`Member Name: ${pa.patient?.name || 'Not provided'}`);
    lines.push(`DOB: ${pa.patient?.dob || 'Not provided'}`);
    lines.push(`Member ID: ${pa.patient?.memberId || 'Not provided'}`);
    if (pa.patient?.phone) lines.push(`Phone: ${pa.patient.phone}`);
    lines.push(`Authorization Type: ${pa.review?.type || 'Not provided'}`);
    const settings: string[] = [];
    if (pa.setting?.inpatient) settings.push('Inpatient');
    if (pa.setting?.outpatient) settings.push('Outpatient');
    lines.push(`Setting: ${settings.length ? settings.join(', ') : 'Not provided'}`);
    if (pa.services?.length) {
      for (let i = 0; i < pa.services.length; i++) {
        const s = pa.services[i];
        const parts: string[] = [];
        if (s.code) parts.push(s.code);
        if (s.description) parts.push(s.description);
        lines.push(`Requested Service ${i + 1}: ${parts.join(' - ') || 'Not provided'}`);
        lines.push(`Service Dates: ${s.startDate || 'Not provided'} - ${s.endDate || 'Not provided'}`);
        if (s.diagnosisCode || s.diagnosisDescription) {
          lines.push(`Diagnosis Code: ${s.diagnosisCode || ''} ${s.diagnosisDescription ? '(' + s.diagnosisDescription + ')' : ''}`);
        }
      }
    } else {
      lines.push('Requested Services: None extracted');
    }
    const dxParts: string[] = [];
    if (pa.services?.length) {
      for (const s of pa.services) {
        if (s.diagnosisCode) dxParts.push(s.diagnosisCode + (s.diagnosisDescription ? ` (${s.diagnosisDescription})` : ''));
      }
    }
    if (pa.dx?.codes?.length) dxParts.push(...pa.dx.codes);
    if (dxParts.length) lines.push(`All Diagnosis Codes: ${[...new Set(dxParts)].join(', ')}`);
    const rp = pa.providerRequesting;
    lines.push(`Referring Physician: ${rp?.name || 'Not provided'}${rp?.npi ? ', NPI: ' + rp.npi : ''}`);
    if (rp?.phone) lines.push(`Referring Phone: ${rp.phone}`);
    if (rp?.fax) lines.push(`Referring Fax: ${rp.fax}`);
    const sp = pa.providerServicing;
    const svcName = sp?.name || sp?.facility;
    lines.push(`Servicing Provider: ${svcName || 'Not provided'}`);
    lines.push(`Servicing Provider NPI: ${sp?.npi || 'Not provided'}`);
    if (sp?.phone) lines.push(`Servicing Provider Phone: ${sp.phone}`);
    if (sp?.fax) lines.push(`Servicing Provider Fax: ${sp.fax}`);
    if (sp?.facility && sp?.name) lines.push(`Facility: ${sp.facility}`);
    if (!sp?.facility && !svcName) lines.push('Facility: Not provided');
    if (pa.submission?.issuerName) lines.push(`Issuer Name: ${pa.submission.issuerName}`);
    if (pa.submission?.date) lines.push(`Submission Date: ${pa.submission.date}`);
    if (pa.notes) lines.push(`Supporting Docs: ${pa.notes}`);
    if (!rp?.npi && !sp?.npi) lines.push('AHCCCS Registration: Not provided for either provider');
    return lines.join('\n');
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
      let bytes = this.currentFaxBytes;
      if (!bytes || bytes.length === 0) {
        const res: any = await firstValueFrom(this.api.getFaxFileById(this.selectedFax.faxId ?? 0));
        const fileBytes = res.fileBytes ?? res.FileBytes ?? null;
        if (!fileBytes) throw new Error('No PDF bytes returned from server.');
        bytes = this.base64ToUint8Array(fileBytes);
        this.currentFaxBytes = bytes;
        this.currentFaxContentType = res.contentType ?? res.ContentType ?? 'application/pdf';
        this.currentFaxOriginalName = this.selectedFax.fileName ?? 'document.pdf';
      }

      const originalPdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const pageCount = originalPdf.getPageCount();
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

      await this.saveFileData(null, file1, { parentFaxId, inheritFrom: this.selectedFax, metaJson, suppressToast: true, suppressReload: true });
      await this.saveFileData(null, file2, { parentFaxId, inheritFrom: this.selectedFax, metaJson, suppressToast: true, suppressReload: true });

      this.toast(`Split saved: "${file1Name}" and "${file2Name}".`, false);
      this.splitCompleted = true;
      this.reload();
    } catch (e) {
      console.error('Split failed', e);
      this.toast('Split failed. Please try again.', true);
    } finally {
      this.isSplitting = false;
      this.saving = false;
    }
  }

  openSplitDialog(row: FaxFile): void {
    this.openPreview(row);
    const pc = row.pageCount ?? 0;
    this.splitFirstPageCount = pc > 1 ? 1 : null;
  }

  openUpdateWorkBasketDialog(row: FaxFile): void { /* open WB dialog */ }
  renameFax(row: FaxFile): void { /* prompt for new name + saveFileData(...) */ }
  deleteFax(row: FaxFile): void { /* confirm + delete */ }

  editMode: 'none' | 'rename' | 'workbasket' | 'deleteConfirm' = 'none';
  workBasketOptions: { value: string; label: string }[] = [];

  cancelInlineEdit(): void { this.editMode = 'none'; }

  editingFileNameFaxId: number | null = null;
  editingWorkBasketFaxId: number | null = null;
  tempFileName: string = '';
  tempWorkBasket: string | null = null;

  renameFaxInline(row: FaxFile): void {
    this.editingWorkBasketFaxId = null;
    this.editingFileNameFaxId = row.faxId ?? null;
    this.tempFileName = row.fileName;
  }

  saveRename(row: FaxFile): void {
    const name = (this.tempFileName || '').trim();
    if (!name) return;
    this.selectedFax = { ...row, fileName: name, updatedBy: this.currentUserId ?? row.updatedBy ?? 1 };
    this.saveUpdate();
    this.editingFileNameFaxId = null;
  }

  cancelRename(): void {
    this.editingFileNameFaxId = null;
    this.tempFileName = '';
  }

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
    this.selectedFax = { ...row, workBasket: this.tempWorkBasket, updatedBy: this.currentUserId ?? row.updatedBy ?? 1 };
    this.saveUpdate();
    this.editingWorkBasketFaxId = null;
  }

  cancelWorkBasketEdit(): void {
    this.editingWorkBasketFaxId = null;
    this.tempWorkBasket = null;
  }

  updatePriority(row: FaxFile): void {
    this.selectedFax = { ...row, priority: row.priority === 1 ? 2 : 1, updatedBy: this.currentUserId ?? row.updatedBy ?? 1 };
    this.saveUpdate();
  }

  deletingFaxId: number | null = null;
  deleteMessage: string = '';

  openDeleteInline(row: FaxFile): void {
    this.editingFileNameFaxId = null;
    this.editingWorkBasketFaxId = null;
    this.deletingFaxId = row.faxId ?? null;
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
    const targets: FaxFile[] = row.hasChildren && row.children?.length
      ? [row, ...(row.children || [])]
      : [row];

    this.saving = true;
    try {
      await Promise.all(targets.map(t => {
        this.selectedFax = { ...t, status: 'Deleted', deletedOn: nowIso, deletedBy, updatedBy: deletedBy };
        return (async () => {
          const toSave: any = {
            faxId: this.selectedFax!.faxId, workBasket: '2',
            fileName: this.selectedFax!.fileName, priority: this.selectedFax!.priority,
            status: this.selectedFax!.status, updatedOn: nowIso, updatedBy: deletedBy,
            deletedOn: nowIso, deletedBy
          };
          return firstValueFrom(this.api.updateFaxFile(toSave));
        })();
      }));
      this.toast(row.hasChildren ? `Deleted "${row.fileName}" and its split pages.` : `Deleted "${row.fileName}".`, false);
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

  private updateFaxCounts(): void {
    const data = this.allFaxes || [];
    const roots = data.filter(f => !f.isChild);

    this.totalFaxCount = data.length;

    // Counts are group-aware: a split parent + its children move between
    // Open and Processed as a single unit. While ANY child is still New,
    // the entire group counts as Open (and every record in it shows up in
    // the Open chip count). Once every child is Processed, the whole group
    // — parent included — counts as Processed.
    let openCount = 0;
    let processedCount = 0;
    for (const root of roots) {
      const group = this.getGroupEffectiveStatus(root);
      const groupSize = 1 + (root.children?.length ?? 0);
      if (group === 'Open') openCount += groupSize;
      else if (group === 'Processed') processedCount += groupSize;
      // 'Deleted' contributes to neither chip
    }
    this.openFaxCount = openCount;
    this.processedFaxCount = processedCount;

    this.faxWorkBaskets.forEach(wb => {
      wb.count = data.filter(f => (f.workBasket || '') === wb.name).length;
    });
  }

  /**
   * Compute the effective status for a top-level (non-child) row, treating
   * NHS split parents and their children as a single logical group:
   *
   *   • If the row has children (a split parent):
   *       'Processed' iff EVERY child is Processed.
   *       Otherwise 'Open' — the parent's own backend status is ignored,
   *       so a split parent that never had an auth created against it does
   *       not get stuck in Open after every child finishes.
   *   • If the row has no children (a normal upload): use its own status.
   *
   * This is what implements the rule: "while one split is still New, keep
   * its sibling visible in the New filter even if the backend already
   * marked the sibling Processed". The split status only flips at the
   * group level once every child is done.
   */
  private getGroupEffectiveStatus(row: FaxFile): 'Processed' | 'Open' | 'Deleted' {
    const isProcessed = (s: string | null | undefined) => (s || '').toLowerCase() === 'processed';
    const isDeleted = (s: string | null | undefined) => (s || '').toLowerCase() === 'deleted';

    if (row.hasChildren && row.children?.length) {
      // Ignore deleted children when deciding group completion — a tombstoned
      // split shouldn't keep the rest of the group stuck in Open forever.
      const livingChildren = row.children.filter(c => !isDeleted(c.status));
      if (livingChildren.length === 0) return 'Deleted';
      if (livingChildren.every(c => isProcessed(c.status))) return 'Processed';
      return 'Open';
    }

    if (isDeleted(row.status)) return 'Deleted';
    if (isProcessed(row.status)) return 'Processed';
    return 'Open';
  }

  private applyWorkBasketFilter(): void {
    // Walk top-level rows only (children inherit visibility from their
    // parent's group decision). For each root we decide whether the WHOLE
    // group should be visible under the current chip + work-basket filters,
    // then push the parent followed by all its children when included.
    const roots = (this.allFaxes || []).filter(f => !f.isChild);

    const passesStatusChip = (group: 'Processed' | 'Open' | 'Deleted'): boolean => {
      if (this.statusChipFilter === 'open') return group === 'Open';
      if (this.statusChipFilter === 'processed') return group === 'Processed';
      return group !== 'Deleted'; // 'all' shows everything except deleted
    };

    const out: FaxFile[] = [];
    for (const root of roots) {
      const group = this.getGroupEffectiveStatus(root);

      let include = passesStatusChip(group);

      // Work-basket filter is evaluated against the parent only. Children
      // inherit — splitting a multi-form upload doesn't move it across
      // baskets, so this is safe and keeps each split group atomic.
      if (include && this.selectedWorkBasket) {
        include = (root.workBasket || '') === this.selectedWorkBasket;
      }

      if (include) {
        out.push(root);
        if (root.hasChildren && root.children?.length) {
          root.children.forEach((c: any) => out.push(c));
        }
      }
    }

    this.dataSource.data = out;
  }

  selectWorkBasket(name: string | null): void {
    this.selectedWorkBasket = name;
    this.applyWorkBasketFilter();
  }

  selectStatusChip(status: 'open' | 'processed' | 'all'): void {
    this.statusChipFilter = status;
    this.applyWorkBasketFilter();
  }

  onMemberClick(memberId: string, memberName: string, memberDetailsId: string): void {
    const tabLabel = `Member: ${memberName}`;
    const tabRoute = `/member-info/${memberId}`;
    const existingTab = this.headerService.getTabs().find(tab => tab.route === tabRoute);
    if (existingTab) {
      this.headerService.selectTab(tabRoute);
      const mdId = existingTab.memberDetailsId ?? null;
      if (mdId) sessionStorage.setItem('selectedMemberDetailsId', mdId);
      this.router.navigateByUrl('/', { skipLocationChange: true }).then(() => this.router.navigate([tabRoute]));
    } else {
      this.headerService.addTab(tabLabel, tabRoute, memberId, memberDetailsId);
      sessionStorage.setItem('selectedMemberDetailsId', memberDetailsId);
      this.router.navigateByUrl('/', { skipLocationChange: true }).then(() => this.router.navigate([tabRoute]));
    }
  }

  // ── Fax → Auth Form ─────────────────────────────────────────────────────

  openAuthForm(): void {
    if (!this.priorAuth || !this.selectedFax) {
      this.faxAuthLog('openAuthForm() ABORTED — missing priorAuth or selectedFax', {
        hasPriorAuth: !!this.priorAuth,
        hasSelectedFax: !!this.selectedFax,
      });
      return;
    }

    const pa = this.priorAuth;

    this.faxAuthLog('openAuthForm() called', {
      selectedFax: {
        faxId: this.selectedFax.faxId,
        memberId: this.selectedFax.memberId,
        memberDetailsId: this.selectedFax.memberDetailsId,
        memberName: this.selectedFax.memberName,
        fileName: this.selectedFax.fileName,
      },
      smartAuthCheckAuthApprove: this.smartAuthCheckAuthApprove,
      sourceTemplate: (pa as any)?.source?.template ?? null,
    });

    let authClassName = 'Inpatient';
    if ((pa as any).setting?.outpatient && !(pa as any).setting?.inpatient) authClassName = 'Outpatient';

    const authTypeName = 'Observation Stay';

    const reqAddr = this.parseProviderAddress((pa as any).providerRequesting?.address);
    const svcAddr = this.parseProviderAddress((pa as any).providerServicing?.address);

    this.faxAuthLog('Address parsing result', {
      requestingProvider_addressIn: (pa as any).providerRequesting?.address ?? null,
      requestingProvider_parsed: reqAddr,
      servicingProvider_addressIn: (pa as any).providerServicing?.address ?? null,
      servicingProvider_parsed: svcAddr,
    });

    this.currentFaxPrefill = {
      mode: 'fax',
      memberId: this.selectedFax.memberId ?? 0,
      memberDetailsId: this.selectedFax.memberDetailsId ?? 0,
      faxId: this.selectedFax.faxId ?? 0,
      authClassName,
      authTypeName,
      authApprove: this.smartAuthCheckAuthApprove ?? undefined,
      diagnosisCodes: ((pa as any).dx?.codes?.length ? (pa as any).dx.codes : null)
        ?? ((pa as any).services || []).map((s: any) => s.diagnosisCode).filter(Boolean),
      services: ((pa as any).services ?? []).map((s: any) => ({
        code: s.code, description: s.description,
        startDate: s.startDate, endDate: s.endDate, quantity: s.quantity ?? 1
      })),
      requestingProvider: (pa as any).providerRequesting ? {
        name: (pa as any).providerRequesting.name, firstName: (pa as any).providerRequesting.firstName,
        lastName: (pa as any).providerRequesting.lastName, npi: (pa as any).providerRequesting.npi,
        phone: (pa as any).providerRequesting.phone, fax: (pa as any).providerRequesting.fax, ...reqAddr
      } : undefined,
      servicingProvider: (pa as any).providerServicing ? {
        name: (pa as any).providerServicing.name || (pa as any).providerServicing.facility,
        firstName: (pa as any).providerServicing.firstName, lastName: (pa as any).providerServicing.lastName,
        npi: (pa as any).providerServicing.npi, phone: (pa as any).providerServicing.phone,
        fax: (pa as any).providerServicing.fax, ...svcAddr
      } : undefined,
      requestDatetime: new Date().toISOString(),
      actualAdmissionDatetime: new Date().toISOString(),
      requestType: 'Prospective',
      notes: (pa as any).notes,
      // Pre-select Owner = Kelly Anderson (ID 5) for all fax-initiated auths
      ownerUserId: 5,
      priorAuth: pa
    };

    // ── DEBUG: full prefill snapshot crossing into AuthdetailsComponent ────
    // This is THE key diff between an NHS open and an AZ open. If this log
    // looks structurally identical for both PDFs but the NHS save still
    // silently dies, the issue is inside AuthdetailsComponent (validators,
    // template apply, save() catch). If it differs, the diff IS the bug.
    this.faxAuthLog('currentFaxPrefill set — handing off to <app-authdetails>',
      JSON.parse(JSON.stringify(this.currentFaxPrefill)) // deep clone snapshot for the console
    );

    this.installAuthFormErrorTraps();

    this.showAuthForm = true;
    setTimeout(() => {
      const pane = document.querySelector('.pane-middle');
      if (pane) pane.scrollTop = 0;
    }, 100);
  }

  // ── DEBUG: error traps active only while the auth form is open ─────────────
  // AuthdetailsComponent.save()'s catch block silently swallows API errors
  // (the existing pipeline timeout comment already calls this out). These
  // traps catch anything that escapes the catch — uncaught throws, rejected
  // promises that nobody awaited, HTTP failures bubbling up — and tag them
  // so they're visible in the console next to the [FAX→AUTH] trail.
  private _authFormErrorHandler: ((e: ErrorEvent) => void) | null = null;
  private _authFormRejectionHandler: ((e: PromiseRejectionEvent) => void) | null = null;

  private installAuthFormErrorTraps(): void {
    if (this._authFormErrorHandler || this._authFormRejectionHandler) return;

    this._authFormErrorHandler = (e: ErrorEvent) => {
      this.faxAuthLog('🔥 window error while auth form open', {
        message: e.message,
        filename: e.filename,
        lineno: e.lineno,
        colno: e.colno,
        error: e.error,
      });
    };
    this._authFormRejectionHandler = (e: PromiseRejectionEvent) => {
      this.faxAuthLog('🔥 unhandled promise rejection while auth form open', {
        reason: e.reason,
      });
    };

    window.addEventListener('error', this._authFormErrorHandler);
    window.addEventListener('unhandledrejection', this._authFormRejectionHandler);
  }

  private uninstallAuthFormErrorTraps(): void {
    if (this._authFormErrorHandler) {
      window.removeEventListener('error', this._authFormErrorHandler);
      this._authFormErrorHandler = null;
    }
    if (this._authFormRejectionHandler) {
      window.removeEventListener('unhandledrejection', this._authFormRejectionHandler);
      this._authFormRejectionHandler = null;
    }
  }

  cancelAuthForm(): void {
    this.faxAuthLog('cancelAuthForm() called (user clicked Back to Details / × close)', {
      authHasUnsavedChanges: this.authDetailsRef?.authHasUnsavedChanges?.() ?? null,
    });
    // Manual cancel of the visible Generate Auth panel.
    // Pipeline cancels are handled separately by onAutoAuthCancelled().
    if (this.authDetailsRef?.authHasUnsavedChanges?.()) {
      this.discardDialogContext = 'backToDetails';
      this._pendingDiscardAction = () => {
        this.uninstallAuthFormErrorTraps();
        this.showAuthForm = false;
        this.currentFaxPrefill = null;
      };
      this.showDiscardDialog = true;
    } else {
      this.uninstallAuthFormErrorTraps();
      this.showAuthForm = false;
      this.currentFaxPrefill = null;
    }
  }

  dismissDiscardDialog(): void {
    this.showDiscardDialog = false;
    this._pendingDiscardAction = null;
  }

  confirmDiscardChanges(): void {
    this.showDiscardDialog = false;
    const action = this._pendingDiscardAction;
    this._pendingDiscardAction = null;
    action?.();
  }

  onAuthSaved(event: { authNumber: string; authId: number }): void {
    this.faxAuthLog('✅ onAuthSaved() FIRED', {
      event,
      hasActivePipeline: !!this._activeAutoAuthPipeline,
      isAutoSavePipelineActive: this.isAutoSavePipelineActive,
      currentFaxPrefill_memberId: this.currentFaxPrefill?.memberId,
      currentFaxPrefill_memberDetailsId: this.currentFaxPrefill?.memberDetailsId,
      selectedFax_faxId: this.selectedFax?.faxId,
    });

    // ── Determine whether this came from the pipeline or the manual form ───────
    //
    // A pipeline emit is identified by EITHER:
    //   • _activeAutoAuthPipeline being set (the normal case), OR
    //   • isAutoSavePipelineActive being true (the timeout-cleanup case where
    //     we cleared _activeAutoAuthPipeline early but the hidden form's
    //     save() eventually completed and emitted anyway).
    //
    // Without the second check, a delayed emit from the hidden form would
    // fall through to the "manual" branch and silently close the user's
    // visible Generate Auth panel — looking for all the world like the
    // Save Authorization click did nothing.
    const wasFromHiddenPipeline = this.isAutoSavePipelineActive;
    const pipeline = this._activeAutoAuthPipeline;
    this._activeAutoAuthPipeline = null;

    if (pipeline || wasFromHiddenPipeline) {
      // Pipeline auto-save: tear down the hidden instance only.
      // showAuthForm / currentFaxPrefill are untouched — manual flow is isolated.
      this.isAutoSavePipelineActive = false;
      this.pipelineFaxPrefill = null;

      if (pipeline) {
        this.setStep(pipeline, 'auth', 'success',
          `Authorization ${event.authNumber} created — Status: Closed | Decision: Auto Approved`);
        this.setStep(pipeline, 'finalize', 'running',
          'Updating fax status and linking authorization record…');
      }
    } else {
      // Manual Generate Auth flow: close the visible form panel as before.
      this.uninstallAuthFormErrorTraps();
      this.showAuthForm = false;
      this.currentFaxPrefill = null;
    }

    // Reflect linked state in the preview panel when a fax is open
    const nowIso = new Date().toISOString();
    this.linkedAuthMeta = {
      linkedAuthNumber: event.authNumber,
      linkedAuthId: event.authId,
      linkedAt: nowIso
    };
    this.resetSmartAuthCheckState();

    // ── Resolve which fax record to update ────────────────────────────────────
    // CRITICAL: when a pipeline is driving the save it KNOWS which fax it is
    // working on — that may be a child split, not whatever the user happens
    // to have selected in the listing. Always prefer pipeline.faxId for
    // pipeline-driven saves; only fall back to selectedFax for manual saves
    // (where pipeline is null).
    const faxIdToUpdate: number | null =
      pipeline?.faxId ?? this.selectedFax?.faxId ?? null;
    const fileNameForUpdate: string =
      pipeline?.fileName ?? this.selectedFax?.fileName ?? 'unknown';
    const priorityForUpdate: 1 | 2 | 3 =
      (this.selectedFax?.priority ?? 2) as 1 | 2 | 3;

    // Merge existing metaJson so we never lose previous pipeline/processing metadata.
    // For pipeline-driven updates against a child split, selectedFax may not match
    // the child being updated — in that case skip the inherited meta.
    let existingMeta: any = {};
    if (this.selectedFax?.metaJson && this.selectedFax.faxId === faxIdToUpdate) {
      try { existingMeta = JSON.parse(this.selectedFax.metaJson); } catch { /* ignore */ }
    }

    if (faxIdToUpdate) {
      const updatedMeta = {
        ...existingMeta,
        linkedAuthNumber: event.authNumber,
        linkedAuthId: event.authId,
        linkedAt: nowIso,
        ...(pipeline ? { autoApproved: true } : {})
      };

      const toSave: any = {
        faxId: faxIdToUpdate,
        workBasket: '2',
        fileName: fileNameForUpdate,
        priority: priorityForUpdate,
        status: 'Processed',
        metaJson: JSON.stringify(updatedMeta),
        updatedOn: nowIso,
        updatedBy: this.currentUserId ?? 1
      };

      this.api.updateFaxFile(toSave).subscribe({
        next: () => {
          if (pipeline) {
            this.setStep(pipeline, 'finalize', 'success',
              'Fax moved to Processed and authorization record linked');
            pipeline.outcome = 'auto-approved';
            pipeline.authNumber = event.authNumber;
            pipeline.authId = event.authId;
            this.autoAuthPipelines = [...this.autoAuthPipelines];
            // Release the orchestrator gate AFTER the fax update so the next
            // pipeline starts only once this child is fully Processed.
            this.resolvePipelineDone(pipeline.id);
          }
          this.reload();
        },
        error: (err) => {
          console.error('Failed to link fax to auth:', err);
          if (pipeline) {
            // Auth was created successfully — surface it even if fax update failed
            this.setStep(pipeline, 'finalize', 'error',
              `Status update failed — authorization ${event.authNumber} was created successfully`);
            pipeline.outcome = 'auto-approved';
            pipeline.authNumber = event.authNumber;
            pipeline.authId = event.authId;
            this.autoAuthPipelines = [...this.autoAuthPipelines];
            this.resolvePipelineDone(pipeline.id);
          }
          this.toast(`Authorization ${event.authNumber} created but fax record update failed.`, true);
          this.reload();
        }
      });
    } else {
      // No fax context at all — surface the auth number and complete
      if (pipeline) {
        this.setStep(pipeline, 'finalize', 'success', 'Authorization created successfully');
        pipeline.outcome = 'auto-approved';
        pipeline.authNumber = event.authNumber;
        pipeline.authId = event.authId;
        this.autoAuthPipelines = [...this.autoAuthPipelines];
        this.resolvePipelineDone(pipeline.id);
      }
      this.toast(`Authorization ${event.authNumber} created successfully.`);
      this.reload();
    }
  }

  getLinkedAuth(row: FaxFile): string | null {
    if (!row.metaJson) return null;
    try {
      const meta = JSON.parse(row.metaJson);
      return meta?.linkedAuthNumber || null;
    } catch { return null; }
  }

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
    } catch { return null; }
  }

  onAuthClick(authNumber: string, authId: number): void {
    if (!authId) return;
    const memberId = this.selectedFax?.memberId;
    const memberDetailsId = this.selectedFax?.memberDetailsId;
    if (!memberId || !memberDetailsId) {
      this.toast(`Authorization ${authNumber} (ID: ${authId})`, false);
      return;
    }

    const memId = String(memberId);
    const memDetId = String(memberDetailsId);
    const authNo = String(authNumber);

    const urlTree = this.router.createUrlTree([
      '/member-info',
      memId,
      'auth',
      authNo,
      'details'
    ]);
    const tabRoute = this.router.serializeUrl(urlTree);
    const tabLabel = `Auth # ${authNo}`;

    const existingTab = this.headerService.getTabs().find(t => t.route === tabRoute);
    if (existingTab) {
      this.headerService.selectTab(tabRoute);
    } else {
      this.headerService.addTab(tabLabel, tabRoute, memId, memDetId);
    }
    this.router.navigateByUrl(tabRoute);
  }

}

function cryptoRandom(): string {
  const bytes = new Uint8Array(16);
  (window.crypto || (window as any).msCrypto).getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}
