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
import { SelectionModel } from '@angular/cdk/collections';

type Row = any;

@Component({
  selector: 'app-mdreviewdashboard',
  templateUrl: './mdreviewdashboard.component.html',
  styleUrl: './mdreviewdashboard.component.css'
})
export class MdreviewdashboardComponent {

  selectedDue = new Set<'OVERDUE' | 'TODAY' | 'FUTURE'>();
  selectedAuthData: any = {};
  auths: any[] = []; // your full list (if you already have it, keep)
  selectedIndex: number = 0;
  selectedAuth: any | null = null;
  selectedAuthRaw: Row | null = null;
  serviceLinesDS = new MatTableDataSource<any>([]);
  displayedServiceColumns: string[] = [
    'select',
    'serviceCode',
    'description',
    'fromDate',
    'toDate',
    'requested',
    'approved',
    'denied',
    'initial',
    'mdDecision',
    'mdNotes'
  ];
  showSummary = false;
  DecisionStatus: { value: string, label: string }[] = [{ value: '', label: 'Select' }];
  DecisionStatusDisplay: string = 'Select';
  filteredDecisionStatus: { value: string, label: string }[] = [];
  selection = new SelectionModel<any>(true, []);
  overallInitialRecommendation: string = '-';
  selectedRowforRefresh: number = 0;

  showDropdowns: { [key: string]: boolean } = {
    DecisionStatus: false,
    priority: false,
    workBasket: false,
    assignTo: false,
    workBasketUser: false
  };
  highlightedIndex: number = -1;

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
        // keep raw for any other logic you have
        this.selectedAuth.serviceLines = data;
        // feed the Material table so it matches your main table design
        this.serviceLinesDS.data = data;
      },
      error: () => {
        this.selectedAuth.serviceLines = [];
        this.serviceLinesDS.data = [];
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
      serviceLines: row.ServiceLines ?? []  // fill from your data if you have it
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
    this.crudService.getData('um', 'decisionstatus').subscribe((response) => {
      const options = response.map(item => ({
        value: item.code || item.id || item.id,
        label: item.label || item.decisionStatus || item.display
      }));

      this.DecisionStatus = [{ value: '', label: 'Select' }, ...options];
      this.filteredDecisionStatus = [...this.DecisionStatus];
    });
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
        this.rawData = Array.isArray(rows) ? rows : [];
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
        const d = this.toDate(r?.DueDate);
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
      const d = this.toDate(r?.DueDate);
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

  onMemberClick(memberId: string, memberName: string): void {
    const tabLabel = `Member: ${memberName}`;
    const tabRoute = `/member-info/${memberId}`;

    const existingTab = this.headerService.getTabs().find(tab => tab.route === tabRoute);

    if (existingTab) {
      this.headerService.selectTab(tabRoute);
      this.router.navigateByUrl('/', { skipLocationChange: true }).then(() => {
        this.router.navigate([tabRoute]);
      });
    } else {
      this.headerService.addTab(tabLabel, tabRoute, memberId);
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


  onTypeaheadInput(event: Event): void {
    const input = (event.target as HTMLInputElement).value;
    this.DecisionStatusDisplay = input;
    this.filterDropdown('DecisionStatus');
  }

  filterDropdown(field: 'DecisionStatus'): void {
    const search = this.DecisionStatusDisplay?.toLowerCase() || '';
    this.filteredDecisionStatus = this.DecisionStatus.filter(opt =>
      opt.label.toLowerCase().includes(search)
    );
  }

  selectDropdownOption(field: string, option: { value: string, label: string }) {
    // this.activityForm.get(field)?.setValue(option.value);

    const displayMap: any = {
      DecisionStatus: 'DecisionStatusDisplay',
      priority: 'priorityDisplay',
      workBasket: 'workBasketDisplay',
      assignTo: 'assignToDisplay',
      workBasketUser: 'workBasketUserDisplay'
    };

    if (displayMap[field]) {
      (this as any)[displayMap[field]] = option.label;
    }

    this.showDropdowns[field] = false;
    this.highlightedIndex = -1;
  }



  openDropdown(field: string): void {
    this.showDropdowns[field] = true;
    //  this.activeDropdown = field;

  }

  //closeDropdown(field: string): void {
  //  setTimeout(() => this.showDropdowns[field] = false, 200);
  //}
  closeDropdown(field: string): void {
    this.showDropdowns[field] = false;
  }



  handleDropdownKeydown(event: KeyboardEvent, field: string) {
    const list = field === 'DecisionStatus' ? this.filteredDecisionStatus : [];

    if (!list.length) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.highlightedIndex = (this.highlightedIndex + 1) % list.length;
        this.scrollHighlightedIntoView(field);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.highlightedIndex = (this.highlightedIndex - 1 + list.length) % list.length;
        this.scrollHighlightedIntoView(field);
        break;
      case 'Enter':
        if (this.highlightedIndex >= 0 && this.highlightedIndex < list.length) {
          this.selectDropdownOption(field, list[this.highlightedIndex]);
          this.highlightedIndex = -1;
          event.preventDefault();
        }
        break;
      case 'Escape':
        this.showDropdowns[field] = false;
        this.highlightedIndex = -1;
        break;
    }
  }

  scrollHighlightedIntoView(field: string) {
    setTimeout(() => {
      const container = document.querySelector(`.autocomplete-dropdown`);
      if (!container) return;
      const options = container.querySelectorAll('.autocomplete-option');
      if (this.highlightedIndex >= 0 && this.highlightedIndex < options.length) {
        const selected = options[this.highlightedIndex] as HTMLElement;
        selected.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }, 50);
  }

  // Convenience to extract the line id (use whatever your API returns)
  private getLineId(line: any) {
    return line?.ServiceLineId ?? line?.serviceLineId ?? line?.Id ?? line?.id;
  }

  // Master toggle helpers (used by header checkbox)
  isAllSelected(): boolean {
    const numSelected = this.selection.selected.length;
    const numRows = this.serviceLinesDS?.data?.length ?? 0;
    return numSelected === numRows && numRows > 0;
  }



  checkboxLabel(row?: any): string {
    if (!row) {
      return `${this.isAllSelected() ? 'deselect' : 'select'} all`;
    }
    const id = this.getLineId(row);
    return `${this.selection.isSelected(row) ? 'deselect' : 'select'} row ${id}`;
  }

  // Call this on save to get only the selected IDs
  //onSaveSelection(): void {
  //  const selectedIds = this.selection.selected
  //    .map(line => this.getLineId(line))
  //    .filter(id => id != null);

  //  // TODO: send selectedIds to your API / parent component
  //  console.log('Selected ServiceLine IDs:', selectedIds);
  //}
  mdNotesText: string = '';

  onSaveSelection(): void {
    const selectedIds = this.selection.selected
      .map(l => this.getLineId(l))
      .filter((id: number | null | undefined) => id != null) as number[];

    if (!selectedIds.length) {
      // show toast/snackbar as you like
      console.warn('No service lines selected.');
      return;
    }

    // Map DecisionStatusDisplay (label) to the value you want to persist.
    // If your BE expects the label itself, send it as-is.
    const statusToSave = this.DecisionStatusDisplay && this.DecisionStatusDisplay !== 'Select'
      ? this.DecisionStatusDisplay
      : 'Reviewed'; // fallback if nothing chosen

    const payload: UpdateActivityLinesRequest = {
      lineIds: selectedIds,
      status: statusToSave,       // e.g., "Approved" / "Denied" / etc.
      mdDecision: statusToSave,   // or map separately if they differ
      mdNotes: this.mdNotesText || '',
      reviewedByUserId: 1         // TODO: plug in real current user id
    };

    this.activtyService.updateActivityLines(payload).subscribe({
      next: (res) => {
        // success UI: toast/snackbar, then refresh lines if desired
        this.loadServiceLinesFor(this.selectedRowforRefresh);
        // e.g., reload service lines:
        // this.loadServiceLinesFor(this.selectedAuth?.authActivityId);
      },
      error: (err) => {
        console.error('Update failed', err);
      }
    });
  }

  isLineSelectable(line: any): boolean {
    const v = (line?.MdDecision ?? '').toString().trim().toLowerCase();
    return v === '' || v === 'not reviewed' || v === 'notreviewed' || v === 'pending';
  }

  // If none of the rows are selectable, disable the master checkbox
  hasSelectableRows(): boolean {
    const rows: any[] = this.serviceLinesDS?.data ?? [];
    return rows.some(r => this.isLineSelectable(r));
  }

  // Master toggle should only select selectable rows
  masterToggle(): void {

    //if (!this.serviceLinesDS?.data) return;
    //this.isAllSelected()
    //  ? this.selection.clear()
    //  : this.serviceLinesDS.data.forEach(row => this.selection.select(row));

    const rows: any[] = this.serviceLinesDS?.data ?? [];
    if (!rows.length) return;

    const selectable = rows.filter(r => this.isLineSelectable(r));
    if (!selectable.length) return;

    if (selectable.every(r => this.selection.isSelected(r))) {
      selectable.forEach(r => this.selection.deselect(r));
    } else {
      selectable.forEach(r => this.selection.select(r));
    }
  }

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
  private computeOverallInitialRecommendation(): void {
    const rows: any[] = this.serviceLinesDS?.data ?? [];
    if (!rows.length) {
      this.overallInitialRecommendation = '-';
      return;
    }
    const values = rows
      .map(r => (r?.InitialRecommendation ?? '').toString().trim())
      .filter(v => v.length > 0);

    if (!values.length) {
      this.overallInitialRecommendation = '-';
      return;
    }

    const first = values[0];
    const allSame = values.every(v => v.toLowerCase() === first.toLowerCase());
    this.overallInitialRecommendation = allSame ? first : 'Mixed';
  }
}
