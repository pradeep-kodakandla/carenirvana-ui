import { Component, OnInit, AfterViewInit, ViewChild, ChangeDetectorRef } from '@angular/core';
import { EventEmitter, Output } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { MatTableDataSource, MatTable } from '@angular/material/table';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { Observable } from 'rxjs';
import { DashboardServiceService } from 'src/app/service/dashboard.service.service';
import { HeaderService } from 'src/app/service/header.service';
import { Router, ActivatedRoute } from '@angular/router';
import { MemberService } from 'src/app/service/shared-member.service';
import { MemberactivityService, AcceptWorkGroupActivityRequest, RejectWorkGroupActivityRequest } from 'src/app/service/memberactivity.service';

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

interface ActiveFilter {
  key: string;
  label: string;
}

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

type CalendarViewRange = 'day' | 'workweek' | 'week' | 'month';

/* ─── Module metadata for color-coded pills ─── */
const MODULE_META: Record<string, { label: string; colorClass: string }> = {
  UM: { label: 'Utilization Mgmt', colorClass: 'mod-um' },
  AG: { label: 'Appeals & Grievances', colorClass: 'mod-ag' },
  CM: { label: 'Care Management', colorClass: 'mod-cm' },
};

@Component({
  selector: 'app-requests',
  templateUrl: './requests.component.html',
  styleUrl: './requests.component.css'
})
export class RequestsComponent implements OnInit, AfterViewInit {

  readonly MODULE_META = MODULE_META;

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

  // ============================================================
  // Column configuration (settings gear / column chooser)
  // ============================================================
  // Master catalog of every column the table CAN show, in display order.
  //   - locked  -> always visible, user cannot hide it
  //   - visible -> current on/off state (also restored from storage)
  // `displayedColumns` is DERIVED from this list, so column order stays
  // consistent no matter what order the user toggles things on/off.
  allColumns: ColumnDef[] = [
    { key: 'module',        label: 'Module',                       visible: true  },
    { key: 'member',        label: 'Member',         locked: true, visible: true  },
    { key: 'authnumber',    label: 'Auth / Case #',                visible: true  },
    { key: 'subType',       label: 'Type',                         visible: true  },
    { key: 'activityType',  label: 'Activity',                     visible: true  },
    { key: 'workBasket',    label: 'Work Basket',                  visible: true  },
    { key: 'referredTo',    label: 'Referred To',                  visible: true  },
    { key: 'dueDate',       label: 'Due Date',                     visible: true  },
    { key: 'status',        label: 'Status',                       visible: true  },
    { key: 'workGroup',     label: 'Work Group',                   visible: false },
    { key: 'createdOn',     label: 'Created On',                   visible: false },
    { key: 'followUpDate',  label: 'Follow-up Date',               visible: false },
    { key: 'comments',      label: 'Comments',                     visible: false },
    { key: 'rejectedCount', label: 'Rejected Count',               visible: false },
    { key: 'actions',       label: 'Actions',        locked: true, visible: true  },
  ];

  // Derived list bound to <table mat-table>. Rebuilt on every change.
  displayedColumns: string[] = [];

  // Snapshot of out-of-the-box visibility, used by "Reset to default".
  private columnDefaults: Record<string, boolean> = {};

  // Column chooser popover open/closed.
  showColumnSettings = false;

  // localStorage key for persisting the user's column layout.
  private readonly COL_PREF_KEY = 'requests.columnPrefs.v1';

  // ============================================================
  // Column resize (drag-from-header)
  // ============================================================
  // Default widths in px. Adjust to taste; user drags override these at runtime.
  columnWidths: Record<string, number> = {
    module:        110,
    member:        210,
    authnumber:    130,
    subType:       110,
    activityType:  150,
    workBasket:    150,
    referredTo:    150,
    dueDate:       180,
    status:        120,
    actions:       140,
    // --- optional columns (added via the column chooser) ---
    workGroup:     150,
    createdOn:     170,
    followUpDate:  170,
    comments:      220,
    rejectedCount: 130,
  };
  private readonly minColumnWidth = 60;
  private resizing: { col: string; startX: number; startWidth: number } | null = null;
  private resizeMoveHandler?: (e: MouseEvent) => void;
  private resizeUpHandler?: (e: MouseEvent) => void;

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
  selectedModule: string | null = null;
  selectedSubType: string | null = null;
  selectedWorkBasket: string | null = null;

  moduleFacets: FacetOption[] = [];
  moduleTotalCount = 0;

  typeFacets: FacetOption[] = [];
  typeTotalCount = 0;

  basketFacets: FacetOption[] = [];
  basketTotalCount = 0;

  expandedElement: any | null = null;

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;
  @ViewChild(MatTable) table!: MatTable<any>;

  constructor(
    private fb: FormBuilder,
    private activityService: DashboardServiceService,
    private headerService: HeaderService,
    private router: Router,
    private memberService: MemberService,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef,
    private memberActivityService: MemberactivityService) { }

  ngOnInit(): void {
    this.filtersForm = this.fb.group({});

    // Build the column set: snapshot defaults, restore any saved layout.
    this.initColumns();

    this.buildMonthGrid();
    this.buildActiveRangeDays();
    this.loadData();

    this.activityService.getuserworkgroups(Number(sessionStorage.getItem('loggedInUserid'))).subscribe({
      next: (res) => {
        this.initializeWorkGroups(res);
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

    // Map column names -> the real value to sort by. Without this,
    // MatTableDataSource looks up row[columnName] which doesn't exist for
    // 'member', 'authnumber', 'workBasket', 'referredTo', 'subType', etc.
    this.dataSource.sortingDataAccessor = (item: any, property: string): string | number => {
      switch (property) {
        case 'module':
          return (item.module || '').toString().toLowerCase();
        case 'member':
          return ((item.lastName || '') + ' ' + (item.firstName || '')).trim().toLowerCase();
        case 'authnumber':
          return (item.authNumber || '').toString().toLowerCase();
        case 'subType':
          return (this.getRowSubType(item) || '').toLowerCase();
        case 'activityType':
          return (item.activityType || '').toString().toLowerCase();
        case 'workBasket':
          return (item.workBasketName || '').toString().toLowerCase();
        case 'workGroup':
          return (item.workGroupName || '').toString().toLowerCase();
        case 'referredTo':
          return (item.userName || '').toString().toLowerCase();
        case 'status':
          return (item.status || '').toString().toLowerCase();
        case 'comments':
          return (item.comments || '').toString().toLowerCase();
        case 'dueDate':
          return item.dueDate ? new Date(item.dueDate).getTime() : 0;
        case 'createdOn':
          return item.createdOn ? new Date(item.createdOn).getTime() : 0;
        case 'followUpDate':
          return item.followUpDateTime ? new Date(item.followUpDateTime).getTime() : 0;
        case 'rejectedCount':
          return item.rejectedCount != null ? Number(item.rejectedCount) : 0;
        default:
          return (item as any)[property];
      }
    };

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

  // ===== UI events =====

  toggleFilters(): void { this.showFilters = !this.showFilters; }

  onQuickSearch(ev: Event): void {
    const v = (ev.target as HTMLInputElement).value ?? '';
    this.quickSearchTerm = v.trim().toLowerCase();
    this.recomputeAll();
  }

  clearSearch(): void {
    this.quickSearchTerm = '';
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

  // ===== Active filter chips for the new design =====

  getActiveFilters(): ActiveFilter[] {
    const chips: ActiveFilter[] = [];
    if (this.selectedModule) {
      chips.push({
        key: 'module',
        label: MODULE_META[this.selectedModule]?.label || this.selectedModule
      });
    }
    if (this.selectedSubType) {
      chips.push({ key: 'subType', label: 'Type: ' + this.selectedSubType });
    }
    if (this.selectedWorkBasket) {
      chips.push({ key: 'basket', label: 'Basket: ' + this.selectedWorkBasket });
    }
    if (this.selectedWorkGroupId !== null) {
      chips.push({ key: 'workGroup', label: 'Group: ' + this.selectedWorkGroupName });
    }
    this.selectedDue.forEach(d => {
      const labels: Record<string, string> = { OVERDUE: 'Overdue', TODAY: 'Due Today', FUTURE: 'Upcoming' };
      chips.push({ key: 'due-' + d, label: labels[d] || d });
    });
    return chips;
  }

  hasActiveFilters(): boolean {
    return this.getActiveFilters().length > 0 || !!this.quickSearchTerm;
  }

  clearSingleFilter(key: string): void {
    if (key === 'module') {
      this.selectedModule = null;
      this.selectedSubType = null;
      this.selectedWorkBasket = null;
    } else if (key === 'subType') {
      this.selectedSubType = null;
    } else if (key === 'basket') {
      this.selectedWorkBasket = null;
    } else if (key === 'workGroup') {
      this.selectedWorkGroupId = null;
      this.selectedWorkGroupName = 'All work groups';
      this.updateVisibleUsers();
    } else if (key.startsWith('due-')) {
      const d = key.replace('due-', '') as 'OVERDUE' | 'TODAY' | 'FUTURE';
      this.selectedDue.delete(d);
    }
    this.recomputeAll();
  }

  clearAllFilters(): void {
    this.selectedModule = null;
    this.selectedSubType = null;
    this.selectedWorkBasket = null;
    this.selectedWorkGroupId = null;
    this.selectedWorkGroupName = 'All work groups';
    this.selectedDue.clear();
    this.quickSearchTerm = '';
    this.updateVisibleUsers();
    this.recomputeAll();
  }

  /** Expose sub-type to the template for table column */
  getRowSubType(row: any): string {
    return this.getModuleSubType(row) || '—';
  }

  /** Module color class for badge rendering */
  getModuleColorClass(moduleKey: string): string {
    return MODULE_META[moduleKey?.toUpperCase()]?.colorClass || 'mod-default';
  }

  // ===== Pipeline =====

  setModule(module: string | null): void {
    const next = module ? module.toUpperCase() : null;

    if (this.selectedModule === next) {
      this.selectedModule = null;
      this.selectedSubType = null;
      this.selectedWorkBasket = null;
    } else {
      this.selectedModule = next;
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
    this.rebuildFacetsAndCounts();

    const baseForDueCounts = this.applyFilters(this.rawData, {
      due: false,
      module: true,
      type: true,
      basket: true,
      search: true
    });
    this.computeDueCounts(baseForDueCounts);

    const finalRows = this.applyFilters(this.rawData, {
      due: true,
      module: true,
      type: true,
      basket: true,
      search: true
    });

    this.activities = finalRows;
    this.dataSource.data = finalRows;
    this.dataSource.filter = '';

    if (this.paginator) this.paginator.firstPage();

    this.buildMonthGrid();
    this.buildActiveRangeDays();
  }

  private rebuildFacetsAndCounts(): void {
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

    if (this.selectedModule && !moduleMap.has(this.selectedModule)) {
      this.selectedModule = null;
      this.selectedSubType = null;
      this.selectedWorkBasket = null;
    }

    if (this.selectedModule) {
      const typeBase = this.applyFilters(this.rawData, {
        due: true,
        module: true,
        type: false,
        basket: true,
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

    if (use.module && this.selectedModule) {
      out = out.filter(r => this.getModuleKey(r).toUpperCase() === this.selectedModule);
    }

    if (use.type && this.selectedSubType) {
      out = out.filter(r => this.getModuleSubType(r) === this.selectedSubType);
    }

    if (use.basket && this.selectedWorkBasket) {
      out = out.filter(r => this.getWorkBasketName(r) === this.selectedWorkBasket);
    }

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

  getStatusClass(status: string): string {
    const s = (status ?? '').toString().trim().toLowerCase();
    if (s === 'open')                               return 'status-open';
    if (s === 'pending')                            return 'status-pending';
    if (s === 'in progress' || s === 'inprogress')  return 'status-in-progress';
    if (s === 'new')                                return 'status-new';
    if (s === 'escalated')                          return 'status-escalated';
    if (s === 'completed' || s === 'done')          return 'status-completed';
    if (s === 'closed')                             return 'status-closed';
    return 'status-default';
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
        this.loadData();
      },
      error: err => {
        console.error('Error rejecting work-group activity', err);
      }
    });
  }

  onView(ev: any): void {
  }

  /************ Work Group ************/
  workGroupAssignments: WorkGroupAssignment[] = [];
  workGroups: SimpleWorkGroup[] = [];
  selectedWorkGroupId: number | null = null;
  selectedWorkGroupName = 'All work groups';

  visibleUsers: SimpleUser[] = [];
  maxUserSelection = 1;
  selectedUserIds: number[] = [];
  userSearchTerm = '';
  filteredVisibleUsers: SimpleUser[] = [];

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

  /************ Calendar Control **********/
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

  // ============================================================
  // Column chooser logic (settings gear)
  // ============================================================

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
    setTimeout(() => this.table?.renderRows(), 0);
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
    setTimeout(() => this.table?.renderRows(), 0);
  }

  /** Restore the original out-of-the-box column layout. */
  resetColumns(): void {
    this.allColumns.forEach(c => (c.visible = this.columnDefaults[c.key]));
    this.rebuildDisplayedColumns();
    this.persistColumnPrefs();
    setTimeout(() => this.table?.renderRows(), 0);
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

  // ============================================================
  // Column resize handlers
  // ============================================================
  // Called from each header cell's drag-handle (mousedown).
  onResizeStart(event: MouseEvent, column: string): void {
    event.preventDefault();
    event.stopPropagation(); // don't trigger sort
    this.resizing = {
      col: column,
      startX: event.clientX,
      startWidth: this.columnWidths[column] ?? 120
    };
    document.body.classList.add('req-resizing');

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
    document.body.classList.remove('req-resizing');
    if (this.resizeMoveHandler) document.removeEventListener('mousemove', this.resizeMoveHandler);
    if (this.resizeUpHandler) document.removeEventListener('mouseup', this.resizeUpHandler);
    this.resizeMoveHandler = undefined;
    this.resizeUpHandler = undefined;
    this.cdr.detectChanges();
  }
}
