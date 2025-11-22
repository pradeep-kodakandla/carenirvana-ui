import { Component, OnInit, AfterViewInit, ViewChild } from '@angular/core';
import { EventEmitter, Output, } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { MatTableDataSource } from '@angular/material/table';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { Observable, of } from 'rxjs';
import { DashboardServiceService } from 'src/app/service/dashboard.service.service';
import { HeaderService } from 'src/app/service/header.service';
import { Router, ActivatedRoute } from '@angular/router';
import { MemberService } from 'src/app/service/shared-member.service';
import { MemberactivityService, AcceptWorkGroupActivityRequest, RejectWorkGroupActivityRequest, DeleteMemberActivityRequest } from 'src/app/service/memberactivity.service';
import { FormsModule } from '@angular/forms';
interface ActivityItem {
  activityType?: string;
  followUpDateTime?: string | Date;
  dueDate?: string | Date;
  firstName?: string;
  lastName?: string;
  memberId?: number;
  status?: string;
}

interface CalendarDay {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  activities: ActivityItem[]; // same shape as rows in dataSource
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
  selector: 'app-myactivities',
  templateUrl: './myactivities.component.html',
  styleUrls: ['./myactivities.component.css']
})
export class MyactivitiesComponent implements OnInit, AfterViewInit {

  selectedDue = new Set<'OVERDUE' | 'TODAY' | 'FUTURE'>();
  viewMode: 'calendar' | 'table' = 'calendar';
  weekDays: string[] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  currentMonth: Date = new Date();
  calendarDays: CalendarDay[] = [];
  calendarViewRange: CalendarViewRange = 'workweek';  // default like Outlook
  currentDate: Date = new Date();
  selectedDate: Date = new Date();

  visibleCalendarDays: CalendarDay[] = [];
  activeRangeDays: CalendarDay[] = [];

  // hours shown in the time grid (change to taste)
  //hours: number[] = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
  hours: number[] = Array.from({ length: 24 }, (_, i) => i);

  rangeLabel = '';

  // sample “My calendars” data – wire to your own filters later
  userCalendars = [
    { id: 1, name: 'Calendar', color: '#2563eb', selected: true },
    { id: 2, name: 'Reminders', color: '#16a34a', selected: true }
  ];

  // this should already exist in your component
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

  constructor(
    private fb: FormBuilder,
    private activityService: DashboardServiceService,
    private headerService: HeaderService,
    private router: Router,
    private memberService: MemberService,
    private route: ActivatedRoute,
    private memberActivityService: MemberactivityService) { }

  ngOnInit(): void {
    this.filtersForm = this.fb.group({}); // empty grid per request
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
        row?.UserName,                 // Refer To (username)
        row?.ActivityType,
        row?.Status
      ];

      return fields.some(v => (v ?? '').toString().toLowerCase().includes(q));
    };
  }

  /** Wire your real service here (kept AS-IS). It should return rows with PascalCase keys:
   * Module, FirstName, LastName, MemberId, CreatedOn, ReferredTo, UserName, ActivityType,
   * FollowUpDateTime, DueDate, Status, (and optionally StatusId / ActivityTypeId).
   */
  private getMyActivities$(): Observable<any[]> {
    return this.activityService.getpendingactivitydetails(sessionStorage.getItem('loggedInUserid'));
  }

  private loadData(): void {
    this.getMyActivities$().subscribe({
      next: rows => {
        console.log('My Activities rows', rows);
        const filtered = (rows || []).filter((row: any) => {
          const rejected = row.rejectedUserIds || [];

          // keep the row ONLY if current user is NOT in rejectedUserIds
          return !rejected.some((id: any) => Number(id) === Number(sessionStorage.getItem('loggedInUserid')));
        });
        this.activities = filtered || [];
        this.dataSource.data = this.activities;
        this.rawData = Array.isArray(filtered) ? filtered : [];
        this.recomputeAll();
        this.buildMonthGrid();
        this.buildActiveRangeDays();

      },
      error: () => {
        this.rawData = [];
        this.recomputeAll();
        this.activities = [];
        this.dataSource.data = [];

      }
    });
    this.loadActivityDetail(4);

  }

  loadActivityDetail(id: number): void {
    this.memberActivityService.getMemberActivityDetail(id).subscribe({
      next: detail => {
        /*this.activityDetail = detail;*/
        console.log('Activity detail loaded', detail);
      },
      error: err => {
        console.error('Error loading activity detail', err);
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

    // read member id once (prefer your own field; fall back to route)
    const memberId = memId ?? Number(this.route.parent?.snapshot.paramMap.get('id'));

    // ✅ point tab to the CHILD route under the shell
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
    event.stopPropagation(); // prevent row expansion click
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
      this.activeRangeDays.push({
        date: new Date(cursor),
        isCurrentMonth: cursor.getMonth() === this.currentMonth.getMonth(),
        isToday: this.isSameDate(cursor, today),
        activities: this.getActivitiesForDate(cursor)   // 🔴 same as month
      });
      cursor.setDate(cursor.getDate() + 1);
    }

    this.updateRangeLabel(start, end);
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
      if (!ev.followUpDateTime && !ev.dueDate) { return false; }
      const src = ev.followUpDateTime || ev.dueDate;
      const d = new Date(src as any);
      return d.getHours() === hour;
    });
  }


  toggleCalendar(cal: { id: number; name: string; color: string; selected: boolean }): void {
    cal.selected = !cal.selected;
    // You can use this to filter activities by calendar later.
  }

  onAccept(ev: any): void {
    const confirmed = confirm('Are you sure want to accept the activity?');
    if (!confirmed) {
      return;
    }

    const payload: AcceptWorkGroupActivityRequest = {
      memberActivityWorkGroupId: 1,
      userId: Number(sessionStorage.getItem('loggedInUserid')),
      comment: 'Accepted from calendar' // optional
    };

    this.memberActivityService.acceptWorkGroupActivity(payload).subscribe({
      next: () => {
        console.log('Work-group activity accepted:', payload);
        // TODO: refresh list / calendar if needed
        this.loadData();
      },
      error: err => {
        console.error('Error accepting work-group activity', err);
      }
    });
  }

  onReject(ev: any): void {
    const confirmed = confirm('Are you sure want to reject the activity?');
    if (!confirmed) {
      return;
    }

    const payload: RejectWorkGroupActivityRequest = {
      memberActivityWorkGroupId: 1,
      userId: Number(sessionStorage.getItem('loggedInUserid')),
      comment: 'Rejected from calendar' // or prompt for reason
    };

    this.memberActivityService.rejectWorkGroupActivity(payload).subscribe({
      next: () => {
        console.log('Work-group activity rejected:', payload);
        // TODO: refresh list / calendar if needed
        this.loadData();
      },
      error: err => {
        console.error('Error rejecting work-group activity', err);
      }
    });
  }


  onView(ev: any): void {
    // your view logic here (maybe open details dialog)
  }

  /**********Work Group************/

  // raw result from API
  workGroupAssignments: WorkGroupAssignment[] = [];

  // distinct work groups to show as chips
  workGroups: SimpleWorkGroup[] = [];

  // currently selected group; null = all groups
  selectedWorkGroupId: number | null = null;
  selectedWorkGroupName = 'All work groups';

  // users shown on the left side
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
  selectedActivityId: number | null = null;

  // Called from both calendar and table View buttons
  onViewActivity(item: any): void {
    console.log('View activity clicked', item);
    const id = item.activityId ;
    if (!id) {
      console.warn('No memberActivityId found on row/event', item);
      return;
    }
    this.selectedActivityId = id;
  }

  closeDetail(): void {
    this.selectedActivityId = null;
  }

}
