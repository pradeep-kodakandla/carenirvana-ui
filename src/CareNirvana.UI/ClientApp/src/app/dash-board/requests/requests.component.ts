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



interface CalendarDay {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  activities: any[]; // same shape as rows in dataSource
}

@Component({
  selector: 'app-requests',
  templateUrl: './requests.component.html',
  styleUrl: './requests.component.css'
})
export class RequestsComponent implements OnInit, AfterViewInit {

  selectedDue = new Set<'OVERDUE' | 'TODAY' | 'FUTURE'>();
  viewMode: 'calendar' | 'table' = 'calendar';
  weekDays: string[] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  currentMonth: Date = new Date();
  calendarDays: CalendarDay[] = [];
  activities: any[] = [];
  // controls Day / Week / Month inside the calendar view
  calendarViewRange: 'day' | 'week' | 'month' = 'month';
  // which day is currently “selected” for day/week views
  selectedDate: Date = new Date();

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
    private activtyService: DashboardServiceService,
    private headerService: HeaderService,
    private router: Router,
    private memberService: MemberService,
    private route: ActivatedRoute) { }

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
    return this.activtyService.getrequestactivitydetails(sessionStorage.getItem('loggedInUserid'));
  }

  private loadData(): void {
    this.getMyActivities$().subscribe({
      next: rows => {
        console.log('My Activities rows', rows);
        this.activities = rows || [];
        this.dataSource.data = this.activities;
        this.rawData = Array.isArray(rows) ? rows : [];
        this.recomputeAll();
        this.buildCalendar();
      },
      error: () => {
        this.rawData = [];
        this.recomputeAll();
        this.activities = [];
        this.dataSource.data = [];
        this.buildCalendar();
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

  changeMonth(delta: number): void {
    const year = this.currentMonth.getFullYear();
    const month = this.currentMonth.getMonth() + delta;
    this.currentMonth = new Date(year, month, 1);
    this.buildCalendar();
  }

  private buildCalendar(): void {
    if (!this.activities) {
      this.calendarDays = [];
      return;
    }

    const year = this.currentMonth.getFullYear();
    const month = this.currentMonth.getMonth();

    const firstOfMonth = new Date(year, month, 1);
    const firstDayOfWeek = firstOfMonth.getDay(); // 0=Sun
    const calendarStart = new Date(firstOfMonth);
    calendarStart.setDate(firstOfMonth.getDate() - firstDayOfWeek);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const days: CalendarDay[] = [];

    for (let i = 0; i < 42; i++) {
      const date = new Date(calendarStart);
      date.setDate(calendarStart.getDate() + i);

      const dayStart = new Date(date);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(date);
      dayEnd.setHours(23, 59, 59, 999);

      const dayActivities = this.activities.filter(a => {
        if (!a.followUpDateTime) { return false; }
        const d = new Date(a.followUpDateTime);
        return d >= dayStart && d <= dayEnd;
      });

      days.push({
        date,
        isCurrentMonth: date.getMonth() === month,
        isToday: date.getTime() === today.getTime(),
        activities: dayActivities
      });
    }

    this.calendarDays = days;
  }

  // Optional: click handlers
  onCalendarEventClick(activity: any, event: MouseEvent): void {
    event.stopPropagation();
    // You can reuse your row click / open details / navigate, e.g.:
    // this.onMemberClick(activity.memberId, activity.firstName + ' ' + activity.lastName);
  }

  onCalendarDayClick(day: CalendarDay, event: MouseEvent): void {
    if (event) {
      event.stopPropagation();
    }

    this.selectedDate = day.date;

  }

  setCalendarViewRange(range: 'day' | 'week' | 'month'): void {
    this.calendarViewRange = range;

    // make sure we always have a selected date
    if (!this.selectedDate) {
      this.selectedDate = new Date(this.currentMonth);
    }
  }

  get visibleCalendarDays(): any[] {
    if (!this.calendarDays || !this.calendarDays.length) {
      return [];
    }

    switch (this.calendarViewRange) {
      case 'day':
        return this.getDayFromDate(this.selectedDate);
      case 'week':
        return this.getWeekFromDate(this.selectedDate);
      case 'month':
      default:
        return this.calendarDays;
    }
  }

  private getDayFromDate(date: Date): any[] {
    const d = this.findCalendarDay(date);
    return d ? [d] : [];
  }

  private getWeekFromDate(date: Date): any[] {
    const target = this.findCalendarDay(date);
    if (!target) {
      return this.calendarDays.slice(0, 7);
    }

    const index = this.calendarDays.indexOf(target);

    // assuming week starts on Sunday (getDay() 0–6)
    const offset = target.date.getDay(); // 0 = Sun, 1 = Mon, ...
    const start = Math.max(0, index - offset);
    return this.calendarDays.slice(start, start + 7);
  }

  private findCalendarDay(date: Date): any | undefined {
    const y = date.getFullYear();
    const m = date.getMonth();
    const d = date.getDate();

    return this.calendarDays.find((x: any) =>
      x.date.getFullYear() === y &&
      x.date.getMonth() === m &&
      x.date.getDate() === d
    );
  }

}
