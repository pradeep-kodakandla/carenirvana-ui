import { Component, EventEmitter, Output, ViewChild } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { MatTableDataSource } from '@angular/material/table';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { DashboardServiceService } from 'src/app/service/dashboard.service.service';
import { HeaderService } from 'src/app/service/header.service';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from 'src/app/service/auth.service';
import { MemberService } from 'src/app/service/shared-member.service';
import { Observable, Subscription } from 'rxjs';

type Row = any;

@Component({
  selector: 'app-mdreviewdashboard',
  templateUrl: './mdreviewdashboard.component.html',
  styleUrl: './mdreviewdashboard.component.css'
})
export class MdreviewdashboardComponent {

  selectedAuthData: any = {};
  auths: any[] = []; // your full list (if you already have it, keep)
  selectedIndex: number = 0;
  selectedAuth: any | null = null;
  selectedAuthRaw: Row | null = null;
  serviceLinesDS = new MatTableDataSource<any>([]);
  displayedServiceColumns: string[] = [
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

  constructor(
    private fb: FormBuilder,
    private activtyService: DashboardServiceService,
    private headerService: HeaderService,
    private router: Router,
    private authService: AuthService,
    private memberService: MemberService,
    private route: ActivatedRoute
  ) { }

  ngonInit(): void {
    this.authService.getAuthDataByAuthNumber('TCZBGT7Y3').subscribe(
      (data) => {
        this.auths = data;
        this.selectedAuthData = data[0]?.responseData; // default selection
      });
  }


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

    //this.activtyService.getwqactivitylinedetails(row?.AuthActivityId).subscribe(
    //  (data) => {
    //    console.log('Fetched activity lines:', data);
    //  });
    const actId = Number(row.AuthActivityId ?? row.ActivityId ?? 0);
    this.loadServiceLinesFor(actId);
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
    return this.activtyService.getpendingwqactivitydetails(1);
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

  setDueChip(which: 'OVERDUE' | 'TODAY' | 'FUTURE'): void {
    this.dueChip = which;
    this.recomputeAll();
  }

  // ===== Pipeline =====
  private recomputeAll(): void {
    this.computeDueCounts();

    let base = [...this.rawData];

    // chip filter on DueDate
    if (this.dueChip) {
      base = base.filter(r => {
        const d = this.toDate(r?.DueDate);
        if (!d) return false;
        const cmp = this.compareDateOnly(d, new Date());
        if (this.dueChip === 'OVERDUE') return cmp < 0;
        if (this.dueChip === 'TODAY') return cmp === 0;
        return cmp > 0; // FUTURE
      });
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
}
