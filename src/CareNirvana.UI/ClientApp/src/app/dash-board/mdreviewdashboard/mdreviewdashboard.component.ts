import { Component, OnInit, AfterViewInit, ViewChild } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { MatTableDataSource } from '@angular/material/table';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { Observable, of } from 'rxjs';
import { DashboardServiceService } from 'src/app/service/dashboard.service.service';
import { HeaderService } from 'src/app/service/header.service';
import { Router } from '@angular/router';
import { AuthService } from 'src/app/service/auth.service';

@Component({
  selector: 'app-mdreviewdashboard',
  templateUrl: './mdreviewdashboard.component.html',
  styleUrl: './mdreviewdashboard.component.css'
})
export class MdreviewdashboardComponent {

  selectedAuthData: any = {};

  constructor(
    private fb: FormBuilder,
    private activtyService: DashboardServiceService,
    private headerService: HeaderService,
    private router: Router,
    private authService: AuthService
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


  auths = [
    {
      memberId: '123456789',
      firstName: 'John',
      lastName: 'Smith',
      authNumber: '0208TSB1N',
      authType: 'Acute',
      facility: 'Hospital Care',
      networkStatus: 'Par',
      dueDate: '08/01/2025 6:00 PM',
      priority: 'High',
      serviceLines: [
        { code: '99213', desc: 'Office Visit', from: '01-01-2025', to: '01-02-2025', req: 4, appr: 0, denied: 0, initial: 'Approved', director: '' }
      ],
      recommendation: 'Approved'
    },
    {
      memberId: '123456788',
      firstName: 'Henry',
      lastName: 'Garcia',
      authNumber: '1209TZBSX',
      authType: 'Hospitalization',
      facility: 'Clinic',
      networkStatus: 'Non-Par',
      dueDate: '08/03/2025 12:00 PM',
      priority: 'Medium',
      serviceLines: [
        { code: '99214', desc: 'Consultation Visit', from: '01-01-2025', to: '01-05-2025', req: 2, appr: 0, denied: 2, initial: 'Denied', director: '' }
      ],
      recommendation: 'Denied'
    }
  ];

  selectedIndex: number | null = null;

  get selectedAuth() {
    return this.selectedIndex !== null ? this.auths[this.selectedIndex] : null;
  }

  onReviewClick(index: number) {
    this.selectedIndex = index;
  }

  onNext() {
    if (this.selectedIndex !== null && this.selectedIndex < this.auths.length - 1) {
      this.selectedIndex++;
    }
  }

  onPrevious() {
    if (this.selectedIndex !== null && this.selectedIndex > 0) {
      this.selectedIndex--;
    }
  }

  isSelected(index: number) {
    return this.selectedIndex === index;
  }

  closeReview() {
    this.selectedIndex = null;
  }

  searchText: string = '';

  filteredAuths(): any[] {
    if (!this.searchText) return this.auths;
    const lower = this.searchText.toLowerCase();
    return this.auths.filter(auth =>
      (auth.firstName + ' ' + auth.lastName).toLowerCase().includes(lower) ||
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
    'status'
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

}
