import { Component, OnInit, AfterViewInit, ViewChild } from '@angular/core';
import { EventEmitter, Output, } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { MatTableDataSource } from '@angular/material/table';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { Observable } from 'rxjs';
import { DashboardServiceService } from 'src/app/service/dashboard.service.service';
import { HeaderService } from 'src/app/service/header.service';
import { Router, ActivatedRoute } from '@angular/router';
import { MemberService } from 'src/app/service/shared-member.service';
import { MemberactivityService, AcceptWorkGroupActivityRequest, RejectWorkGroupActivityRequest } from 'src/app/service/memberactivity.service';
import { FormsModule } from '@angular/forms';

interface ActivityItem {
  activityType?: string;
  followUpDateTime?: string | Date;
  dueDate?: string | Date;
  firstName?: string;
  lastName?: string;
  memberId?: number;
  status?: string;
  memberActivityWorkGroupId?: number;
}

interface CalendarDay {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  activities: ActivityItem[];
}

interface FacetOption {
  key: string;
  label: string;
  count: number;
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

@Component({
  selector: 'app-requests',
  templateUrl: './requests.component.html',
  styleUrl: './requests.component.css'
})
export class RequestsComponent implements OnInit, AfterViewInit {

  selectedDue = new Set<'OVERDUE' | 'TODAY' | 'FUTURE'>();
  viewMode: 'calendar' | 'table' = 'table';
  weekDays: string[] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  currentMonth: Date = new Date();
  calendarDays: CalendarDay[] = [];
  calendarViewRange: CalendarViewRange = 'workweek';
  currentDate: Date = new Date();
  selectedDate: Date = new Date();

  visibleCalendarDays: CalendarDay[] = [];
  activeRangeDays: CalendarDay[] = [];

  hours: number[] = Array.from({ length: 24 }, (_, i) => i);
  rangeLabel = '';

  userCalendars = [
    { id: 1, name: 'Calendar', color: '#2563eb', selected: true },
    { id: 2, name: 'Reminders', color: '#16a34a', selected: true }
  ];

  // filtered view rows (table + calendar)
  activities: ActivityItem[] = [];

  displayedColumns: string[] = [
    'module',
    'member',
    'authnumber',
    'createdOn',
    'referredTo',
    'activityType',
    'followUpDate',
    'dueDate',
    'status',
    'thumb'
  ];

  dataSource = new MatTableDataSource<any>([]);
  rawData: any[] = [];

  showFilters = false;
  filtersForm!: FormGroup;

  quickSearchTerm = '';

  // due chips counts (dynamic)
  dueChip: 'OVERDUE' | 'TODAY' | 'FUTURE' | null = null;
  overdueCount = 0;
  dueTodayCount = 0;
  dueFutureCount = 0;

  // Faceted filters (Module -> Type -> Work basket)
  selectedModule: string | null = null;       // null = all
  selectedSubType: string | null = null;      // module-specific: Activity/Member/Auth/Case
  selectedWorkBasket: string | null = null;   // workBasketName

  moduleFacets: FacetOption[] = [];
  moduleTotalCount = 0;

  typeFacets: FacetOption[] = [];
  typeTotalCount = 0;

  basketFacets: FacetOption[] = [];
  basketTotalCount = 0;

  expandedElement: any | null = null;

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;

  constructor(
    private fb: FormBuilder,
    private activityService: DashboardServiceService,
    private headerService: HeaderService,
    private router: Router,
    private memberService: MemberService,
    private route: ActivatedRoute,
    private memberActivityService: MemberactivityService) { }

  ngOnInit(): void {
    this.filtersForm = this.fb.group({});
    this.buildMonthGrid();
    this.buildActiveRangeDays();
    this.loadData();

    this.activityService.getuserworkgroups(Number(sessionStorage.getItem('loggedInUserid'))).subscribe({
      next: (res) => {
        this.initializeWorkGroups(res);
        console.log('User work groups:', res);
      },
      error: (err) => {
        console.error('Error fetching user work groups:', err);
      }
    });
  }

  initializeWorkGroups(rows: WorkGroupAssignment[]): void {
    this.workGroupAssignments = rows || [];

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

    this.selectedWorkGroupId = null;
    this.selectedWorkGroupName = 'All work groups';
    this.updateVisibleUsers();
  }

  ngAfterViewInit(): void {
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;

    // kept for compatibility (we do NOT use dataSource.filter anymore; we filter ourselves)
    this.dataSource.filterPredicate = (row: any, filter: string) => {
      const q = (filter || '').trim().toLowerCase();
      if (!q) return true;

      const f = row?.firstName ?? row?.FirstName ?? '';
      const l = row?.lastName ?? row?.LastName ?? '';
      const name = `${f} ${l}`.trim();

      const fields = [
        row?.module ?? row?.Module,
        row?.workGroupName ?? row?.WorkGroupName,
        row?.workBasketName ?? row?.WorkBasketName,
        name,
        (row?.memberId ?? row?.MemberId)?.toString(),
        row?.userName ?? row?.UserName,
        row?.referredTo ?? row?.ReferredTo,
        row?.activityType ?? row?.ActivityType,
        row?.status ?? row?.Status,
        row?.authNumber ?? row?.AuthNumber
      ];

      return fields.some(v => (v ?? '').toString().toLowerCase().includes(q));
    };
  }

  private getMyActivities$(): Observable<any[]> {
    return this.activityService.getrequestactivitydetails(sessionStorage.getItem('loggedInUserid'));
  }

  private loadData(): void {
    this.getMyActivities$().subscribe({
      next: rows => {
        console.log('My Activities rows', rows);
        const filtered = (rows || []).filter((row: any) => {
          const rejected = row.rejectedUserIds || [];
          return !rejected.some((id: any) => Number(id) === Number(sessionStorage.getItem('loggedInUserid')));
        });

        this.rawData = Array.isArray(filtered) ? filtered : [];
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
    if (this.selectedDue.has(kind)) {
      this.selectedDue.delete(kind);
    } else {
      this.selectedDue.add(kind);
    }
    this.recomputeAll();
  }

  // ===== Pipeline =====

  setModule(module: string | null): void {
    const next = module ? module.toUpperCase() : null;

    // toggling the same module chip turns it off
    if (this.selectedModule === next) {
      this.selectedModule = null;
      this.selectedSubType = null;
      this.selectedWorkBasket = null;
    } else {
      this.selectedModule = next;
      // reset dependent filters when module changes
      this.selectedSubType = null;
      this.selectedWorkBasket = null;
    }

    this.recomputeAll();
  }

  setSubType(type: string | null): void {
    if (!this.selectedModule) {
      this.selectedSubType = null;
      return;
    }

    if (this.selectedSubType === type) {
      this.selectedSubType = null;
    } else {
      this.selectedSubType = type;
    }

    this.recomputeAll();
  }

  setWorkBasket(basket: string | null): void {
    if (!this.selectedModule) {
      this.selectedWorkBasket = null;
      return;
    }

    if (this.selectedWorkBasket === basket) {
      this.selectedWorkBasket = null;
    } else {
      this.selectedWorkBasket = basket;
    }

    this.recomputeAll();
  }

  private recomputeAll(): void {
    // (1) rebuild facet counts/options first (may clear invalid selections)
    this.rebuildFacetsAndCounts();

    // (2) due counts should reflect everything except the due chips themselves
    const baseForDueCounts = this.applyFilters(this.rawData, {
      due: false,
      module: true,
      type: true,
      basket: true,
      search: true
    });
    this.computeDueCounts(baseForDueCounts);

    // (3) final filtered list for table / calendar
    const finalRows = this.applyFilters(this.rawData, {
      due: true,
      module: true,
      type: true,
      basket: true,
      search: true
    });

    this.activities = finalRows;
    this.dataSource.data = finalRows;

    // Disable MatTableDataSource.filter because we already filtered
    this.dataSource.filter = '';

    if (this.paginator) this.paginator.firstPage();

    // keep calendar grids in sync (if you enable calendar view later)
    this.buildMonthGrid();
    this.buildActiveRangeDays();
  }

  private rebuildFacetsAndCounts(): void {
    // Module facets: based on current due + search, but NOT module/type/basket selections
    const moduleBase = this.applyFilters(this.rawData, {
      due: true,
      module: false,
      type: false,
      basket: false,
      search: true
    });

    this.moduleTotalCount = moduleBase.length;

    const moduleMap = new Map<string, number>();
    for (const r of moduleBase) {
      const key = this.getModuleKey(r);
      if (!key) continue;
      const k = key.toUpperCase();
      moduleMap.set(k, (moduleMap.get(k) || 0) + 1);
    }
    this.moduleFacets = this.toFacetOptions(moduleMap);

    // If selected module no longer exists, clear it (and dependent filters)
    if (this.selectedModule && !moduleMap.has(this.selectedModule)) {
      this.selectedModule = null;
      this.selectedSubType = null;
      this.selectedWorkBasket = null;
    }

    // Type facets (only when a module is selected)
    if (this.selectedModule) {
      const typeBase = this.applyFilters(this.rawData, {
        due: true,
        module: true,
        type: false,
        basket: true,   // keep basket selection affecting type counts
        search: true
      });

      this.typeTotalCount = typeBase.length;

      const typeMap = new Map<string, number>();
      for (const r of typeBase) {
        const t = this.getModuleSubType(r);
        if (!t) continue;
        typeMap.set(t, (typeMap.get(t) || 0) + 1);
      }
      this.typeFacets = this.toFacetOptions(typeMap);

      if (this.selectedSubType && !typeMap.has(this.selectedSubType)) {
        this.selectedSubType = null;
      }
    } else {
      this.typeFacets = [];
      this.typeTotalCount = 0;
      this.selectedSubType = null;
    }

    // Work basket facets (only when a module is selected)
    if (this.selectedModule) {
      const basketBase = this.applyFilters(this.rawData, {
        due: true,
        module: true,
        type: true,
        basket: false,
        search: true
      });

      this.basketTotalCount = basketBase.length;

      const basketMap = new Map<string, number>();
      for (const r of basketBase) {
        const b = this.getWorkBasketName(r);
        if (!b) continue;
        basketMap.set(b, (basketMap.get(b) || 0) + 1);
      }
      this.basketFacets = this.toFacetOptions(basketMap);

      if (this.selectedWorkBasket && !basketMap.has(this.selectedWorkBasket)) {
        this.selectedWorkBasket = null;
      }
    } else {
      this.basketFacets = [];
      this.basketTotalCount = 0;
      this.selectedWorkBasket = null;
    }
  }

  private applyFilters(rows: any[], flags?: {
    due?: boolean;
    module?: boolean;
    type?: boolean;
    basket?: boolean;
    search?: boolean;
  }): any[] {
    const use = {
      due: true,
      module: true,
      type: true,
      basket: true,
      search: true,
      ...(flags || {})
    };

    let out = Array.isArray(rows) ? [...rows] : [];

    // Module
    if (use.module && this.selectedModule) {
      out = out.filter(r => this.getModuleKey(r).toUpperCase() === this.selectedModule);
    }

    // Module Type (Activity/Member/Auth/Case)
    if (use.type && this.selectedSubType) {
      out = out.filter(r => this.getModuleSubType(r) === this.selectedSubType);
    }

    // Work basket
    if (use.basket && this.selectedWorkBasket) {
      out = out.filter(r => this.getWorkBasketName(r) === this.selectedWorkBasket);
    }

    // Due chips
    if (use.due && this.selectedDue && this.selectedDue.size > 0) {
      const today = new Date();
      out = out.filter(r => {
        const d = this.toDate(this.pick(r, ['dueDate', 'DueDate']));
        if (!d) return false;

        const cmp = this.compareDateOnly(d, today);

        let match = false;
        if (this.selectedDue.has('OVERDUE') && cmp < 0) match = true;
        if (this.selectedDue.has('TODAY') && cmp === 0) match = true;
        if (this.selectedDue.has('FUTURE') && cmp > 0) match = true;

        return match;
      });
    }

    // Quick search
    if (use.search && this.quickSearchTerm) {
      out = out.filter(r => this.matchesQuickSearch(r, this.quickSearchTerm));
    }

    return out;
  }

  private matchesQuickSearch(row: any, termLower: string): boolean {
    const f = this.pick(row, ['firstName', 'FirstName']) ?? '';
    const l = this.pick(row, ['lastName', 'LastName']) ?? '';
    const name = `${f} ${l}`.trim();

    const fields: any[] = [
      this.pick(row, ['module', 'Module']),
      this.pick(row, ['workGroupName', 'WorkGroupName']),
      this.pick(row, ['workBasketName', 'WorkBasketName']),
      name,
      this.pick(row, ['memberId', 'MemberId']),
      this.pick(row, ['userName', 'UserName']),
      this.pick(row, ['referredTo', 'ReferredTo']),
      this.pick(row, ['activityType', 'ActivityType']),
      this.pick(row, ['status', 'Status']),
      this.pick(row, ['authNumber', 'AuthNumber'])
    ];

    return fields.some(v => (v ?? '').toString().toLowerCase().includes(termLower));
  }

  private computeDueCounts(rows: any[]): void {
    const today = new Date();

    const counts = (rows || []).reduce((acc, r) => {
      const d = this.toDate(this.pick(r, ['dueDate', 'DueDate']));
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

  private toFacetOptions(map: Map<string, number>): FacetOption[] {
    return Array.from(map.entries())
      .map(([key, count]) => ({ key, label: key, count }))
      .sort((a, b) => (b.count - a.count) || a.label.localeCompare(b.label));
  }

  private getModuleKey(row: any): string {
    return ((this.pick(row, ['module', 'Module']) ?? '') as any).toString().trim();
  }

  private getWorkBasketName(row: any): string {
    return ((this.pick(row, ['workBasketName', 'WorkBasketName']) ?? '') as any).toString().trim();
  }

  /**
   * Module-specific "type" rules requested:
   * - CM: followUpDateTime present => Activity else Member
   * - UM: Auth if authNumber present else Activity
   * - AG: Case if authNumber present else Activity
   */
  private getModuleSubType(row: any): string | null {
    const module = this.getModuleKey(row).toUpperCase();
    const followUp = this.pick(row, ['followUpDateTime', 'FollowUpDateTime']);
    const authNumber = this.pick(row, ['authNumber', 'AuthNumber']);
    const activityType = this.pick(row, ['activityType', 'ActivityType']);

    if (module === 'CM') {
      return followUp ? 'Activity' : 'Member';
    }

    if (module === 'UM') {
      return authNumber ? 'Auth' : 'Activity';
    }

    if (module === 'AG') {
      return authNumber ? 'Case' : 'Activity';
    }

    // fallback for any unknown module
    if (followUp) return 'Activity';
    if (activityType) return 'Activity';
    return null;
  }

  private pick(row: any, keys: string[]): any {
    for (const k of keys) {
      const v = row?.[k];
      if (v !== undefined && v !== null && v !== '') return v;
    }
    return null;
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
    const f = this.pick(row, ['firstName', 'FirstName']) ?? '';
    const l = this.pick(row, ['lastName', 'LastName']) ?? '';
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

  onAuthClick(authNumber: string = '', memId: string = '', memberDetailsId: string) {
    this.addClicked.emit(authNumber);
    this.memberService.setIsCollapse(true);

    if (!authNumber) authNumber = 'DRAFT';

    const memberId = memId ?? Number(this.route.parent?.snapshot.paramMap.get('id'));

    const tabRoute = `/member-info/${memberId}/member-auth/${authNumber}`;
    const tabLabel = `Auth No ${authNumber}`;

    const existingTab = this.headerService.getTabs().find(t => t.route === tabRoute);

    if (existingTab) {
      this.headerService.selectTab(tabRoute);
      const mdId = existingTab.memberDetailsId ?? null;
      if (mdId) sessionStorage.setItem('selectedMemberDetailsId', mdId);

    } else {
      this.headerService.addTab(tabLabel, tabRoute, String(memberId));
      sessionStorage.setItem('selectedMemberDetailsId', memberDetailsId);
    }
    this.router.navigateByUrl('/', { skipLocationChange: true }).then(() => {
      this.router.navigate([tabRoute]);
    });
  }

  toggleThumb(row: any, event: MouseEvent): void {
    event.stopPropagation();
    if (row.thumb === 'up') {
      row.thumb = 'down';
    } else if (row.thumb === 'down') {
      row.thumb = null;
    } else {
      row.thumb = 'up';
    }
  }

  getThumbClass(row: any): string {
    if (row.thumb === 'up') return 'thumb-up';
    if (row.thumb === 'down') return 'thumb-down';
    return 'thumb-neutral';
  }

  setViewMode(mode: 'calendar' | 'table'): void {
    this.viewMode = mode;
  }

  /************Calendar Control**********/
  private buildMonthGrid(): void {
    const base = this.stripTime(this.currentMonth);
    const firstOfMonth = new Date(base.getFullYear(), base.getMonth(), 1);
    const start = new Date(firstOfMonth);
    const dayOfWeek = start.getDay();

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

  private buildActiveRangeDays(): void {
    const base = this.stripTime(this.selectedDate || this.currentDate);
    let start: Date;
    let end: Date;

    if (this.calendarViewRange === 'day') {
      start = end = base;
    } else if (this.calendarViewRange === 'week') {
      start = new Date(base);
      start.setDate(base.getDate() - base.getDay());
      end = new Date(start);
      end.setDate(start.getDate() + 6);
    } else {
      const dow = base.getDay();
      start = new Date(base);
      start.setDate(base.getDate() - ((dow + 6) % 7));
      end = new Date(start);
      end.setDate(start.getDate() + 4);
    }

    const today = this.stripTime(new Date());
    this.activeRangeDays = [];

    const cursor = new Date(start);
    while (cursor <= end) {
      this.activeRangeDays.push({
        date: new Date(cursor),
        isCurrentMonth: cursor.getMonth() === this.currentMonth.getMonth(),
        isToday: this.isSameDate(cursor, today),
        activities: this.getActivitiesForDate(cursor)
      });
      cursor.setDate(cursor.getDate() + 1);
    }

    this.updateRangeLabel(start, end);
  }

  private getActivitiesForDate(date: Date): ActivityItem[] {
    const target = this.stripTime(date).getTime();
    return (this.activities || []).filter(ev => {
      const src = (ev as any).followUpDateTime ?? (ev as any).FollowUpDateTime ?? (ev as any).dueDate ?? (ev as any).DueDate;
      if (!src) { return false; }
      const d = this.stripTime(new Date(src));
      return d.getTime() === target;
    });
  }

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
    this.buildActiveRangeDays();
  }

  onCalendarDayClick(day: CalendarDay, event: MouseEvent): void {
    event.stopPropagation();
    this.selectedDate = new Date(day.date);
    if (this.calendarViewRange !== 'month') {
      this.buildActiveRangeDays();
    }
  }

  onCalendarEventClick(ev: ActivityItem, event: MouseEvent): void {
    event.stopPropagation();
  }

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
        month: s.getMonth() === e.getMonth() ? 'short' : 'short',
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
    return day.activities.filter(ev => {
      const src = (ev as any).followUpDateTime ?? (ev as any).FollowUpDateTime ?? (ev as any).dueDate ?? (ev as any).DueDate;
      if (!src) { return false; }
      const d = new Date(src as any);
      return d.getHours() === hour;
    });
  }

  toggleCalendar(cal: { id: number; name: string; color: string; selected: boolean }): void {
    cal.selected = !cal.selected;
  }

  onAccept(ev: any): void {
    const confirmed = confirm('Are you sure want to accept the activity?');
    if (!confirmed) return;

    const payload: AcceptWorkGroupActivityRequest = {
      memberActivityWorkGroupId: ev.memberActivityWorkGroupId,
      userId: Number(sessionStorage.getItem('loggedInUserid')),
      comment: 'Accepted from calendar'
    };

    this.memberActivityService.acceptWorkGroupActivity(payload).subscribe({
      next: () => {
        console.log('Work-group activity accepted:', payload);
        this.loadData();
      },
      error: err => {
        console.error('Error accepting work-group activity', err);
      }
    });
  }

  onReject(ev: any): void {
    const confirmed = confirm('Are you sure want to reject the activity?');
    if (!confirmed) return;

    const payload: RejectWorkGroupActivityRequest = {
      memberActivityWorkGroupId: ev.memberActivityWorkGroupId,
      userId: Number(sessionStorage.getItem('loggedInUserid')),
      comment: 'Rejected from calendar'
    };

    this.memberActivityService.rejectWorkGroupActivity(payload).subscribe({
      next: () => {
        console.log('Work-group activity rejected:', payload);
        this.loadData();
      },
      error: err => {
        console.error('Error rejecting work-group activity', err);
      }
    });
  }

  onView(ev: any): void {
  }

  /**********Work Group************/
  workGroupAssignments: WorkGroupAssignment[] = [];
  workGroups: SimpleWorkGroup[] = [];
  selectedWorkGroupId: number | null = null;
  selectedWorkGroupName = 'All work groups';

  visibleUsers: SimpleUser[] = [];
  maxUserSelection = 1;
  selectedUserIds: number[] = [];
  userSearchTerm = '';
  filteredVisibleUsers: SimpleUser[] = []

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
      ? this.workGroupAssignments
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
    this.selectedUserIds = [];
    this.userSearchTerm = '';
  }

  isUserSelected(userId: number): boolean {
    return this.selectedUserIds.includes(userId);
  }

  onUserCheckboxChange(user: SimpleUser, event: Event): void {
    const input = event.target as HTMLInputElement;
    const checked = input.checked;

    if (checked) {
      if (this.selectedUserIds.length >= this.maxUserSelection) {
        input.checked = false;
        alert(`You can select maximum ${this.maxUserSelection} users.`);
        return;
      }

      if (!this.selectedUserIds.includes(user.userId)) {
        this.selectedUserIds.push(user.userId);
      }
    } else {
      this.selectedUserIds = this.selectedUserIds.filter(id => id !== user.userId);
    }
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
}
