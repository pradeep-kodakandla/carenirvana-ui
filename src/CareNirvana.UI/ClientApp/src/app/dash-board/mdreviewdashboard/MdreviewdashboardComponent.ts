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

  selectedDue = new Set<'OVERDUE' | 'TODAY' | 'FUTURE'>();
  selectedAuthData: any = {};
  auths: any[] = []; // your full list (if you already have it, keep)
  allActivities: any[] = [];
  selectedIndex: number = 0;
  selectedAuth: any | null = null;
  selectedAuthRaw: Row | null = null;
  showSummary = false;

  // ----------------------------
  // AUTH-LIKE review decision state
  // ----------------------------
  decisionStatusOptions: UiSmartOption[] = [{ value: '', label: 'Select' }];
  decisionStatusCodeOptions: UiSmartOption[] = [{ value: '', label: 'Select' }];
  private decisionStatusCodeRaw: any[] = [];

  overallDecisionStatus: string = '';
  overallDecisionStatusCode: string = '';
  requestMoreInformation: boolean = false;

  mdNotesText: string = '';

  overallInitialRecommendation: string = '-';
  selectedRowforRefresh: number = 0;
  firstServiceLineComment: string | null = null;
  constructor(
    private fb: FormBuilder,
    private activtyService: DashboardServiceService,
    private headerService: HeaderService,
    private router: Router,
    private authService: AuthService,
    private memberService: MemberService,
    private route: ActivatedRoute,
    private crudService: CrudService
  ) { }

  // Summary widgets
  summaryStats = [
    { label: 'Urgent Auths', value: 65, icon: 'assignment_ind' },
    { label: 'Pending Reviews', value: 20, icon: 'priority_high' },
    { label: 'Reviewed Today', value: 5, icon: 'report_problem' },
    { label: 'Over Due', value: 40, icon: 'check_circle' }
  ];

  onReviewClick(row: Row): void {
    const k = this.keyOf(row);
    const idx = this.navList.findIndex(r => this.keyOf(r) === k);
    this.selectedIndex = idx >= 0 ? idx : 0;

    this.selectedAuthRaw = row;
    this.selectedAuth = this.mapRowToSelected(row);

    // (Optional) scroll middle pane into view
    setTimeout(() => {
      const el = document.querySelector('.col-middle') as HTMLElement | null;
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
    this.showSummary = false;
    //this.activtyService.getwqactivitylinedetails(row?.AuthActivityId).subscribe(
    //  (data) => {
    //    console.log('Fetched activity lines:', data);
    //  });
    const actId = Number(row.AuthActivityId ?? row.ActivityId ?? 0);
    this.selectedRowforRefresh = actId;
    this.loadServiceLinesFor(this.selectedRowforRefresh);
  }

  // Keep exactly what your service returns (no mapping/types)
  serviceLinesLoading = false;
  private serviceLinesSub?: Subscription;


  private loadServiceLinesFor(activityId: number): void {
    if (!this.selectedAuth) return;

    // cancel any in-flight request when switching rows quickly
    this.serviceLinesSub?.unsubscribe();

    this.serviceLinesLoading = true;

    const obs = this.activtyService.getwqactivitylinedetails(activityId) as Observable<any[]>;
    this.serviceLinesSub = obs.subscribe({
      next: (rows) => {
        const data = Array.isArray(rows) ? rows : [];
        const normalized = this.normalizeLines(data);

        // keep both keys for backwards-compat with any other code
        this.selectedAuth.lines = normalized;
        this.selectedAuth.serviceLines = normalized;

        this.firstServiceLineComment = normalized.find(l => !!l.comment)?.comment ?? null;

        this.computeOverallInitialRecommendation(normalized);
      },
      error: () => {
        this.selectedAuth.lines = [];
        this.selectedAuth.serviceLines = [];
      }
    });

    // stop the spinner regardless of outcome
    this.serviceLinesSub.add(() => (this.serviceLinesLoading = false));
  }


  private mapRowToSelected(row: Row) {
    return {
      memberId: row.MemberId,
      memberName: `${row.FirstName ?? ''} ${row.LastName ?? ''}`.trim(),
      authNumber: row.AuthNumber ?? row.authNumber,
      authType: row.AuthType ?? '-',
      dueDate: row.AuthDueDate ?? row.DueDate ?? null,
      priority: row.AuthPriority ?? row.Priority ?? '-',
      recommendation: row.InitialRecommendation ?? '-',
      facility: row.Facility ?? '-',
      networkStatus: row.NetworkStatus ?? '-',
      lines: []  // filled by loadServiceLinesFor()
    };
  }

  // -------- Utilities ----------
  trackByAuth = (_: number, item: Row) => this.keyOf(item) ?? _;
  trackByLine = (_: number, l: any) => l?.Id ?? l?.ServiceCode ?? _;

  isSame(a: Row, b: Row): boolean {
    if (!a || !b) return false;
    return this.keyOf(a) === this.keyOf(b);
  }
  private normId(v: any): string | undefined {
    return v === null || v === undefined ? undefined : String(v).trim();
  }

  keyOf(r: any): string | number | undefined {
    // Prefer AuthActivityId first (new unique id), then fall back to older keys
    return this.normId(
      r?.AuthActivityId ?? r?.authActivityId ??
      r?.AuthNumber ?? r?.authNumber ??
      r?.id ?? r?.AuthNo ?? r?.authNo
    );
  }
  getDate(val: any): string {
    const d = this.normalizeDate(val);
    return d ? d.toLocaleDateString() : '—';
  }
  dueChipClass(row: Row): string {
    const d = this.normalizeDate(row?.AuthDueDate || row?.DueDate);
    if (!d) return 'chip-neutral';
    const cmp = this.compareToToday(d);
    if (cmp < 0) return 'chip-red';
    if (cmp > 0) return 'chip-green';
    return 'chip-orange';
  }
  dueChipText(row: Row): string {
    const d = this.normalizeDate(row?.AuthDueDate || row?.DueDate);
    if (!d) return '—';
    const cmp = this.compareToToday(d);
    if (cmp < 0) return 'Overdue';
    if (cmp > 0) return 'Due in Future';
    return 'Due Today';
  }
  onCardSelect(row: any, i: number): void {
    this.selectedIndex = i;
    this.selectedAuthRaw = row;
    this.selectedAuth = this.mapRowToSelected(row);
    const actId = Number(row.AuthActivityId ?? row.ActivityId ?? 0);
    this.loadServiceLinesFor(actId);
  }
  // date helpers
  private normalizeDate(val: any): Date | null {
    if (!val) return null;
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }
  private compareToToday(d: Date): number {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const nd = new Date(d); nd.setHours(0, 0, 0, 0);
    if (nd.getTime() < today.getTime()) return -1;
    if (nd.getTime() > today.getTime()) return 1;
    return 0;
  }
  private daysFromToday(d: Date): number {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const nd = new Date(d); nd.setHours(0, 0, 0, 0);
    const ms = nd.getTime() - today.getTime();
    return Math.round(ms / (1000 * 60 * 60 * 24));
  }

  onPrevious(): void {
    if (!this.auths?.length) return;
    this.selectedIndex = Math.max(0, this.selectedIndex - 1);
    const row = this.auths[this.selectedIndex];
    this.selectedAuth = this.mapRowToSelectedAuth(row);
    this.selectedAuthData = this.mapRowToSelectedAuthData(row);
    const actId = Number(row.AuthActivityId ?? row.ActivityId ?? 0);
    this.loadServiceLinesFor(actId);
  }

  onNext(): void {
    if (!this.auths?.length) return;
    this.selectedIndex = Math.min(this.auths.length - 1, this.selectedIndex + 1);
    const row = this.auths[this.selectedIndex];
    this.selectedAuth = this.mapRowToSelectedAuth(row);
    this.selectedAuthData = this.mapRowToSelectedAuthData(row);
    const actId = Number(row.AuthActivityId ?? row.ActivityId ?? 0);
    this.loadServiceLinesFor(actId);
  }

  closeReview(): void {
    this.selectedAuth = null;
    this.selectedAuthData = null;
  }


  isSelected(index: number) {
    return this.selectedIndex === index;
  }

  searchText: string = '';

  filteredAuths(): any[] {
    if (!this.searchText) return this.auths;
    const lower = this.searchText.toLowerCase();
    return this.auths.filter(auth => (auth.firstName + ' ' + auth.lastName).toLowerCase().includes(lower) ||
      (auth.authNumber || '').toLowerCase().includes(lower)
    );
  }

  onSearch(event: any): void {
    const filterValue = event.target.value.trim().toLowerCase();

  }


  displayedColumns: string[] = [
    'module',
    'member',
    'authNumber',
    'createdOn',
    'referredTo',
    'activityType',
    'followUpDate',
    'dueDate',
    'status',
    'review'
  ];

  dataSource = new MatTableDataSource<any>([]);
  rawData: any[] = [];

  // filter panel (keep grid empty for now)
  showFilters = false;
  filtersForm!: FormGroup;

  // quick search
  quickSearchTerm = '';

  // due chips
  dueChip: 'OVERDUE' | 'TODAY' | 'FUTURE' | null = null;
  overdueCount = 0;
  dueTodayCount = 0;
  dueFutureCount = 0;

  // expand placeholder (kept for parity)
  expandedElement: any | null = null;

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;

  ngOnInit(): void {
    this.filtersForm = this.fb.group({}); // empty grid per request
    this.loadData();
    this.loadDecisionDropdowns();
  }


  ngAfterViewInit(): void {
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;

    // quick search across a few fields (keep payload AS-IS / PascalCase)
    this.dataSource.filterPredicate = (row: any, filter: string) => {
      const q = (filter || '').trim().toLowerCase();
      if (!q) return true;

      const name = `${row?.FirstName ?? ''} ${row?.LastName ?? ''}`.trim();
      const fields = [
        row?.Module,
        name,
        row?.MemberId?.toString(),
        row?.UserName,
        row?.ActivityType,
        row?.Status
      ];

      return fields.some(v => (v ?? '').toString().toLowerCase().includes(q));
    };
  }

  private getMyActivities$(): Observable<any[]> {
    return this.activtyService.getpendingwqactivitydetails(sessionStorage.getItem('loggedInUserid'));
  }

  private loadData(): void {
    this.getMyActivities$().subscribe({
      next: rows => {
        console.log('Fetched activities:', rows);
        // 1️⃣ Normalize to array
        const allRows = Array.isArray(rows) ? rows : [];
        this.allActivities = allRows;
        // 2️⃣ Filter to exclude approved records
        const notApproved = allRows.filter(r => {
          const s = (r?.status ?? '').toString().trim().toLowerCase();
          return s !== 'approved' && s !== 'completed'; // add others if needed
        });

        this.rawData = Array.isArray(notApproved) ? notApproved : [];
        this.recomputeAll();
      },
      error: () => {
        this.rawData = [];
        this.recomputeAll();
      }
    });
  }

  // UI events
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
    //this.dueChip = which;
    if (this.selectedDue.has(kind)) {
      this.selectedDue.delete(kind);
    } else {
      this.selectedDue.add(kind);
    }
    this.recomputeAll();
  }

  // ===== Pipeline =====
  private recomputeAll(): void {
    this.computeDueCounts();

    let base = [...this.rawData];

    // chip filter on DueDate
    //if (this.dueChip) {
    //  base = base.filter(r => {
    //    const d = this.toDate(r?.DueDate);
    //    if (!d) return false;
    //    const cmp = this.compareDateOnly(d, new Date());
    //    if (this.dueChip === 'OVERDUE') return cmp < 0;
    //    if (this.dueChip === 'TODAY') return cmp === 0;
    //    return cmp > 0; // FUTURE
    //  });
    //}
    if (this.selectedDue && this.selectedDue.size > 0) {
      const today = new Date();

      base = base.filter(r => {
        const d = this.toDate(r?.dueDate);
        if (!d) return false;

        const cmp = this.compareDateOnly(d, today); // <0 overdue, 0 today, >0 future

        let match = false;
        if (this.selectedDue.has('OVERDUE') && cmp < 0) match = true;
        if (this.selectedDue.has('TODAY') && cmp === 0) match = true;
        if (this.selectedDue.has('FUTURE') && cmp > 0) match = true;

        return match;
      });
    } else {
      base = base;
    }
    // quick search
    this.dataSource.data = base;
    this.dataSource.filter = this.quickSearchTerm;

    if (this.paginator) this.paginator.firstPage();
  }

  private computeDueCounts(): void {
    const today = new Date();
    const counts = this.rawData.reduce((acc, r) => {
      const d = this.toDate(r?.dueDate);
      if (!d) return acc;
      const cmp = this.compareDateOnly(d, today);
      if (cmp < 0) acc.overdue++;
      else if (cmp === 0) acc.today++;
      else acc.future++;
      return acc;
    }, { overdue: 0, today: 0, future: 0 });

    this.overdueCount = counts.overdue;
    this.dueTodayCount = counts.today;
    this.dueFutureCount = counts.future;
  }

  // ===== Date helpers =====
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

  // ===== Template helpers =====
  fullName(row: any): string {
    const f = row?.FirstName ?? '';
    const l = row?.LastName ?? '';
    return `${f} ${l}`.trim();
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
    const one = 24 * 60 * 60 * 1000;

    const d0 = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();

    const diff = Math.round((d0 - t0) / one);
    if (diff < 0) return `Overdue by ${Math.abs(diff)}d`;
    if (diff === 0) return 'Due today';
    return `In ${diff}d`;
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

  @Output() addClicked = new EventEmitter<string>();

  onAuthClick(authNumber: string = '', memId: string = '') {
    this.addClicked.emit(authNumber);
    this.memberService.setIsCollapse(true);

    // read member id once (prefer your own field; fall back to route)
    const memberId = memId ?? Number(this.route.parent?.snapshot.paramMap.get('id'));

    // ✅ point tab to the CHILD route under the shell
    const tabRoute = `/member-info/${memberId}/member-auth/${authNumber}`;
    const tabLabel = `Auth No ${authNumber}`;

    const existingTab = this.headerService.getTabs().find(t => t.route === tabRoute);

    if (existingTab) {
      this.headerService.selectTab(tabRoute);

    } else {
      this.headerService.addTab(tabLabel, tabRoute, String(memberId));

    }
    this.router.navigateByUrl('/', { skipLocationChange: true }).then(() => {
      this.router.navigate([tabRoute]);
    });
  }

  private mapRowToSelectedAuth(row: any) {
    return {
      dueDate: row.DueDate,
      priority: row.AuthPriority || row.Priority || '-',
      recommendation: row.InitialRecommendation || '-',
      memberId: row.MemberId,
      memberName: `${row.FirstName ?? ''} ${row.LastName ?? ''}`.trim(),
      authNumber: row.AuthNumber,
      authType: row.AuthType || '-',
      facility: row.Facility || '-',
      networkStatus: row.NetworkStatus || '-',
      serviceLines: row.ServiceLines || [], // supply from your service if needed
      authActivityId: row.AuthActivityId
    };
  }

  private mapRowToSelectedAuthData(row: any) {
    return {
      memberId: row.MemberId,
      memberName: `${row.FirstName ?? ''} ${row.LastName ?? ''}`.trim(),
      authNumber: row.AuthNumber,
      authType: row.AuthType || '-',
      facility: row.Facility || '-',
      requestDate: row.RequestDate || row.CreatedOn,
      expectedAdmissionDatetime: row.ExpectedAdmissionDatetime || '-',
      expectedDischargeDatetime: row.ExpectedDischargeDatetime || '-',
      diagnosisDetails: row.DiagnosisDetails || [],
      authorizationNotes: row.AuthorizationNotes || []
    };
  }
  get navList(): Row[] {
    // If a quick search or chip is active, filteredData is populated
    const ds: Row[] = (this.dataSource?.filteredData?.length != null)
      ? this.dataSource.filteredData
      : (this.dataSource?.data ?? []);
    return ds ?? [];
  }
  get canPrev(): boolean {
    return !!this.selectedAuth && this.selectedIndex > 0;
  }
  get canNext(): boolean {
    return !!this.selectedAuth && this.selectedIndex < this.navList.length - 1;
  }

  toggleSummary() {
    this.showSummary = !this.showSummary;
  }

  /******Select field******/

  // Master toggle helpers (used by header checkbox)

  // Call this on save to get only the selected IDs
  // If none of the rows are selectable, disable the master checkbox

  // Master toggle should only select selectable rows

  // Label classes for MD Decision badge
  mdDecisionClass(decision: string | null | undefined): string {
    const v = (decision ?? '').toString().trim().toLowerCase();
    if (v === '' || v === 'not reviewed' || v === 'notreviewed') return 'md-notreviewed';
    if (v === 'pending') return 'md-pending';
    if (v === 'approved' || v === 'partially approved' || v === 'partiallyapproved') return 'md-approved';
    if (v === 'denied' || v === 'rejected') return 'md-denied';
    if (v === 'rfi' || v === 'request more information' || v === 'requestmoreinformation') return 'md-rfi';
    return 'md-neutral';
  }

  // Compute overall initial recommendation from the service lines
  private normalizeIR(v: string): 'approved' | 'denied' | 'pending' | 'other' {
    const s = (v || '').trim().toLowerCase();
    if (s === 'approved') return 'approved';
    if (s === 'denied') return 'denied';
    if (s === 'pending' || s === 'notreviewed' || s === 'not reviewed') return 'pending';
    return s ? 'other' : 'pending';
  }

  // ----------------------------
  // Auth-like Service Lines table selection (checkboxes)
  // ----------------------------
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

  private getSelectedLines(): any[] {
    return (this.selectedAuth?.lines ?? []).filter((l: any) => !!l.selected);
  }

  private normalizeLines(rows: any[]): any[] {
    return (rows ?? []).map((r: any) => ({
      lineId: r?.lineId ?? r?.LineId ?? r?.Id ?? r?.id,
      serviceCode: r?.ServiceCode ?? r?.serviceCode ?? '',
      serviceDescription: r?.Description ?? r?.serviceDescription ?? '',
      fromDate: r?.FromDate ?? r?.fromDate ?? null,
      toDate: r?.ToDate ?? r?.toDate ?? null,
      requested: r?.Requested ?? r?.requested ?? null,
      approved: r?.Approved ?? r?.approved ?? null,
      denied: r?.Denied ?? r?.denied ?? null,
      initialRecommendation: r?.InitialRecommendation ?? r?.initialRecommendation ?? '',
      status: r?.Status ?? r?.status ?? '',
      comment: r?.Comments ?? r?.Comment ?? r?.comment ?? '',
      // keep original key for existing logic
      InitialRecommendation: r?.InitialRecommendation ?? r?.initialRecommendation ?? '',
      selected: false
    }));
  }

  // ----------------------------
  // Auth-like Decision dropdowns
  // ----------------------------
  loadDecisionDropdowns(): void {
    this.crudService.getData('um', 'decisionstatus').subscribe({
      next: (res: any) => {
        const arr = Array.isArray(res) ? res : (res?.status ?? res?.data ?? res?.items ?? res?.result ?? []);
        this.decisionStatusOptions = [
          { value: '', label: 'Select' },
          ...(arr ?? []).map((x: any) => {
            const value =
              x?.id ?? x?.Id ??
              x?.decisionStatusId ?? x?.DecisionStatusId ??
              x?.value ?? x?.Value ?? '';
            const label =
              x?.decisionStatus ?? x?.DecisionStatus ??
              x?.name ?? x?.Name ??
              x?.label ?? x?.Label ??
              String(value ?? '');
            return { value: String(value ?? ''), label: String(label ?? '') } as UiSmartOption;
          })
        ];
      },
      error: () => {
        this.decisionStatusOptions = [{ value: '', label: 'Select' }];
      }
    });

    this.crudService.getData('um', 'decisionstatuscode').subscribe({
      next: (res: any) => {
        const arr = Array.isArray(res) ? res : (res?.statusCode ?? res?.data ?? res?.items ?? res?.result ?? []);
        this.decisionStatusCodeRaw = (arr ?? []).slice();
        this.decisionStatusCodeOptions = [
          { value: '', label: 'Select' },
          ...(this.decisionStatusCodeRaw ?? []).map((x: any) => {
            const value =
              x?.id ?? x?.Id ??
              x?.decisionStatusCode ?? x?.DecisionStatusCode ??
              x?.value ?? x?.Value ?? '';
            const label =
              x?.decisionStatusCode ?? x?.DecisionStatusCode ??
              x?.decisionStatusName ?? x?.DecisionStatusName ??
              x?.name ?? x?.Name ??
              x?.label ?? x?.Label ??
              String(value ?? '');
            return { value: String(value ?? ''), label: String(label ?? '') } as UiSmartOption;
          })
        ];

        if (this.overallDecisionStatus) this.onDecisionStatusChanged();
      },
      error: () => {
        this.decisionStatusCodeRaw = [];
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

  private getOptionLabel(options: UiSmartOption[], value: any): string {
    const v = String(value ?? '');
    const match = (options ?? []).find(o => String(o.value) === v);
    return match?.label ?? '';
  }

  // ----------------------------
  // Auth-like actions
  // ----------------------------
  submitDecision(): void {
    this.updateSelectedLines('Completed', true);
  }

  saveAndContinue(): void {
    this.updateSelectedLines('InProgress', false);
  }

  private updateSelectedLines(status: 'Completed' | 'InProgress', autoNext: boolean): void {
    if (!this.selectedAuth) return;

    const selectedLines = this.getSelectedLines();
    if (!selectedLines.length) {
      console.warn('No service lines selected.');
      return;
    }

    const decisionLabel =
      this.getOptionLabel(this.decisionStatusOptions, this.overallDecisionStatus) ||
      String(this.overallDecisionStatus ?? '');

    if (!decisionLabel || decisionLabel === 'Select') {
      console.warn('Decision Status is required.');
      return;
    }

    const codeLabel =
      this.getOptionLabel(this.decisionStatusCodeOptions, this.overallDecisionStatusCode) ||
      String(this.overallDecisionStatusCode ?? '');

    const note = (this.mdNotesText ?? '').trim();
    const reqMore = !!this.requestMoreInformation;

    const composedNotes = [
      codeLabel ? `Decision Status Code: ${codeLabel}` : '',
      reqMore ? 'Request more information' : '',
      note ? note : ''
    ].filter(Boolean).join(', ');

    const lineIds = selectedLines.map(l => l.lineId).filter((x: any) => x != null);

    const payload: UpdateActivityLinesRequest = {
      lineIds,
      status,
      mdDecision: decisionLabel,
      mdNotes: composedNotes,
      reviewedByUserId: 1
    };

    this.activtyService.updateActivityLines(payload).subscribe({
      next: () => {
        const actId = Number(this.selectedRowforRefresh || this.selectedAuth?.authActivityId || 0);
        if (actId) this.loadServiceLinesFor(actId);

        if (autoNext) this.onNext();
      },
      error: (err) => console.error('Update failed', err)
    });
  }



  computeOverallInitialRecommendation(lines?: any[]): void {
    const rows = (lines ?? this.selectedAuth?.lines ?? this.selectedAuth?.serviceLines ?? []) as Array<any>;
    const vals = rows
      .map(r => this.normalizeIR((r?.InitialRecommendation ?? r?.initialRecommendation ?? r?.initialRecommendation)))
      .filter(Boolean);

    if (!vals.length) { this.overallInitialRecommendation = '—'; return; }

    const hasApproved = vals.includes('approved');
    const hasDenied = vals.includes('denied');
    const hasPending = vals.includes('pending') || vals.includes('other');

    // Priority rules:
    // 1) All Approved -> Approved
    if (hasApproved && !hasDenied && !hasPending) { this.overallInitialRecommendation = 'Approved'; return; }
    // 2) All Denied -> Denied
    if (hasDenied && !hasApproved && !hasPending) { this.overallInitialRecommendation = 'Denied'; return; }
    // 3) Mixed Approved & Denied (regardless of pending/other) -> Mixed
    if (hasApproved && hasDenied) { this.overallInitialRecommendation = 'Mixed'; return; }
    // 4) Only Approved + Pending/Other -> Approved (Partial)
    if (hasApproved && !hasDenied) { this.overallInitialRecommendation = 'Approved'; return; }
    // 5) Only Denied  + Pending/Other -> Denied (Leaning)
    if (hasDenied && !hasApproved) { this.overallInitialRecommendation = 'Denied'; return; }
    // 6) Otherwise -> Pending
    this.overallInitialRecommendation = 'Pending';
  }

  getOverallIrClass(): string {
    const v = (this.overallInitialRecommendation || '').trim().toLowerCase();
    if (v === 'approved') return 'md-approved';
    if (v === 'denied') return 'md-denied';
    if (v === 'mixed') return 'md-mixed';
    if (v === 'pending') return 'md-pending';
    return 'md-notreviewed';
  }

  statusFilter: 'PENDING_OR_INPROGRESS' | 'APPROVED' = 'PENDING_OR_INPROGRESS';

  // helpers to bind active state
  isStatusSelected(k: 'PENDING_OR_INPROGRESS' | 'APPROVED'): boolean {
    return this.statusFilter === k;
  }

  setStatusChip(k: 'APPROVED'): void {
    // If clicking the same chip again, unselect it and go back to default
    if (this.statusFilter === k) {
      this.statusFilter = 'PENDING_OR_INPROGRESS';  // default view
    } else {
      this.statusFilter = k;
    }
    this.applyListFilters(); // reapply filters after toggle
  }


  private normalizeStatus(v: any): 'approved' | 'inprogress' | 'pending' | 'other' {
    const s = (v ?? '').toString().trim().toLowerCase();
    if (s.includes('approved')) return 'approved';
    if (s.includes('progress') || s === 'inprogress') return 'inprogress';
    if (s === '' || s.includes('pending') || s.includes('not reviewed') || s === 'notreviewed' || s === 'rfi') return 'pending';
    return 'other';
  }

  private applyListFilters(): void {
    // 1) start with full set
    const all: any[] = Array.isArray(this.allActivities) ? this.allActivities : [];

    // 2) due filter (keep your existing semantics)
    let byDue = all;
    if (this.selectedDue.size) {
      byDue = all.filter(row => {
        const d = new Date(row.dueDate || row.authDueDate);
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const dd = new Date(d); dd.setHours(0, 0, 0, 0);

        const days = Math.floor((dd.getTime() - today.getTime()) / 86400000);
        const bucket =
          days < 0 ? 'OVERDUE' :
            days === 0 ? 'TODAY' : 'FUTURE';

        return this.selectedDue.has(bucket as any);
      });
    }

    // 3) status filter (NEW)
    let byStatus = byDue;
    if (this.statusFilter === 'PENDING_OR_INPROGRESS') {
      byStatus = byDue.filter(r => {
        const s = this.normalizeStatus(r.status);
        return s === 'pending' || s === 'inprogress';
      });
    } else if (this.statusFilter === 'APPROVED') {
      byStatus = byDue.filter(r => this.normalizeStatus(r.status) === 'approved');
    }

    // 4) set data
    if (this.dataSource) {
      this.dataSource.data = byStatus;
    }
  }
}
