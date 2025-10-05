import { Component, ViewChild, OnInit, AfterViewInit, EventEmitter, Output, } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { FormBuilder, FormGroup } from '@angular/forms';
import { DashboardServiceService } from 'src/app/service/dashboard.service.service';
import { HeaderService } from 'src/app/service/header.service';
import { MemberService } from 'src/app/service/shared-member.service';
import { Observable, of } from 'rxjs';

@Component({
  selector: 'app-assignedauths',
  templateUrl: './assignedauths.component.html',
  styleUrls: ['./assignedauths.component.css']
})
export class AssignedauthsComponent implements OnInit, AfterViewInit {

  // Column ids (keep your existing column ids the same)
  displayedColumns: string[] = [
    'actions',
    'memberId',
    'authNumber',
    'authType',
    'authDueDate',
    'nextReviewDate',
    'treatmentType',
    'priority',
    'authStatusValue'
  ];

  dataSource = new MatTableDataSource<any>([]);
  rawData: any[] = [];
  filteredBase: any[] = [];

  // chips & search
  dueChip: 'OVERDUE' | 'TODAY' | 'FUTURE' | null = null;
  overdueCount = 0;
  dueTodayCount = 0;
  dueFutureCount = 0;

  quickSearchTerm = '';

  // filters
  showFilters = false;
  filtersForm!: FormGroup;

  // expand row placeholder
  expandedElement: any | null = null;

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private assignedAuthsService: DashboardServiceService,
    private headerService: HeaderService,
    private memberService: MemberService,
    private route: ActivatedRoute
  ) { }

  ngOnInit(): void {
    this.filtersForm = this.fb.group({
      authType: [''],             // TemplateName
      treatmentType: [''],        // TreatmentTypeValue || TreatmentType
      authPriority: [''],         // RequestPriorityValue || AuthPriority
      authStatus: [''],           // AuthStatusValue || AuthStatus
      serviceFromDate: [null],    // (reserved)
      serviceToDate: [null],      // (reserved)
      createdFrom: [null],        // CreatedOn range
      createdTo: [null],
      provider: [''],             // (reserved)
      providerSpecialty: [''],    // (reserved)
      authDueFrom: [null],        // AuthDueDate range
      authDueTo: [null],
    });

    this.loadData();
  }

  ngAfterViewInit(): void {
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;

    // quick search across selected PascalCase fields
    this.dataSource.filterPredicate = (row: any, filter: string) => {
      const q = (filter || '').trim().toLowerCase();
      if (!q) return true;
      const set = [
        row?.AuthNumber,
        row?.TemplateName,
        row?.AuthStatusValue ?? row?.AuthStatus,
        row?.RequestPriorityValue ?? row?.AuthPriority,
        row?.MemberName,
        row?.MemberId?.toString(),
        row?.TreatmentTypeValue ?? row?.TreatmentType
      ];
      return set.some(v => (v ?? '').toString().toLowerCase().includes(q));
    };
  }

  /** Replace with your real service call (kept AS-IS) */
  private getAuthDetails$(): Observable<any[]> {
    // Example stub; wire your existing service here:
    return this.assignedAuthsService.getauthdetails(sessionStorage.getItem('loggedInUserid'));
    // return of([]);
  }

  private loadData(): void {
    this.getAuthDetails$().subscribe({
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

  /** UI: member click */
  //onMemberClick(memberId: number, _memberName?: string): void {
  //  this.router.navigate(['/member', memberId]);
  //}

  onMemberClick(memberId: string, memberName: string, memberDetailsId: string): void {
    const tabLabel = `Member: ${memberName}`;
    const tabRoute = `/member-info/${memberId}`;
    console.log('Member Clicked:', memberId, memberName, memberDetailsId);
    const existingTab = this.headerService.getTabs().find(tab => tab.route === tabRoute);

    if (existingTab) {
      this.headerService.selectTab(tabRoute);
      const mdId = existingTab.memberDetailsId ?? null;
      if (mdId) sessionStorage.setItem('selectedMemberDetailsId', mdId);
      this.router.navigateByUrl('/', { skipLocationChange: true }).then(() => {
        this.router.navigate([tabRoute]);
      });
    } else {
      this.headerService.addTab(tabLabel, tabRoute, memberId);
      sessionStorage.setItem('selectedMemberDetailsId', memberDetailsId);
      this.router.navigateByUrl('/', { skipLocationChange: true }).then(() => {
        this.router.navigate([tabRoute]);
      });
    }
  }

  /** Top bar buttons */
  toggleFilters(): void { this.showFilters = !this.showFilters; }

  resetFilters(): void {
    this.filtersForm.reset({
      authType: '',
      treatmentType: '',
      authPriority: '',
      authStatus: '',
      serviceFromDate: null,
      serviceToDate: null,
      createdFrom: null,
      createdTo: null,
      provider: '',
      providerSpecialty: '',
      authDueFrom: null,
      authDueTo: null,
    });
    this.recomputeAll();
  }

  applyAdvancedFilters(): void { this.recomputeAll(); }

  /** Quick search */
  onQuickSearch(evt: Event): void {
    const v = (evt.target as HTMLInputElement).value ?? '';
    this.quickSearchTerm = v.trim().toLowerCase();
    this.recomputeAll();
  }

  /** Chips */
  setDueChip(which: 'OVERDUE' | 'TODAY' | 'FUTURE'): void {
    this.dueChip = which;
    this.recomputeAll();
  }

  /** ===== Recompute pipeline ===== */
  private recomputeAll(): void {
    this.computeDueCounts();

    let base = [...this.rawData];

    // Chip filter on AuthDueDate
    if (this.dueChip) {
      base = base.filter(r => {
        const d = this.toDate(r?.AuthDueDate);
        if (!d) return false;
        const cmp = this.compareDateOnly(d, new Date());
        if (this.dueChip === 'OVERDUE') return cmp < 0;
        if (this.dueChip === 'TODAY') return cmp === 0;
        return cmp > 0; // FUTURE
      });
    }

    // Advanced filters
    const f = this.filtersForm.value;

    if (f.authType) {
      const q = ('' + f.authType).toLowerCase();
      base = base.filter(r => (r?.TemplateName ?? '').toString().toLowerCase().includes(q));
    }

    if (f.treatmentType) {
      const q = ('' + f.treatmentType).toLowerCase();
      base = base.filter(r => (r?.TreatmentTypeValue ?? r?.TreatmentType ?? '')
        .toString().toLowerCase().includes(q));
    }

    if (f.authPriority) {
      const q = ('' + f.authPriority).toLowerCase();
      base = base.filter(r => (r?.RequestPriorityValue ?? r?.AuthPriority ?? '')
        .toString().toLowerCase().includes(q));
    }

    if (f.authStatus) {
      const q = ('' + f.authStatus).toLowerCase();
      base = base.filter(r => (r?.AuthStatusValue ?? r?.AuthStatus ?? '')
        .toString().toLowerCase().includes(q));
    }

    // CreatedOn range
    if (f.createdFrom || f.createdTo) {
      const from = f.createdFrom ? this.startOfDay(this.toDate(f.createdFrom)) : null;
      const to = f.createdTo ? this.endOfDay(this.toDate(f.createdTo)) : null;
      base = base.filter(r => {
        const dt = this.toDate(r?.CreatedOn);
        if (!dt) return false;
        if (from && dt < from) return false;
        if (to && dt > to) return false;
        return true;
      });
    }

    // AuthDueDate range
    if (f.authDueFrom || f.authDueTo) {
      const from = f.authDueFrom ? this.startOfDay(this.toDate(f.authDueFrom)) : null;
      const to = f.authDueTo ? this.endOfDay(this.toDate(f.authDueTo)) : null;
      base = base.filter(r => {
        const dt = this.toDate(r?.AuthDueDate);
        if (!dt) return false;
        if (from && dt < from) return false;
        if (to && dt > to) return false;
        return true;
      });
    }

    // Provider / specialty no-ops until payload includes them

    // Quick search
    this.dataSource.data = base;
    this.dataSource.filter = this.quickSearchTerm;

    if (this.paginator) this.paginator.firstPage();
  }

  /** Counts for chips on the full raw set */
  private computeDueCounts(): void {
    const today = new Date();
    const counts = this.rawData.reduce((acc, r) => {
      const d = this.toDate(r?.AuthDueDate);
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

  /** ===== Date helpers ===== */
  private toDate(v: any): Date | null {
    if (!v) return null;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }

  private startOfDay(d: Date | null): Date | null {
    if (!d) return null;
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  private endOfDay(d: Date | null): Date | null {
    if (!d) return null;
    const x = new Date(d);
    x.setHours(23, 59, 59, 999);
    return x;
  }

  /** Compare only by calendar date */
  private compareDateOnly(a: Date, b: Date): number {
    const aa = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
    const bb = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
    return aa === bb ? 0 : (aa < bb ? -1 : 1);
  }

  /** ===== Template helpers ===== */
  getDueDateClass(dateVal: any): string {
    const d = this.toDate(dateVal);
    if (!d) return 'due-unknown';
    const cmp = this.compareDateOnly(d, new Date());
    if (cmp < 0) return 'due-red';     // overdue
    if (cmp === 0) return 'due-amber'; // today
    return 'due-green';                // future
  }

  getDaysLeftLabel(dateVal: any): string {
    const d = this.toDate(dateVal);
    if (!d) return '';
    const today = new Date();
    const oneDay = 24 * 60 * 60 * 1000;

    const d0 = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();

    const diffDays = Math.round((d0 - t0) / oneDay);
    if (diffDays < 0) return `Overdue by ${Math.abs(diffDays)}d`;
    if (diffDays === 0) return 'Due today';
    return `In ${diffDays}d`;
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
}
