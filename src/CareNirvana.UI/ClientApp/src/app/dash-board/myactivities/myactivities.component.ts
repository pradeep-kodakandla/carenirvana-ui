import {
  Component, OnInit, AfterViewInit, OnDestroy,
  ViewChild, QueryList, ViewChildren, ElementRef,
  EventEmitter, Output, ChangeDetectorRef
} from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { MatTableDataSource, MatTable } from '@angular/material/table';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { Observable, Subject } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { DashboardServiceService } from 'src/app/service/dashboard.service.service';
import { HeaderService } from 'src/app/service/header.service';
import { Router, ActivatedRoute } from '@angular/router';
import { MemberService } from 'src/app/service/shared-member.service';
import {
  MemberactivityService,
  AcceptWorkGroupActivityRequest,
  RejectWorkGroupActivityRequest
} from 'src/app/service/memberactivity.service';
interface ActivityItem {
  // identifiers
  activityId?: number;
  memberActivityWorkGroupId?: number;
  memberId?: number | string;
  memberDetailsId?: string;
  authNumber?: string;

  // member
  firstName?: string;
  lastName?: string;

  // activity
  module?: string;
  activityType?: string;
  status?: string;
  userName?: string;        // Refer To (display)
  referredTo?: string;

  // dates
  createdOn?: string | Date;
  followUpDateTime?: string | Date;
  dueDate?: string | Date;

  // assignment / state
  rejectedUserIds?: Array<number | string>;

  // precomputed by component (avoids re-running pipes/funcs every CD cycle)
  _dueClass?: string;
  _daysLeftLabel?: string;
}

interface CalendarDay {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  activities: ActivityItem[]; // same shape as rows in dataSource
  /** Precomputed activities-by-hour map for the time grid (key = 0..23). */
  hourBuckets?: { [hour: number]: ActivityItem[] };
}


export interface WorkGroupAssignment {
  userId: number;
  userFullName: string;
  workGroupWorkBasketId: number;
  workGroupId: number;
  workGroupName: string;
  workBasketId: number;
  workBasketName: string;
  activeFlag: boolean;
  assignedUserIds: number[];
  assignedUserNames: string[];
}

export interface SimpleUser {
  userId: number;
  userFullName: string;
}

export interface SimpleWorkGroup {
  workGroupId: number;
  workGroupName: string;
}

type CalendarViewRange = 'day' | 'workweek' | 'week' | 'month';

/**
 * One configurable table column.
 * `key` MUST match both the matColumnDef name in the template and the
 * `sortingDataAccessor` switch, so MatTableDataSource sorting works.
 */
interface ColumnDef {
  key: string;
  label: string;     // human-readable header, also shown in the column chooser
  locked?: boolean;  // locked columns are always visible and cannot be toggled
  visible: boolean;  // current on/off state (restored from storage)
}

@Component({
  selector: 'app-myactivities',
  templateUrl: './myactivities.component.html',
  styleUrls: ['./myactivities.component.css']
})
export class MyactivitiesComponent implements OnInit, AfterViewInit, OnDestroy {

  // ===== Output =====
  @Output() addClicked = new EventEmitter<string>();

  // ===== View state =====
  selectedDue = new Set<'OVERDUE' | 'TODAY' | 'FUTURE'>();
  viewMode: 'calendar' | 'table' = 'calendar';

  // ===== Calendar state =====
  weekDays: string[] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  currentMonth: Date = new Date();
  calendarViewRange: CalendarViewRange = 'workweek';  // default like Outlook
  currentDate: Date = new Date();
  selectedDate: Date = new Date();

  visibleCalendarDays: CalendarDay[] = [];
  activeRangeDays: CalendarDay[] = [];

  // hours shown in the time grid (full 24h)
  hours: number[] = Array.from({ length: 24 }, (_, i) => i);

  rangeLabel = '';

  // TODO: replace with real "my calendars" data once the calendar
  // selection feature is wired to the backend.
  userCalendars = [
    { id: 1, name: 'Calendar', color: '#2563eb', selected: true },
    { id: 2, name: 'Reminders', color: '#16a34a', selected: true }
  ];

  // ===== Activities / table =====
  activities: ActivityItem[] = [];

  // ============================================================
  // Column configuration (settings gear / column chooser)
  // ============================================================
  // Master catalog of every column the table CAN show, in display order.
  //   - locked  -> always visible, user cannot hide it
  //   - visible -> current on/off state (also restored from storage)
  // `displayedColumns` is DERIVED from this list, so column order stays
  // consistent no matter what order the user toggles things on/off.
  allColumns: ColumnDef[] = [
    { key: 'module', label: 'Module', visible: true },
    { key: 'member', label: 'Member', locked: true, visible: true },
    { key: 'authnumber', label: 'Auth #', visible: true },
    { key: 'createdOn', label: 'Created On', visible: true },
    { key: 'referredTo', label: 'Refer To', visible: true },
    { key: 'activityType', label: 'Activity Type', visible: true },
    { key: 'followUpDate', label: 'Follow Up Date', visible: true },
    { key: 'dueDate', label: 'Due Date', visible: true },
    { key: 'status', label: 'Status', visible: true },
    { key: 'comments', label: 'Comments', visible: false },
    { key: 'thumb', label: 'Actions', locked: true, visible: true },
  ];

  // Derived list bound to <table mat-table>. Rebuilt on every change.
  displayedColumns: string[] = [];

  // Snapshot of out-of-the-box visibility, used by "Reset to default".
  private columnDefaults: Record<string, boolean> = {};

  // Column chooser popover open/closed.
  showColumnSettings = false;

  // localStorage key for persisting the user's column layout.
  private readonly COL_PREF_KEY = 'myactivities.columnPrefs.v1';

  // ============================================================
  // Column resize (drag-from-header)
  // ============================================================
  // Default widths in px. Adjust to taste; user drags override these at runtime.
  columnWidths: Record<string, number> = {
    module: 100,
    member: 200,
    authnumber: 130,
    createdOn: 140,
    referredTo: 180,
    activityType: 200,
    followUpDate: 150,
    dueDate: 170,
    status: 120,
    thumb: 140,
    // --- optional columns (added via the column chooser) ---
    comments: 220,
  };
  private readonly minColumnWidth = 60;
  private resizing: { col: string; startX: number; startWidth: number } | null = null;
  private resizeMoveHandler?: (e: MouseEvent) => void;
  private resizeUpHandler?: (e: MouseEvent) => void;

  dataSource = new MatTableDataSource<ActivityItem>([]);
  rawData: ActivityItem[] = [];

  // ===== Filter panel =====
  showFilters = false;
  filtersForm!: FormGroup;

  // ===== Quick search =====
  quickSearchTerm = '';
  private searchSubject = new Subject<string>();

  // ===== Due chip counts =====
  overdueCount = 0;
  dueTodayCount = 0;
  dueFutureCount = 0;

  // ===== Detail drawer =====
  selectedActivityId: number | null = null;
  selectedFollowUpDate: Date | null = null;
  selectedSlot: { dayKey: string; hour: number } | null = null;

  // ===== Work groups =====
  workGroupAssignments: WorkGroupAssignment[] = [];
  workGroups: SimpleWorkGroup[] = [];
  selectedWorkGroupId: number | null = null;
  selectedWorkGroupName = 'All work groups';
  visibleUsers: SimpleUser[] = [];
  filteredVisibleUsers: SimpleUser[] = [];
  maxUserSelection = 1;
  selectedUserIds: number[] = [];
  userSearchTerm = '';

  // ===== Time grid refs =====
  @ViewChild('timeGridContainer') timeGridContainer!: ElementRef<HTMLDivElement>;
  @ViewChildren('hourRow') hourRows!: QueryList<ElementRef<HTMLDivElement>>;

  readonly workingStartHour = 8;
  readonly workingEndHour = 17;

  // ===== Lifecycle =====
  private destroy$ = new Subject<void>();

  // ===== Paginator / sort =====
  // The table (and therefore <mat-paginator> / matSort) lives inside
  // *ngIf="viewMode === 'table'" and isn't in the DOM on first AfterViewInit.
  // ViewChild setters re-fire when the table section is created, wiring
  // them up at that moment.
  private _paginator?: MatPaginator;
  private _sort?: MatSort;

  @ViewChild(MatPaginator)
  set paginator(p: MatPaginator) {
    this._paginator = p;
    if (p) {
      this.dataSource.paginator = p;
    }
  }
  get paginator(): MatPaginator {
    return this._paginator!;
  }

  @ViewChild(MatSort)
  set sort(s: MatSort) {
    this._sort = s;
    if (s) {
      this.dataSource.sort = s;
    }
  }
  get sort(): MatSort {
    return this._sort!;
  }

  // The <table mat-table> also lives inside *ngIf="viewMode === 'table'",
  // so its ViewChild reference is captured via a setter that re-fires
  // when the table section is created. Used to call renderRows() after
  // the column set changes.
  private _table?: MatTable<any>;
  @ViewChild(MatTable)
  set matTable(t: MatTable<any>) {
    this._table = t;
  }
  get matTable(): MatTable<any> | undefined {
    return this._table;
  }

  constructor(
    private fb: FormBuilder,
    private cdr: ChangeDetectorRef,
    private activityService: DashboardServiceService,
    private headerService: HeaderService,
    private router: Router,
    private memberService: MemberService,
    private route: ActivatedRoute,
    private memberActivityService: MemberactivityService) { }

  /** Cached once per request — sessionStorage hits aren't free. */
  private get loggedInUserId(): number {
    return Number(sessionStorage.getItem('loggedInUserid'));
  }

  ngOnInit(): void {
    this.filtersForm = this.fb.group({}); // empty grid per request

    // Build the column set: snapshot defaults, restore any saved layout.
    this.initColumns();

    this.buildMonthGrid();
    this.buildActiveRangeDays();
    this.loadData();

    // Debounced quick-search pipeline: feeds quickSearchTerm + recomputeAll.
    this.searchSubject
      .pipe(
        debounceTime(200),
        distinctUntilChanged(),
        takeUntil(this.destroy$)
      )
      .subscribe(term => {
        this.quickSearchTerm = term;
        this.recomputeAll();
      });

    this.activityService.getuserworkgroups(this.loggedInUserId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.initializeWorkGroups(res);
        },
        error: (err) => {
          console.error('Error fetching user work groups:', err);
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.searchSubject.complete();
  }

  initializeWorkGroups(rows: WorkGroupAssignment[]): void {
    this.workGroupAssignments = rows || [];

    // build distinct work group list for chips
    const map = new Map<number, string>();
    for (const row of this.workGroupAssignments) {
      if (!map.has(row.workGroupId)) {
        map.set(row.workGroupId, row.workGroupName);
      }
    }

    this.workGroups = Array.from(map.entries()).map(([id, name]) => ({
      workGroupId: id,
      workGroupName: name
    }));

    // default: "all groups" selected
    this.selectedWorkGroupId = null;
    this.selectedWorkGroupName = 'All work groups';
    this.updateVisibleUsers();
  }


  ngAfterViewInit(): void {
    // NOTE: paginator/sort are wired via the @ViewChild setters above,
    // because the table (and therefore <mat-paginator> / matSort) lives
    // inside *ngIf="viewMode === 'table'" and isn't in the DOM yet on
    // first AfterViewInit.

    // Quick search across the visible columns. Field names must match the
    // row payload, which is camelCase (see HTML bindings: row.firstName,
    // row.memberId, row.activityType, etc.).
    this.dataSource.filterPredicate = (row: ActivityItem, filter: string) => {
      const q = (filter || '').trim().toLowerCase();
      if (!q) return true;

      const name = `${row?.firstName ?? ''} ${row?.lastName ?? ''}`.trim();
      const fields = [
        row?.module,
        name,
        row?.memberId?.toString(),
        row?.authNumber,
        row?.userName,                 // Refer To (username)
        row?.activityType,
        row?.status
      ];

      return fields.some(v => (v ?? '').toString().toLowerCase().includes(q));
    };

    // Map column names -> the real value to sort by. Without this,
    // MatTableDataSource looks up row[columnName] which doesn't exist for
    // 'member', 'authnumber', 'referredTo', 'followUpDate' (field names differ).
    this.dataSource.sortingDataAccessor = (item: any, property: string): string | number => {
      switch (property) {
        case 'module':
          return (item.module ?? '').toString().toLowerCase();
        case 'member':
          return ((item.lastName ?? '') + ' ' + (item.firstName ?? '')).trim().toLowerCase();
        case 'authnumber':
          return (item.authNumber ?? '').toString().toLowerCase();
        case 'createdOn':
          return item.createdOn ? new Date(item.createdOn).getTime() : 0;
        case 'referredTo':
          return (item.userName ?? '').toString().toLowerCase();
        case 'activityType':
          return (item.activityType ?? '').toString().toLowerCase();
        case 'followUpDate':
          return item.followUpDateTime ? new Date(item.followUpDateTime).getTime() : 0;
        case 'dueDate':
          return item.dueDate ? new Date(item.dueDate).getTime() : 0;
        case 'status':
          return (item.status ?? '').toString().toLowerCase();
        case 'comments':
          return (item.comments ?? '').toString().toLowerCase();
        default:
          return (item as any)[property];
      }
    };

    setTimeout(() => this.scrollToWorkingHours());
  }

  /** Wire your real service here. It should return rows with camelCase keys:
   * module, firstName, lastName, memberId, createdOn, referredTo, userName,
   * activityType, followUpDateTime, dueDate, status, (and optionally statusId
   * / activityTypeId).
   */
  /** Wire your real service here. It should return rows with camelCase keys:
   * module, firstName, lastName, memberId, createdOn, referredTo, userName,
   * activityType, followUpDateTime, dueDate, status, (and optionally statusId
   * / activityTypeId).
   */
  private getMyActivities$(): Observable<ActivityItem[]> {
    return this.activityService.getpendingactivitydetails(this.loggedInUserId);
  }

  private loadData(): void {
    this.getMyActivities$()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: rows => {
          const userId = this.loggedInUserId;
          const filtered: ActivityItem[] = (rows || []).filter(row => {
            const rejected = row?.rejectedUserIds || [];
            // keep the row ONLY if current user is NOT in rejectedUserIds
            return !rejected.some(id => Number(id) === userId);
          });

          // Precompute per-row display values so the template doesn't
          // recreate Date objects on every change-detection cycle.
          for (const row of filtered) {
            row._dueClass = this.computeDueDateClass(row.dueDate);
            row._daysLeftLabel = this.computeDaysLeftLabel(row.dueDate);
          }

          this.activities = filtered;
          this.rawData = filtered;
          this.recomputeAll();           // sets dataSource.data + filter
          this.buildMonthGrid();
          this.buildActiveRangeDays();
          this.cdr.markForCheck();
        },
        error: err => {
          console.error('Error loading my activities', err);
          this.activities = [];
          this.rawData = [];
          this.recomputeAll();
          this.cdr.markForCheck();
        }
      });
  }

  // UI events
  toggleFilters(): void { this.showFilters = !this.showFilters; }

  onQuickSearch(ev: Event): void {
    const v = (ev.target as HTMLInputElement).value ?? '';
    // Push through the debounced pipeline (set up in ngOnInit). Avoids
    // re-filtering rawData on every keystroke.
    this.searchSubject.next(v.trim().toLowerCase());
  }

  isDueSelected(kind: 'OVERDUE' | 'TODAY' | 'FUTURE'): boolean {
    return this.selectedDue.has(kind);
  }

  setDueChip(kind: 'OVERDUE' | 'TODAY' | 'FUTURE'): void {
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

    if (this.selectedDue.size > 0) {
      const today = new Date();
      base = base.filter(r => {
        const d = this.toDate(r?.dueDate);
        if (!d) return false;

        const cmp = this.compareDateOnly(d, today); // <0 overdue, 0 today, >0 future

        if (this.selectedDue.has('OVERDUE') && cmp < 0) return true;
        if (this.selectedDue.has('TODAY') && cmp === 0) return true;
        if (this.selectedDue.has('FUTURE') && cmp > 0) return true;
        return false;
      });
    }

    this.dataSource.data = base;
    this.dataSource.filter = this.quickSearchTerm;

    if (this._paginator) {
      this._paginator.firstPage();
    }
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
  fullName(row: ActivityItem): string {
    const f = row?.firstName ?? '';
    const l = row?.lastName ?? '';
    return `${f} ${l}`.trim();
  }

  /** Pure compute — used both at load time (precompute) and as a fallback. */
  private computeDueDateClass(dateVal: any): string {
    const d = this.toDate(dateVal);
    if (!d) return 'due-unknown';
    const cmp = this.compareDateOnly(d, new Date());
    if (cmp < 0) return 'due-red';
    if (cmp === 0) return 'due-amber';
    return 'due-green';
  }

  /** Pure compute — used both at load time (precompute) and as a fallback. */
  private computeDaysLeftLabel(dateVal: any): string {
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

  /**
   * Public template helpers. The HTML now binds to `row._dueClass` /
   * `row._daysLeftLabel` directly (precomputed in loadData) for perf, but
   * these wrappers stay for any caller that still passes a date.
   */
  getDueDateClass(dateVal: any): string {
    return this.computeDueDateClass(dateVal);
  }

  getDaysLeftLabel(dateVal: any): string {
    return this.computeDaysLeftLabel(dateVal);
  }

  onMemberClick(memberId: number | string, memberName: string, memberDetailsId: string): void {
    const tabLabel = `Member: ${memberName}`;
    const tabRoute = `/member-info/${memberId}`;

    const existingTab = this.headerService.getTabs().find(tab => tab.route === tabRoute);
    if (existingTab) {
      this.headerService.selectTab(tabRoute);
    } else {
      this.headerService.addTab(tabLabel, tabRoute, String(memberId), memberDetailsId);
    }

    this.router.navigateByUrl('/', { skipLocationChange: true }).then(() => {
      this.router.navigate([tabRoute]);
    });
  }

  onAuthClick(authNumber: string = '', memId: string = '', memberDetailsId: string) {
    this.openAuthTab(authNumber, memId, memberDetailsId, false);
  }

  private openAuthTab(authNumber: string, memId: string = '', memDetailsId: string, isNew: boolean): void {
    this.addClicked.emit(authNumber);

    const memberId = String(memId ?? '').trim();
    const memberDetailsId = String(memDetailsId ?? '').trim();

    if (!memberId || !Number.isFinite(Number(memberId))) {
      console.error('Invalid memberId for auth tab route', memId);
      return;
    }

    if (!memberDetailsId || !Number.isFinite(Number(memberDetailsId))) {
      console.error('Invalid memberDetailsId for auth tab route', memDetailsId);
      return;
    }

    const authNo = isNew ? '0' : String(authNumber || '').trim();
    const stepRoute = isNew ? 'smartcheck' : 'details';

    const urlTree = this.router.createUrlTree([
      '/member-info',
      memberId,
      'auth',
      authNo,
      stepRoute
    ]);

    const tabRoute = this.router.serializeUrl(urlTree);
    const tabLabel = isNew ? `Auth # DRAFT` : `Auth # ${authNo}`;

    const existingTab = this.headerService.getTabs().find(t => t.route === tabRoute);

    if (existingTab) {
      this.headerService.updateTab(tabRoute, {
        label: tabLabel,
        route: tabRoute,
        memberId: String(memberId),
        memberDetailsId: String(memberDetailsId)
      });
    } else {
      this.headerService.addTab(tabLabel, tabRoute, String(memberId), String(memberDetailsId));
    }

    // Critical: hydrate selected member context BEFORE the member-details shell loads.
    // Header tab click was doing this later, which is why clicking the header fixed the sidebar.
    this.headerService.selectTab(tabRoute);
    sessionStorage.setItem('selectedMemberDetailsId', String(memberDetailsId));

    // Match HeaderComponent.onTabClick behavior: force a clean route activation and
    // pass member metadata in query params as an additional fallback.
    this.router.navigateByUrl('/', { skipLocationChange: true }).then(() => {
      const tree = this.router.parseUrl(tabRoute);
      tree.queryParams = {
        ...(tree.queryParams ?? {}),
        memberId: String(memberId),
        memberDetailsId: String(memberDetailsId)
      };
      this.router.navigateByUrl(tree);
    });
  }

  //onAuthClick(authNumber: string = '', memId: string | number = '', memberDetailsId: string): void {
  //  this.addClicked.emit(authNumber);
  //  this.memberService.setIsCollapse(true);

  //  if (!authNumber) authNumber = 'DRAFT';

  //  // Prefer the explicit member id; fall back to the route param.
  //  // NOTE: `??` only fires on null/undefined — empty string sails through,
  //  // so `||` is the correct operator here.
  //  const memberId = memId || Number(this.route.parent?.snapshot.paramMap.get('id'));

  //  // Point tab to the CHILD route under the shell
  //  const tabRoute = `/member-info/${memberId}/member-auth/${authNumber}`;
  //  const tabLabel = `Auth No ${authNumber}`;

  //  const existingTab = this.headerService.getTabs().find(t => t.route === tabRoute);

  //  if (existingTab) {
  //    this.headerService.selectTab(tabRoute);
  //    const mdId = existingTab.memberDetailsId ?? null;
  //    if (mdId) sessionStorage.setItem('selectedMemberDetailsId', mdId);
  //  } else {
  //    this.headerService.addTab(tabLabel, tabRoute, String(memberId));
  //    sessionStorage.setItem('selectedMemberDetailsId', memberDetailsId);
  //  }
  //  this.router.navigateByUrl('/', { skipLocationChange: true }).then(() => {
  //    this.router.navigate([tabRoute]);
  //  });
  //}

  // Calendar view methods (kept for parity; not used currently)
  setViewMode(mode: 'calendar' | 'table'): void {
    this.viewMode = mode;
  }


  /************Calendar Control**********/
  /** Build month grid (6x7) for currentMonth */
  private buildMonthGrid(): void {
    const base = this.stripTime(this.currentMonth);
    const firstOfMonth = new Date(base.getFullYear(), base.getMonth(), 1);
    const start = new Date(firstOfMonth);
    const dayOfWeek = start.getDay(); // 0..6

    // go back to Sunday of the first row
    start.setDate(start.getDate() - dayOfWeek);

    this.visibleCalendarDays = [];
    const today = this.stripTime(new Date());

    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);

      this.visibleCalendarDays.push({
        date: d,
        isCurrentMonth: d.getMonth() === base.getMonth(),
        isToday: this.isSameDate(d, today),
        activities: this.getActivitiesForDate(d)
      });
    }

    this.updateRangeLabel();
  }

  /** For day/week/work-week time grid */
  private buildActiveRangeDays(): void {
    const base = this.stripTime(this.selectedDate || this.currentDate);
    let start: Date;
    let end: Date;

    if (this.calendarViewRange === 'day') {
      start = end = base;
    } else if (this.calendarViewRange === 'week') {
      // Sunday–Saturday
      start = new Date(base);
      start.setDate(base.getDate() - base.getDay());
      end = new Date(start);
      end.setDate(start.getDate() + 6);
    } else {
      // work week: Monday–Friday
      const dow = base.getDay(); // 0=Sun..6=Sat
      start = new Date(base);
      start.setDate(base.getDate() - ((dow + 6) % 7)); // back to Monday
      end = new Date(start);
      end.setDate(start.getDate() + 4);
    }

    const today = this.stripTime(new Date());
    this.activeRangeDays = [];

    const cursor = new Date(start);
    while (cursor <= end) {
      const dayActivities = this.getActivitiesForDate(cursor);
      this.activeRangeDays.push({
        date: new Date(cursor),
        isCurrentMonth: cursor.getMonth() === this.currentMonth.getMonth(),
        isToday: this.isSameDate(cursor, today),
        activities: dayActivities,
        hourBuckets: this.bucketActivitiesByHour(dayActivities)
      });
      cursor.setDate(cursor.getDate() + 1);
    }

    this.updateRangeLabel(start, end);
  }

  /** Group an activity list into a 0..23 hour bucket map, computed once per day. */
  private bucketActivitiesByHour(items: ActivityItem[]): { [hour: number]: ActivityItem[] } {
    const buckets: { [hour: number]: ActivityItem[] } = {};
    for (const ev of items) {
      const src = ev.followUpDateTime || ev.dueDate;
      if (!src) continue;
      const d = new Date(src as any);
      const h = d.getHours();
      (buckets[h] = buckets[h] || []).push(ev);
    }
    return buckets;
  }

  /** Get activities whose followUpDateTime (or dueDate) is on a specific date */
  private getActivitiesForDate(date: Date): ActivityItem[] {
    const target = this.stripTime(date).getTime();
    return (this.activities || []).filter(ev => {
      const src = ev.followUpDateTime || ev.dueDate;
      if (!src) { return false; }
      const d = this.stripTime(new Date(src));
      return d.getTime() === target;
    });
  }

  // === toolbar / nav actions ===

  setCalendarViewRange(range: CalendarViewRange): void {
    this.calendarViewRange = range;
    if (range === 'month') {
      this.currentMonth = new Date(this.selectedDate);
      this.buildMonthGrid();
    } else {
      this.buildActiveRangeDays();
    }
  }

  goToToday(): void {
    const today = new Date();
    this.currentDate = today;
    this.selectedDate = today;
    this.currentMonth = today;
    this.buildMonthGrid();
    this.buildActiveRangeDays();
  }

  goToPreviousRange(): void {
    const base = new Date(this.selectedDate);
    if (this.calendarViewRange === 'month') {
      this.currentMonth = new Date(
        this.currentMonth.getFullYear(),
        this.currentMonth.getMonth() - 1,
        1
      );
      this.selectedDate = this.currentMonth;
      this.buildMonthGrid();
    } else if (this.calendarViewRange === 'day') {
      base.setDate(base.getDate() - 1);
      this.selectedDate = base;
    } else if (this.calendarViewRange === 'week') {
      base.setDate(base.getDate() - 7);
      this.selectedDate = base;
    } else {
      // work week
      base.setDate(base.getDate() - 7);
      this.selectedDate = base;
    }
    this.buildActiveRangeDays();
  }

  goToNextRange(): void {
    const base = new Date(this.selectedDate);
    if (this.calendarViewRange === 'month') {
      this.currentMonth = new Date(
        this.currentMonth.getFullYear(),
        this.currentMonth.getMonth() + 1,
        1
      );
      this.selectedDate = this.currentMonth;
      this.buildMonthGrid();
    } else if (this.calendarViewRange === 'day') {
      base.setDate(base.getDate() + 1);
      this.selectedDate = base;
    } else if (this.calendarViewRange === 'week') {
      base.setDate(base.getDate() + 7);
      this.selectedDate = base;
    } else {
      base.setDate(base.getDate() + 7);
      this.selectedDate = base;
    }
    this.buildActiveRangeDays();
  }

  changeMonth(offset: number): void {
    this.currentMonth = new Date(
      this.currentMonth.getFullYear(),
      this.currentMonth.getMonth() + offset,
      1
    );
    this.buildMonthGrid();
  }

  onMiniDayClick(day: CalendarDay): void {
    this.selectedDate = new Date(day.date);
    if (this.calendarViewRange === 'month') {
      // keep month view but move active range anchor
      this.buildActiveRangeDays();
    } else {
      this.buildActiveRangeDays();
    }
  }

  onCalendarDayClick(day: CalendarDay, event: MouseEvent): void {
    event.stopPropagation();
    this.selectedDate = new Date(day.date);
    if (this.calendarViewRange !== 'month') {
      this.buildActiveRangeDays();
    }
    // existing logic you may already have (open drawer, etc.)
  }

  onCalendarEventClick(ev: ActivityItem, event: MouseEvent): void {
    event.stopPropagation();
    // hook into your existing event click handler
  }

  // === helpers ===

  isSameDate(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate();
  }

  private stripTime(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  private updateRangeLabel(start?: Date, end?: Date): void {
    if (this.calendarViewRange === 'month') {
      this.rangeLabel = this.currentMonth.toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric'
      });
      return;
    }

    const s = this.stripTime(start || this.activeRangeDays[0]?.date || new Date());
    const e = this.stripTime(end || this.activeRangeDays[this.activeRangeDays.length - 1]?.date || s);

    if (this.isSameDate(s, e)) {
      this.rangeLabel = s.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      });
    } else {
      const left = s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const right = e.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: s.getFullYear() === e.getFullYear() ? undefined : 'numeric'
      });
      this.rangeLabel = `${left} – ${right}`;
    }
  }

  getTimeLabel(hour: number): string {
    const suffix = hour >= 12 ? 'PM' : 'AM';
    const h12 = hour % 12 === 0 ? 12 : hour % 12;
    return `${h12}:00 ${suffix}`;
  }

  getEventsForHour(day: CalendarDay, hour: number): ActivityItem[] {
    // O(1) read from the precomputed map populated by buildActiveRangeDays.
    return day.hourBuckets?.[hour] ?? [];
  }


  toggleCalendar(cal: { id: number; name: string; color: string; selected: boolean }): void {
    cal.selected = !cal.selected;
    // You can use this to filter activities by calendar later.
  }

  onAccept(row: ActivityItem): void {
    if (!row?.memberActivityWorkGroupId) {
      console.warn('Cannot accept: row has no memberActivityWorkGroupId', row);
      return;
    }
    // TODO: replace native confirm() with MatDialog when a confirm-dialog
    // component is available — leaving this for now to keep behavior stable.
    if (!confirm('Are you sure you want to accept this activity?')) {
      return;
    }

    const payload: AcceptWorkGroupActivityRequest = {
      memberActivityWorkGroupId: row.memberActivityWorkGroupId,
      userId: this.loggedInUserId,
      comment: 'Accepted'
    };

    this.memberActivityService.acceptWorkGroupActivity(payload)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => this.loadData(),
        error: err => console.error('Error accepting work-group activity', err)
      });
  }

  onReject(row: ActivityItem): void {
    if (!row?.memberActivityWorkGroupId) {
      console.warn('Cannot reject: row has no memberActivityWorkGroupId', row);
      return;
    }
    // TODO: replace native confirm() with MatDialog (with a reason prompt)
    // when a confirm-dialog component is available.
    if (!confirm('Are you sure you want to reject this activity?')) {
      return;
    }

    const payload: RejectWorkGroupActivityRequest = {
      memberActivityWorkGroupId: row.memberActivityWorkGroupId,
      userId: this.loggedInUserId,
      comment: 'Rejected'
    };

    this.memberActivityService.rejectWorkGroupActivity(payload)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => this.loadData(),
        error: err => console.error('Error rejecting work-group activity', err)
      });
  }


  onView(ev: any): void {
    // your view logic here (maybe open details dialog)
  }

  /**********Work Group************/

  private buildUsersForAssignments(assignments: WorkGroupAssignment[]): SimpleUser[] {
    const userMap = new Map<number, string>();

    for (const row of assignments) {
      const ids = row.assignedUserIds || [];
      const names = row.assignedUserNames || [];

      ids.forEach((id, index) => {
        const name = names[index] ?? '';
        if (!userMap.has(id)) {
          userMap.set(id, name);
        }
      });
    }

    return Array.from(userMap.entries()).map(([userId, userFullName]) => ({
      userId,
      userFullName
    }));
  }

  private updateVisibleUsers(): void {
    if (!this.workGroupAssignments || this.workGroupAssignments.length === 0) {
      this.visibleUsers = [];
      return;
    }

    const relevant = this.selectedWorkGroupId == null
      ? this.workGroupAssignments                     // all groups
      : this.workGroupAssignments.filter(a => a.workGroupId === this.selectedWorkGroupId);

    this.visibleUsers = this.buildUsersForAssignments(relevant);
    this.applyUserFilter();
  }

  onWorkGroupChipClick(workGroupId: number | null): void {
    this.selectedWorkGroupId = workGroupId;

    if (workGroupId == null) {
      this.selectedWorkGroupName = 'All work groups';
    } else {
      const found = this.workGroups.find(w => w.workGroupId === workGroupId);
      this.selectedWorkGroupName = found?.workGroupName || 'Selected group';
    }

    this.updateVisibleUsers();


    // reset selection when group changes
    this.selectedUserIds = [];
    // reset search when switching group
    this.userSearchTerm = '';

  }


  isUserSelected(userId: number): boolean {
    return this.selectedUserIds.includes(userId);
  }

  onUserCheckboxChange(user: SimpleUser, event: Event): void {
    const input = event.target as HTMLInputElement;
    const checked = input.checked;

    if (checked) {
      // trying to select
      if (this.selectedUserIds.length >= this.maxUserSelection) {
        // undo the check in UI
        input.checked = false;
        alert(`You can select maximum ${this.maxUserSelection} users.`);
        return;
      }

      if (!this.selectedUserIds.includes(user.userId)) {
        this.selectedUserIds.push(user.userId);
      }
    } else {
      // unselect
      this.selectedUserIds = this.selectedUserIds.filter(id => id !== user.userId);
    }

    // TODO: apply this.selectedUserIds to filter calendar events if needed
    // this.filterActivitiesBySelectedUsers();
  }

  applyUserFilter(): void {
    const term = (this.userSearchTerm || '').toLowerCase().trim();

    if (!term) {
      this.filteredVisibleUsers = [...this.visibleUsers];
      return;
    }

    this.filteredVisibleUsers = this.visibleUsers.filter(u =>
      (u.userFullName || '').toLowerCase().includes(term) ||
      String(u.userId).includes(term)
    );
  }


  /**********Activity Detail Drawer************/
  // Called from both calendar and table View buttons
  onViewActivity(item: ActivityItem): void {
    const id = item?.activityId;
    if (!id) {
      console.warn('No activityId found on row/event', item);
      return;
    }
    this.selectedFollowUpDate = null;
    this.selectedActivityId = id;
  }

  closeDetail(): void {
    this.selectedActivityId = null;
    this.selectedFollowUpDate = null;
  }




  onTimeSlotDblClick(day: CalendarDay, hour: number, event: MouseEvent): void {
    event.stopPropagation();

    // Build a Date from the day + hour (you can adjust minutes if you have 30-min slots)
    const dt = new Date(day.date);
    dt.setHours(hour, 0, 0, 0); // hour:00

    this.selectedSlot = {
      dayKey: this.getDayKey(day),
      hour
    };

    this.selectedActivityId = null;        // we are creating a NEW activity
    this.selectedFollowUpDate = dt;        // pass to memberactivity component
  }

  private getDayKey(day: CalendarDay): string {
    const d = day.date instanceof Date ? day.date : new Date(day.date);
    return d.toISOString().substring(0, 10); // 'YYYY-MM-DD'
  }

  isSelectedSlot(day: CalendarDay, hour: number): boolean {
    if (!this.selectedSlot) {
      return false;
    }

    return (
      this.selectedSlot.dayKey === this.getDayKey(day) &&
      this.selectedSlot.hour === hour
    );
  }


  private scrollToWorkingHours(): void {
    if (!this.timeGridContainer || !this.hourRows?.length) {
      return;
    }

    const containerEl = this.timeGridContainer.nativeElement;
    const rows = this.hourRows.toArray();

    const targetRowRef = rows.find(ref => {
      const el = ref.nativeElement as HTMLDivElement;
      const hour = Number(el.dataset['hour']);
      return hour === this.workingStartHour;
    });

    if (!targetRowRef) {
      return;
    }

    const rowEl = targetRowRef.nativeElement as HTMLDivElement;

    // rowEl.offsetTop is relative to .time-grid container
    containerEl.scrollTop = rowEl.offsetTop;
  }

  // ================================================================
  // COLUMN CHOOSER (settings gear)
  // ================================================================

  /** Called once on init: snapshot defaults, restore saved prefs, build list. */
  private initColumns(): void {
    this.allColumns.forEach(c => (this.columnDefaults[c.key] = c.visible));
    this.loadColumnPrefs();
    this.rebuildDisplayedColumns();
  }

  /** Recompute displayedColumns from the catalog (preserves master order). */
  private rebuildDisplayedColumns(): void {
    this.displayedColumns = this.allColumns
      .filter(c => c.visible)
      .map(c => c.key);
  }

  /** Open / close the column settings popover. */
  toggleColumnSettings(): void {
    this.showColumnSettings = !this.showColumnSettings;
  }

  closeColumnSettings(): void {
    this.showColumnSettings = false;
  }

  /** Toggle a single column on/off (no-op for locked columns). */
  toggleColumn(col: ColumnDef): void {
    if (col.locked) return;
    col.visible = !col.visible;
    this.rebuildDisplayedColumns();
    this.persistColumnPrefs();
    // Let MatTable re-render the header + cells with the new column set.
    setTimeout(() => this._table?.renderRows(), 0);
  }

  /** Count of optional columns currently hidden (shown as a badge on the gear). */
  get hiddenColumnCount(): number {
    return this.allColumns.filter(c => !c.locked && !c.visible).length;
  }

  /** Turn every column on. */
  showAllColumns(): void {
    this.allColumns.forEach(c => (c.visible = true));
    this.rebuildDisplayedColumns();
    this.persistColumnPrefs();
    setTimeout(() => this._table?.renderRows(), 0);
  }

  /** Restore the original out-of-the-box column layout. */
  resetColumns(): void {
    this.allColumns.forEach(c => (c.visible = this.columnDefaults[c.key]));
    this.rebuildDisplayedColumns();
    this.persistColumnPrefs();
    setTimeout(() => this._table?.renderRows(), 0);
  }

  /** Persist the current layout so it survives page reloads. */
  private persistColumnPrefs(): void {
    try {
      const data = this.allColumns
        .filter(c => !c.locked)
        .map(c => ({ key: c.key, visible: c.visible }));
      localStorage.setItem(this.COL_PREF_KEY, JSON.stringify(data));
    } catch {
      /* storage unavailable / quota exceeded — prefs just won't persist */
    }
  }

  /** Restore a previously saved layout, if any. */
  private loadColumnPrefs(): void {
    try {
      const raw = localStorage.getItem(this.COL_PREF_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as Array<{ key: string; visible: boolean }>;
      const savedMap = new Map(saved.map(s => [s.key, !!s.visible]));
      this.allColumns.forEach(c => {
        if (!c.locked && savedMap.has(c.key)) {
          c.visible = savedMap.get(c.key)!;
        }
      });
    } catch {
      /* corrupt prefs — ignore and fall back to defaults */
    }
  }

  // ================================================================
  // COLUMN RESIZE HANDLERS
  // ================================================================
  // Called from each header cell's drag-handle (mousedown).
  onResizeStart(event: MouseEvent, column: string): void {
    event.preventDefault();
    event.stopPropagation(); // don't trigger sort
    this.resizing = {
      col: column,
      startX: event.clientX,
      startWidth: this.columnWidths[column] ?? 120
    };
    document.body.classList.add('mact-resizing');

    this.resizeMoveHandler = (e: MouseEvent) => this.onResizeMove(e);
    this.resizeUpHandler = (e: MouseEvent) => this.onResizeEnd(e);
    document.addEventListener('mousemove', this.resizeMoveHandler);
    document.addEventListener('mouseup', this.resizeUpHandler);
  }

  private onResizeMove(event: MouseEvent): void {
    if (!this.resizing) return;
    const delta = event.clientX - this.resizing.startX;
    const next = Math.max(this.minColumnWidth, this.resizing.startWidth + delta);
    this.columnWidths[this.resizing.col] = next;
  }

  private onResizeEnd(_event: MouseEvent): void {
    this.resizing = null;
    document.body.classList.remove('mact-resizing');
    if (this.resizeMoveHandler) document.removeEventListener('mousemove', this.resizeMoveHandler);
    if (this.resizeUpHandler) document.removeEventListener('mouseup', this.resizeUpHandler);
    this.resizeMoveHandler = undefined;
    this.resizeUpHandler = undefined;
    this.cdr.detectChanges();
  }

}
