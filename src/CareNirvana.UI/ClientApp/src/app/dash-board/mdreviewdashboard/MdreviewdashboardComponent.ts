import { Component, EventEmitter, Output, ViewChild } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { MatTableDataSource } from '@angular/material/table';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { DashboardServiceService, UpdateActivityLinesRequest } from 'src/app/service/dashboard.service.service';
import { HeaderService } from 'src/app/service/header.service';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from 'src/app/service/auth.service';
import { MemberService } from 'src/app/service/shared-member.service';
import { Observable, Subscription } from 'rxjs';
import { CrudService } from 'src/app/service/crud.service';

type Row = any;
type UiSmartOption = { value: string; label: string };

@Component({
  selector: 'app-mdreviewdashboard',
  templateUrl: './mdreviewdashboard.component.html',
  styleUrl: './mdreviewdashboard.component.css'
})
export class MdreviewdashboardComponent {

  // ── Core state ──────────────────────────────────────────────────
  selectedDue      = new Set<'OVERDUE' | 'TODAY' | 'FUTURE'>();
  selectedAuthData: any = {};
  auths:           any[] = [];
  allActivities:   any[] = [];
  selectedIndex    = 0;
  selectedAuth:    any | null = null;
  selectedAuthRaw: Row | null = null;
  showSummary      = false;

  // ── Decision state ───────────────────────────────────────────────
  decisionStatusOptions:     UiSmartOption[] = [{ value: '', label: 'Select' }];
  decisionStatusCodeOptions: UiSmartOption[] = [{ value: '', label: 'Select' }];
  private decisionStatusCodeRaw: any[] = [];

  overallDecisionStatus:     string  = '';
  overallDecisionStatusCode: string  = '';
  requestMoreInformation:    boolean = false;
  mdNotesText:               string  = '';

  overallInitialRecommendation = '-';
  selectedRowforRefresh        = 0;
  firstServiceLineComment:     string | null = null;

  // ── Service lines loading ────────────────────────────────────────
  serviceLinesLoading = false;
  private serviceLinesSub?: Subscription;

  // ── Toast notification ───────────────────────────────────────────
  toastVisible = false;
  toastHiding  = false;
  toastType: 'success' | 'error' | 'warning' | 'info' = 'success';
  toastTitle   = '';
  toastMessage = '';
  private toastTimer?: ReturnType<typeof setTimeout>;

  // ── Inline alert (inside review pane) ───────────────────────────
  inlineAlert: { message: string; type: 'error' | 'warning' | 'info' } | null = null;

  // ── Form validation flag ─────────────────────────────────────────
  decisionSubmitted = false;

  // ── Unsaved changes dialog ───────────────────────────────────────
  showUnsavedDialog = false;

  // ── Table / filter state ─────────────────────────────────────────
  displayedColumns: string[] = [
    'module', 'member', 'authNumber', 'createdOn',
    'referredTo', 'activityType', 'followUpDate', 'dueDate', 'status', 'review'
  ];

  dataSource    = new MatTableDataSource<any>([]);
  rawData:      any[] = [];
  showFilters   = false;
  filtersForm!: FormGroup;
  quickSearchTerm = '';

  dueChip: 'OVERDUE' | 'TODAY' | 'FUTURE' | null = null;
  overdueCount  = 0;
  dueTodayCount = 0;
  dueFutureCount = 0;
  expandedElement: any | null = null;

  // ── Status filter: DEFAULT hides Denied, ALL shows everything, APPROVED shows only approved ──
  statusFilter: 'DEFAULT' | 'ALL' | 'APPROVED' = 'DEFAULT';

  // Summary widgets (kept for possible future use)
  summaryStats = [
    { label: 'Urgent Auths',    value: 65, icon: 'assignment_ind' },
    { label: 'Pending Reviews', value: 20, icon: 'priority_high'  },
    { label: 'Reviewed Today',  value: 5,  icon: 'report_problem' },
    { label: 'Over Due',        value: 40, icon: 'check_circle'   }
  ];

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort)      sort!:      MatSort;
  @Output() addClicked = new EventEmitter<string>();

  constructor(
    private fb:             FormBuilder,
    private activtyService: DashboardServiceService,
    private headerService:  HeaderService,
    private router:         Router,
    private authService:    AuthService,
    private memberService:  MemberService,
    private route:          ActivatedRoute,
    private crudService:    CrudService
  ) {}

  // ================================================================
  // LIFECYCLE
  // ================================================================

  ngOnInit(): void {
    this.filtersForm = this.fb.group({});
    this.loadData();
    this.loadDecisionDropdowns();
  }

  ngAfterViewInit(): void {
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort      = this.sort;

    this.dataSource.filterPredicate = (row: any, filter: string) => {
      const q = (filter || '').trim().toLowerCase();
      if (!q) return true;

      const firstName = row?.FirstName ?? row?.firstName ?? '';
      const lastName  = row?.LastName  ?? row?.lastName  ?? '';
      const name      = `${firstName} ${lastName}`.trim();

      const fields = [
        row?.Module       ?? row?.module,
        name,
        firstName,
        lastName,
        (row?.MemberId    ?? row?.memberId)?.toString(),
        (row?.AuthNumber  ?? row?.authNumber)?.toString(),
        row?.UserName     ?? row?.userName,
        row?.ActivityType ?? row?.activityType,
        row?.Status       ?? row?.status
      ];
      return fields.some(v => (v ?? '').toString().toLowerCase().includes(q));
    };
  }

  // ================================================================
  // TOAST NOTIFICATIONS
  // ================================================================

  showToast(
    title:    string,
    message:  string,
    type:     'success' | 'error' | 'warning' | 'info' = 'success',
    duration  = 4000
  ): void {
    this.toastTitle   = title;
    this.toastMessage = message;
    this.toastType    = type;
    this.toastVisible = true;
    this.toastHiding  = false;

    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.dismissToast(), duration);
  }

  dismissToast(): void {
    this.toastHiding = true;
    setTimeout(() => {
      this.toastVisible = false;
      this.toastHiding  = false;
    }, 200);
  }

  // ================================================================
  // INLINE ALERT
  // ================================================================

  showInlineAlert(message: string, type: 'error' | 'warning' | 'info' = 'error'): void {
    this.inlineAlert = { message, type };
  }

  dismissInlineAlert(): void {
    this.inlineAlert = null;
  }

  // ================================================================
  // REVIEW: open / navigate / close
  // ================================================================

  onReviewClick(row: Row): void {
    const k   = this.keyOf(row);
    const idx = this.navList.findIndex(r => this.keyOf(r) === k);
    this.selectedIndex = idx >= 0 ? idx : 0;

    this.selectedAuthRaw  = row;
    this.selectedAuth     = this.mapRowToSelected(row);
    this.selectedAuthData = this.mapRowToSelectedAuthData(row);

    setTimeout(() => {
      const el = document.querySelector('.col-middle') as HTMLElement | null;
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);

    this.showSummary      = false;
    this.inlineAlert      = null;
    this.decisionSubmitted = false;

    const actId = Number(
      row.AuthActivityId ?? row.authActivityId ??
      row.ActivityId    ?? row.activityId ?? 0
    );
    this.selectedRowforRefresh = actId;
    this.loadServiceLinesFor(actId);
  }

  onPrevious(): void {
    if (!this.navList?.length) return;
    this.selectedIndex   = Math.max(0, this.selectedIndex - 1);
    const row            = this.navList[this.selectedIndex];
    this.selectedAuthRaw  = row;
    this.selectedAuth     = this.mapRowToSelected(row);
    this.selectedAuthData = this.mapRowToSelectedAuthData(row);
    this.inlineAlert      = null;
    this.decisionSubmitted = false;
    const actId = Number(
      row.AuthActivityId ?? row.authActivityId ??
      row.ActivityId    ?? row.activityId ?? 0
    );
    this.loadServiceLinesFor(actId);
  }

  onNext(): void {
    if (!this.navList?.length) return;
    this.selectedIndex   = Math.min(this.navList.length - 1, this.selectedIndex + 1);
    const row            = this.navList[this.selectedIndex];
    this.selectedAuthRaw  = row;
    this.selectedAuth     = this.mapRowToSelected(row);
    this.selectedAuthData = this.mapRowToSelectedAuthData(row);
    this.inlineAlert      = null;
    this.decisionSubmitted = false;
    const actId = Number(
      row.AuthActivityId ?? row.authActivityId ??
      row.ActivityId    ?? row.activityId ?? 0
    );
    this.loadServiceLinesFor(actId);
  }

  /**
   * Called by the Close button.
   * If the user has unsaved form data, shows the confirmation dialog first.
   * Otherwise, closes immediately.
   */
  requestClose(): void {
    if (this.hasUnsavedChanges()) {
      this.showUnsavedDialog = true;
    } else {
      this.closeReview();
    }
  }

  /** User confirmed they want to discard unsaved changes and close. */
  confirmClose(): void {
    this.showUnsavedDialog = false;
    this.closeReview();
  }

  /** User chose to stay in the review pane. */
  cancelClose(): void {
    this.showUnsavedDialog = false;
  }

  /**
   * Returns true if the user has entered any decision data that hasn't been saved.
   */
  hasUnsavedChanges(): boolean {
    return !!(
      this.overallDecisionStatus ||
      this.overallDecisionStatusCode ||
      (this.mdNotesText ?? '').trim() ||
      this.requestMoreInformation
    );
  }

  closeReview(): void {
    this.selectedAuth      = null;
    this.selectedAuthData  = null;
    this.showSummary       = false;
    this.inlineAlert       = null;
    this.decisionSubmitted = false;
    // Reset decision form
    this.overallDecisionStatus     = '';
    this.overallDecisionStatusCode = '';
    this.mdNotesText               = '';
    this.requestMoreInformation    = false;
  }

  onCardSelect(row: any, i: number): void {
    this.selectedIndex    = i;
    this.selectedAuthRaw  = row;
    this.selectedAuth     = this.mapRowToSelected(row);
    this.selectedAuthData = this.mapRowToSelectedAuthData(row);
    this.inlineAlert      = null;
    this.decisionSubmitted = false;
    const actId = Number(
      row.AuthActivityId ?? row.authActivityId ??
      row.ActivityId    ?? row.activityId ?? 0
    );
    this.loadServiceLinesFor(actId);
  }

  toggleSummary(): void {
    this.showSummary = !this.showSummary;
  }

  // ================================================================
  // SERVICE LINES LOADING
  // ================================================================

  private loadServiceLinesFor(activityId: number): void {
    if (!this.selectedAuth) return;

    this.serviceLinesSub?.unsubscribe();
    this.serviceLinesLoading = true;

    const obs = this.activtyService.getwqactivitylinedetails(activityId) as Observable<any[]>;
    this.serviceLinesSub = obs.subscribe({
      next: (rows) => {
        const data       = Array.isArray(rows) ? rows : [];
        const normalized = this.normalizeLines(data);

        this.selectedAuth.lines       = normalized;
        this.selectedAuth.serviceLines = normalized;
        console.log(`Loaded ${normalized.length} service lines for activity ${activityId}`, normalized);
        this.firstServiceLineComment = normalized.find(l => !!l.comment)?.comment ?? null;
        this.computeOverallInitialRecommendation(normalized);
        this.serviceLinesLoading = false;
      },
      error: () => {
        this.selectedAuth.lines       = [];
        this.selectedAuth.serviceLines = [];
        this.serviceLinesLoading = false;
        this.showToast('Load Failed', 'Could not load service lines. Please try again.', 'error');
      }
    });
  }

  // ================================================================
  // DATA LOADING
  // ================================================================

  private getMyActivities$(): Observable<any[]> {
    return this.activtyService.getpendingwqactivitydetails(sessionStorage.getItem('loggedInUserid'));
  }

  private loadData(): void {
    this.getMyActivities$().subscribe({
      next: rows => {
        // Store ALL rows — filtering is done dynamically in recomputeAll()
        this.allActivities = Array.isArray(rows) ? rows : [];
        this.rawData = this.allActivities;
        console.log('Loaded activities', this.allActivities);
        this.recomputeAll();
      },
      error: () => {
        this.allActivities = [];
        this.rawData       = [];
        this.recomputeAll();
      }
    });
  }

  // ================================================================
  // FILTER / SEARCH
  // ================================================================

  toggleFilters(): void { this.showFilters = !this.showFilters; }

  onQuickSearch(ev: Event): void {
    const v = (ev.target as HTMLInputElement).value ?? '';
    this.quickSearchTerm = v.trim().toLowerCase();
    this.recomputeAll();
  }

  isDueSelected(kind: 'OVERDUE' | 'TODAY' | 'FUTURE'): boolean {
    return this.selectedDue.has(kind);
  }

  setDueChip(kind: 'OVERDUE' | 'TODAY' | 'FUTURE'): void {
    if (this.selectedDue.has(kind)) { this.selectedDue.delete(kind); }
    else                            { this.selectedDue.add(kind);    }
    this.recomputeAll();
  }

  isStatusSelected(k: 'DEFAULT' | 'ALL' | 'APPROVED'): boolean {
    return this.statusFilter === k;
  }

  setStatusChip(k: 'ALL' | 'APPROVED'): void {
    // Toggling an already-active chip returns to DEFAULT
    this.statusFilter = (this.statusFilter === k) ? 'DEFAULT' : k;
    this.recomputeAll();
  }

  private recomputeAll(): void {
    this.computeDueCounts();

    // ── Step 1: Apply status filter ──────────────────────────────
    let base: any[];
    if (this.statusFilter === 'ALL') {
      // Show every record regardless of status
      base = [...this.allActivities];
    } else if (this.statusFilter === 'APPROVED') {
      // Show only approved / completed
      base = this.allActivities.filter(r => {
        const s = this.normalizeStatus(r?.status ?? r?.Status);
        return s === 'approved';
      });
    } else {
      // DEFAULT: exclude Denied, Approved, and Completed
      base = this.allActivities.filter(r => {
        const s = (r?.status ?? r?.Status ?? '').toString().trim().toLowerCase();
        return s !== 'denied' && s !== 'approved' && s !== 'completed';
      });
    }

    // ── Step 2: Apply due-date chip filter ───────────────────────
    if (this.selectedDue.size > 0) {
      const today = new Date();
      base = base.filter(r => {
        const d = this.toDate(r?.dueDate ?? r?.DueDate ?? r?.authDueDate ?? r?.AuthDueDate);
        if (!d) return false;
        const cmp = this.compareDateOnly(d, today);
        let match = false;
        if (this.selectedDue.has('OVERDUE') && cmp < 0)  match = true;
        if (this.selectedDue.has('TODAY')   && cmp === 0) match = true;
        if (this.selectedDue.has('FUTURE')  && cmp > 0)  match = true;
        return match;
      });
    }

    this.dataSource.data   = base;
    this.dataSource.filter = this.quickSearchTerm;
    if (this.paginator) this.paginator.firstPage();
  }

  private computeDueCounts(): void {
    // Counts are based on the DEFAULT-visible set (non-denied, non-approved, non-completed)
    const base = this.allActivities.filter(r => {
      const s = (r?.status ?? r?.Status ?? '').toString().trim().toLowerCase();
      return s !== 'denied' && s !== 'approved' && s !== 'completed';
    });

    const today = new Date();
    const counts = base.reduce((acc, r) => {
      const d = this.toDate(r?.dueDate ?? r?.DueDate ?? r?.authDueDate ?? r?.AuthDueDate);
      if (!d) return acc;
      const cmp = this.compareDateOnly(d, today);
      if (cmp < 0) acc.overdue++;
      else if (cmp === 0) acc.today++;
      else acc.future++;
      return acc;
    }, { overdue: 0, today: 0, future: 0 });

    this.overdueCount   = counts.overdue;
    this.dueTodayCount  = counts.today;
    this.dueFutureCount = counts.future;
  }

  // ================================================================
  // DECISION DROPDOWNS
  // ================================================================

  loadDecisionDropdowns(): void {
    this.crudService.getData('um', 'decisionstatus').subscribe({
      next: (res: any) => {
        const arr = Array.isArray(res) ? res : (res?.status ?? res?.data ?? res?.items ?? res?.result ?? []);
        this.decisionStatusOptions = [
          { value: '', label: 'Select' },
          ...(arr ?? []).map((x: any) => {
            const value = x?.id ?? x?.Id ?? x?.decisionStatusId ?? x?.DecisionStatusId ?? x?.value ?? x?.Value ?? '';
            const label = x?.decisionStatus ?? x?.DecisionStatus ?? x?.name ?? x?.Name ?? x?.label ?? x?.Label ?? String(value ?? '');
            return { value: String(value ?? ''), label: String(label ?? '') } as UiSmartOption;
          })
        ];
      },
      error: () => { this.decisionStatusOptions = [{ value: '', label: 'Select' }]; }
    });

    this.crudService.getData('um', 'decisionstatuscode').subscribe({
      next: (res: any) => {
        const arr = Array.isArray(res) ? res : (res?.statusCode ?? res?.data ?? res?.items ?? res?.result ?? []);
        this.decisionStatusCodeRaw = (arr ?? []).slice();

        this.decisionStatusCodeOptions = [
          { value: '', label: 'Select' },
          ...(this.decisionStatusCodeRaw ?? []).map((x: any) => {
            const value = x?.id ?? x?.Id ?? x?.decisionStatusCode ?? x?.DecisionStatusCode ?? x?.value ?? x?.Value ?? '';
            const label = x?.decisionStatusCode ?? x?.DecisionStatusCode ?? x?.decisionStatusName ?? x?.DecisionStatusName ?? x?.name ?? x?.Name ?? x?.label ?? x?.Label ?? String(value ?? '');
            return { value: String(value ?? ''), label: String(label ?? '') } as UiSmartOption;
          })
        ];

        if (this.overallDecisionStatus) this.onDecisionStatusChanged();
      },
      error: () => {
        this.decisionStatusCodeRaw     = [];
        this.decisionStatusCodeOptions = [{ value: '', label: 'Select' }];
      }
    });
  }

  onDecisionStatusChanged(): void {
    const selectedStatusId = String(this.overallDecisionStatus ?? '');
    const filtered = (this.decisionStatusCodeRaw ?? []).filter((x: any) => {
      const sid = String(x?.decisionStatusId ?? x?.DecisionStatusId ?? '');
      return !!selectedStatusId && sid === selectedStatusId;
    });

    this.decisionStatusCodeOptions = [
      { value: '', label: 'Select' },
      ...(filtered ?? []).map((x: any) => {
        const value = x?.id ?? x?.Id ?? x?.decisionStatusCode ?? x?.DecisionStatusCode ?? '';
        const label = x?.decisionStatusCode ?? x?.DecisionStatusCode ?? x?.decisionStatusName ?? x?.DecisionStatusName ?? String(value ?? '');
        return { value: String(value ?? ''), label: String(label ?? '') } as UiSmartOption;
      })
    ];

    const exists = this.decisionStatusCodeOptions.some(o => String(o.value) === String(this.overallDecisionStatusCode ?? ''));
    if (!exists) this.overallDecisionStatusCode = '';
  }

  // ================================================================
  // DECISION ACTIONS (Submit / Save & Continue)
  // ================================================================

  submitDecision(): void {
    this.decisionSubmitted = true;
    this.dismissInlineAlert();

    const selectedLines = this.getSelectedLines();
    if (!selectedLines.length) {
      this.showInlineAlert('Please select at least one service line before submitting.', 'warning');
      return;
    }

    if (!this.overallDecisionStatus) {
      this.showInlineAlert('Decision Status is required. Please select a value before submitting.', 'error');
      return;
    }

    this.updateSelectedLines('Completed', true);
  }

  saveAndContinue(): void {
    this.dismissInlineAlert();

    const selectedLines = this.getSelectedLines();
    if (!selectedLines.length) {
      this.showInlineAlert('Please select at least one service line to save.', 'warning');
      return;
    }

    this.updateSelectedLines('InProgress', false);
  }

  private updateSelectedLines(status: 'Completed' | 'InProgress', autoNext: boolean): void {
    if (!this.selectedAuth) return;

    const selectedLines = this.getSelectedLines();
    if (!selectedLines.length) return;

    const decisionLabel =
      this.getOptionLabel(this.decisionStatusOptions, this.overallDecisionStatus) ||
      String(this.overallDecisionStatus ?? '');

    if (status === 'Completed' && (!decisionLabel || decisionLabel === 'Select')) {
      this.showInlineAlert('Decision Status is required before submitting.', 'error');
      return;
    }

    const codeLabel =
      this.getOptionLabel(this.decisionStatusCodeOptions, this.overallDecisionStatusCode) ||
      String(this.overallDecisionStatusCode ?? '');

    const note    = (this.mdNotesText ?? '').trim();
    const reqMore = !!this.requestMoreInformation;

    const composedNotes = [
      codeLabel ? `Decision Status Code: ${codeLabel}` : '',
      reqMore   ? 'Request more information' : '',
      note      ? note : ''
    ].filter(Boolean).join(', ');

    const lineIds = selectedLines.map(l => l.lineId).filter((x: any) => x != null);

    const payload: UpdateActivityLinesRequest = {
      lineIds,
      status,
      mdDecision:       decisionLabel,
      mdNotes:          composedNotes,
      reviewedByUserId: 1
    };

    this.activtyService.updateActivityLines(payload).subscribe({
      next: () => {
        const actId = Number(this.selectedRowforRefresh || this.selectedAuth?.authActivityId || 0);

        // ── Optimistic UI: reflect the decision label immediately on selected lines ──
        // This ensures MD Status shows the actual decision (e.g. "Approved", "Denied")
        // right away, without waiting for the API reload to complete.
        selectedLines.forEach(l => { l.mdDecision = decisionLabel; });

        // Reload service lines for the current review pane (authoritative refresh)
        if (actId) this.loadServiceLinesFor(actId);

        if (status === 'Completed') {
          // Reset decision form silently — no success toast per UX requirement
          this.decisionSubmitted         = false;
          this.overallDecisionStatus     = '';
          this.overallDecisionStatusCode = '';
          this.mdNotesText               = '';
          this.requestMoreInformation    = false;

          // ── Refresh the activity table in the background ──────────
          this.loadData();
        }
        // Note: "Save & Continue" also refreshes silently, no toast shown

        if (autoNext) this.onNext();
      },
      error: (err: any) => {
        console.error('Update failed', err);
        const msg = err?.error?.message ?? err?.message ?? 'An unexpected error occurred. Please try again.';
        this.showToast('Save Failed', msg, 'error', 6000);
      }
    });
  }

  // ================================================================
  // SERVICE LINE SELECTION
  // ================================================================

  trackByLineId = (_: number, l: any) => l?.lineId ?? l?.LineId ?? l?.id ?? l?.Id ?? _;

  toggleSelectAllReviewLines(checked: boolean): void {
    const lines = this.selectedAuth?.lines ?? [];
    (lines as any[]).forEach(l => (l.selected = !!checked));
  }

  onToggleReviewLine(line: any, checked: boolean): void {
    if (!line) return;
    line.selected = !!checked;
  }

  hasSelectedReviewLines(): boolean {
    const lines = this.selectedAuth?.lines ?? [];
    return (lines as any[]).some(l => !!l.selected);
  }

  areAllReviewLinesSelected(): boolean {
    const lines = this.selectedAuth?.lines ?? [];
    return (lines as any[]).length > 0 && (lines as any[]).every(l => !!l.selected);
  }

  private getSelectedLines(): any[] {
    return (this.selectedAuth?.lines ?? []).filter((l: any) => !!l.selected);
  }

  // ================================================================
  // TEMPLATE HELPERS
  // ================================================================

  trackByAuth = (_: number, item: Row) => this.keyOf(item) ?? _;

  isSame(a: Row, b: Row): boolean {
    if (!a || !b) return false;
    return this.keyOf(a) === this.keyOf(b);
  }

  isSelected(index: number): boolean { return this.selectedIndex === index; }

  keyOf(r: any): string | number | undefined {
    return this.normId(
      r?.AuthActivityId ?? r?.authActivityId ??
      r?.AuthNumber     ?? r?.authNumber     ??
      r?.id             ?? r?.AuthNo         ?? r?.authNo
    );
  }

  private normId(v: any): string | undefined {
    return v === null || v === undefined ? undefined : String(v).trim();
  }

  getDate(val: any): string {
    const d = this.normalizeDate(val);
    return d ? d.toLocaleDateString() : '—';
  }

  dueChipClass(row: Row): string {
    const d = this.normalizeDate(row?.AuthDueDate ?? row?.authDueDate ?? row?.DueDate ?? row?.dueDate);
    if (!d) return 'chip-neutral';
    const cmp = this.compareToToday(d);
    if (cmp < 0) return 'chip-red';
    if (cmp > 0) return 'chip-green';
    return 'chip-orange';
  }

  dueChipText(row: Row): string {
    const d = this.normalizeDate(row?.AuthDueDate ?? row?.authDueDate ?? row?.DueDate ?? row?.dueDate);
    if (!d) return '—';
    const cmp = this.compareToToday(d);
    if (cmp < 0) return 'Overdue';
    if (cmp > 0) return 'Due in Future';
    return 'Due Today';
  }

  getDueDateClass(dateVal: any): string {
    const d = this.toDate(dateVal);
    if (!d) return 'due-unknown';
    const cmp = this.compareDateOnly(d, new Date());
    if (cmp < 0) return 'due-red';
    if (cmp === 0) return 'due-amber';
    return 'due-green';
  }

  getDaysLeftLabel(dateVal: any): string {
    const d = this.toDate(dateVal);
    if (!d) return '';
    const today = new Date();
    const one   = 24 * 60 * 60 * 1000;
    const d0    = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const t0    = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const diff  = Math.round((d0 - t0) / one);
    if (diff < 0)   return `Overdue by ${Math.abs(diff)}d`;
    if (diff === 0) return 'Due today';
    return `In ${diff}d`;
  }

  /**
   * Converts raw API mdDecision values to user-friendly labels.
   * "NotReviewed" / "Not Reviewed" / empty → "Yet to review"
   */
  displayMdDecision(v: string | null | undefined): string {
    const s = (v ?? '').toString().trim().toLowerCase();
    if (!s || s === 'notreviewed' || s === 'not reviewed' || s === 'not_reviewed') {
      return 'Yet to review';
    }
    return v!.trim();
  }

  /**
   * e.g. "Approve" → "Approved", "Deny" → "Denied"
   */
  displayInitialRecommendation(v: string | null | undefined): string {
    if (!v) return '—';
    const s = v.trim().toLowerCase();
    if (s === 'approve')                              return 'Approved';
    if (s === 'deny')                                 return 'Denied';
    if (s === 'partial' || s === 'partialapprove' || s === 'partiallyapprove') return 'Partially Approved';
    if (s === 'pend' || s === 'pending')              return 'Pending';
    return v.trim();
  }

  mdDecisionClass(decision: string | null | undefined): string {
    const v = (decision ?? '').toString().trim().toLowerCase();
    if (v === '' || v === 'not reviewed' || v === 'notreviewed' || v === 'yet to review') return 'md-notreviewed';
    if (v === 'pending')                                          return 'md-pending';
    if (v === 'approved' || v === 'partially approved' || v === 'partiallyapproved') return 'md-approved';
    if (v === 'denied'   || v === 'rejected')                    return 'md-denied';
    if (v === 'rfi' || v === 'request more information' || v === 'requestmoreinformation') return 'md-rfi';
    return 'md-neutral';
  }

  /** Maps a service line status to a CSS class for the status-pill. */
  getLineStatusClass(status: string | null | undefined): string {
    const s = (status ?? '').trim().toLowerCase();
    if (!s || s === 'not reviewed' || s === 'notreviewed') return 'sp-notreviewed';
    if (s.includes('approved'))                            return 'sp-approved';
    if (s.includes('denied'))                              return 'sp-denied';
    if (s.includes('progress') || s === 'inprogress')     return 'sp-inprogress';
    if (s.includes('pending'))                             return 'sp-pending';
    return 'sp-notreviewed';
  }

  /**
   * Maps a status string to a status-badge CSS class.
   */
  getStatusClass(status: string | null | undefined): string {
    const s = (status ?? '').trim().toLowerCase();
    if (!s)                              return 'status-default';
    if (s === 'open')                    return 'status-open';
    if (s.includes('pending') || s === 'not reviewed' || s === 'notreviewed') return 'status-pending';
    if (s.includes('progress') || s === 'inprogress')                         return 'status-in-progress';
    if (s === 'new')                     return 'status-new';
    if (s === 'escalated')               return 'status-escalated';
    if (s === 'completed' || s === 'closed' || s === 'approved') return 'status-completed';
    return 'status-default';
  }

  /**
   * Maps a module name to a mod-badge CSS class.
   */
  getModuleColorClass(module: string | null | undefined): string {
    const m = (module ?? '').trim().toUpperCase();
    if (m === 'UM') return 'mod-um';
    if (m === 'AG') return 'mod-ag';
    if (m === 'CM') return 'mod-cm';
    return 'mod-default';
  }

  computeOverallInitialRecommendation(lines?: any[]): void {
    const rows = (lines ?? this.selectedAuth?.lines ?? this.selectedAuth?.serviceLines ?? []) as Array<any>;
    const vals = rows
      .map(r => this.normalizeIR((r?.InitialRecommendation ?? r?.initialRecommendation)))
      .filter(Boolean);

    if (!vals.length) { this.overallInitialRecommendation = '—'; return; }

    const hasApproved = vals.includes('approved');
    const hasDenied   = vals.includes('denied');
    const hasPending  = vals.includes('pending') || vals.includes('other');

    if (hasApproved && !hasDenied && !hasPending) { this.overallInitialRecommendation = 'Approved'; return; }
    if (hasDenied   && !hasApproved && !hasPending){ this.overallInitialRecommendation = 'Denied';  return; }
    if (hasApproved && hasDenied)                  { this.overallInitialRecommendation = 'Mixed';   return; }
    if (hasApproved && !hasDenied)                 { this.overallInitialRecommendation = 'Approved'; return; }
    if (hasDenied   && !hasApproved)               { this.overallInitialRecommendation = 'Denied';  return; }
    this.overallInitialRecommendation = 'Pending';
  }

  getOverallIrClass(): string {
    const v = (this.overallInitialRecommendation || '').trim().toLowerCase();
    if (v === 'approved') return 'md-approved';
    if (v === 'denied')   return 'md-denied';
    if (v === 'mixed')    return 'md-mixed';
    if (v === 'pending')  return 'md-pending';
    return 'md-notreviewed';
  }

  // ================================================================
  // NAVIGATION (member / auth tab routing)
  // ================================================================

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

  onAuthClick(authNumber: string = '', memId: string = '', memDetailsId: string = ''): void {
    this.addClicked.emit(authNumber);
    this.memberService.setIsCollapse(true);

    const memberId = memId || this.route.parent?.snapshot.paramMap.get('id') || '';
    if (!memberId) {
      console.error('Invalid memberId for auth tab route');
      return;
    }

    const authNo   = String(authNumber);
    const urlTree  = this.router.createUrlTree([
      '/member-info',
      memberId,
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
      this.headerService.addTab(tabLabel, tabRoute, String(memberId), memDetailsId);
    }
    this.router.navigateByUrl(tabRoute);
  }

  // ================================================================
  // COMPUTED GETTERS
  // ================================================================

  get navList(): Row[] {
    const ds: Row[] = (this.dataSource?.filteredData?.length != null)
      ? this.dataSource.filteredData
      : (this.dataSource?.data ?? []);
    return ds ?? [];
  }

  get canPrev(): boolean { return !!this.selectedAuth && this.selectedIndex > 0; }
  get canNext(): boolean { return !!this.selectedAuth && this.selectedIndex < this.navList.length - 1; }

  // ================================================================
  // PRIVATE NORMALIZERS / HELPERS
  // ================================================================

  private mapRowToSelected(row: Row) {
    return {
      memberId:         row.MemberId        ?? row.memberId,
      memberDetailsId:  row.MemberDetailsId ?? row.memberDetailsId ?? row.MemberId ?? row.memberId,
      memberName:      `${row.FirstName     ?? row.firstName ?? ''} ${row.LastName ?? row.lastName ?? ''}`.trim(),
      authNumber:       row.AuthNumber      ?? row.authNumber,
      authType:         row.AuthType        ?? row.authType     ?? '-',
      dueDate:          row.AuthDueDate     ?? row.authDueDate  ?? row.DueDate ?? row.dueDate ?? null,
      priority:         row.AuthPriority    ?? row.authPriority ?? row.Priority ?? row.priority ?? '-',
      recommendation:   row.InitialRecommendation ?? row.initialRecommendation ?? '-',
      facility:         row.Facility        ?? row.facility     ?? '-',
      networkStatus:    row.NetworkStatus   ?? row.networkStatus ?? '-',
      comments:         row.Comments        ?? row.comments     ?? '',
      lines: []
    };
  }

  private mapRowToSelectedAuthData(row: any) {
    return {
      memberId:     row.MemberId   ?? row.memberId,
      memberName:  `${row.FirstName ?? row.firstName ?? ''} ${row.LastName ?? row.lastName ?? ''}`.trim(),
      authNumber:   row.AuthNumber ?? row.authNumber,
      authType:     row.AuthType   ?? row.authType  ?? '-',
      facility:     row.Facility   ?? row.facility  ?? '-',
      requestDate:  row.RequestDate ?? row.requestDate ?? row.CreatedOn ?? row.createdOn,
      expectedAdmissionDatetime: row.ExpectedAdmissionDatetime ?? row.expectedAdmissionDatetime ?? '-',
      expectedDischargeDatetime: row.ExpectedDischargeDatetime ?? row.expectedDischargeDatetime ?? '-',
      diagnosisDetails:   row.DiagnosisDetails   ?? row.diagnosisDetails   ?? [],
      authorizationNotes: row.AuthorizationNotes ?? row.authorizationNotes ?? []
    };
  }

  private normalizeLines(rows: any[]): any[] {
    return (rows ?? []).map((r: any) => ({
      lineId:               r?.lineId             ?? r?.LineId              ?? r?.Id   ?? r?.id,
      serviceCode:          r?.ServiceCode        ?? r?.serviceCode         ?? '',
      serviceDescription:   r?.Description        ?? r?.serviceDescription  ?? '',
      fromDate:             r?.FromDate           ?? r?.fromDate            ?? null,
      toDate:               r?.ToDate             ?? r?.toDate              ?? null,
      requested:            r?.Requested          ?? r?.requested           ?? null,
      approved:             r?.Approved           ?? r?.approved            ?? null,
      denied:               r?.Denied             ?? r?.denied              ?? null,
      initialRecommendation:r?.InitialRecommendation ?? r?.initialRecommendation ?? '',
      status:               r?.Status             ?? r?.status              ?? '',
      // mdDecision holds the actual MD reviewer decision label (e.g. "Approved", "Denied")
      // The API may return it under several casing conventions — try them all.
      mdDecision:           r?.MdDecision         ?? r?.mdDecision          ??
                            r?.MDDecision         ?? r?.md_decision          ??
                            r?.MdStatus           ?? r?.mdStatus            ??
                            r?.DecisionStatus     ?? r?.decisionStatus      ?? '',
      comment:              r?.Comments           ?? r?.Comment             ?? r?.comment ?? '',
      InitialRecommendation:r?.InitialRecommendation ?? r?.initialRecommendation ?? '',
      selected: true
    }));
  }

  private getOptionLabel(options: UiSmartOption[], value: any): string {
    const v = String(value ?? '');
    return (options ?? []).find(o => String(o.value) === v)?.label ?? '';
  }

  private normalizeIR(v: string): 'approved' | 'denied' | 'pending' | 'other' {
    const s = (v || '').trim().toLowerCase();
    if (s === 'approved') return 'approved';
    if (s === 'denied')   return 'denied';
    if (s === 'pending' || s === 'notreviewed' || s === 'not reviewed') return 'pending';
    return s ? 'other' : 'pending';
  }

  private normalizeStatus(v: any): 'approved' | 'inprogress' | 'pending' | 'other' {
    const s = (v ?? '').toString().trim().toLowerCase();
    if (s.includes('approved')) return 'approved';
    if (s.includes('progress') || s === 'inprogress') return 'inprogress';
    if (!s || s.includes('pending') || s.includes('not reviewed') || s === 'notreviewed' || s === 'rfi') return 'pending';
    return 'other';
  }

  private normalizeDate(val: any): Date | null {
    if (!val) return null;
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }

  private compareToToday(d: Date): number {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const nd    = new Date(d); nd.setHours(0, 0, 0, 0);
    if (nd.getTime() < today.getTime()) return -1;
    if (nd.getTime() > today.getTime()) return  1;
    return 0;
  }

  private toDate(v: any): Date | null {
    if (!v) return null;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }

  private compareDateOnly(a: Date, b: Date): number {
    const aa = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
    const bb = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
    return aa === bb ? 0 : (aa < bb ? -1 : 1);
  }

  // kept for compatibility — not used actively
  filteredAuths(): any[] {
    return this.auths;
  }

  fullName(row: any): string {
    return `${row?.FirstName ?? row?.firstName ?? ''} ${row?.LastName ?? row?.lastName ?? ''}`.trim();
  }
}
