import { Component, ViewChild, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { FormBuilder, FormGroup } from '@angular/forms';
import { DashboardServiceService } from 'src/app/service/dashboard.service.service';
import { HeaderService } from 'src/app/service/header.service';

type DueChip = 'OVERDUE' | 'TODAY' | 'FUTURE' | null;
export interface AuthDetailRow {
  authNumber: string;
  authStatus?: number | string | null;
  authStatusValue?: string | null;
  templateName?: string | null;         // Auth Type
  authClassValue?: string | null;
  memberId: number;

  nextReviewDate?: string | Date | null;
  authDueDate?: string | Date | null;

  createdOn?: string | Date;
  createdBy?: number;
  createdUser?: string | null;
  updatedOn?: string | Date | null;
  updatedBy?: number | null;

  treatmentType?: string | null;        // raw id/text
  treatmentTypeValue?: string | null;   // display
  authPriority?: string | null;         // raw id/text
  requestPriorityValue?: string | null; // display
  serviceFromDate?: string | Date; // if you have
  serviceToDate?: string | Date;   // if you have
  provider?: string;               // if you have
  providerSpecialty?: string;      // if you have
  memberName?: string;          // if you have
}

@Component({
  selector: 'app-assignedauths',

  templateUrl: './assignedauths.component.html',
  styleUrl: './assignedauths.component.css'
})
export class AssignedauthsComponent implements OnInit {

  filtersForm!: FormGroup;
  showFilters = false;
  dueChip: DueChip = null; // 'OVERDUE' | 'TODAY' | 'FUTURE'
  quickSearch = '';

  displayedColumns: string[] = [
    'actions',
    'memberId',
    'authNumber',
    'authType',
    'authDueDate',
    'nextReviewDate',
    'treatmentType',
    'priority',
    // 'authStatusValue' // uncomment if you want to show status
  ];

  dataSource = new MatTableDataSource<AuthDetailRow>([]);
  expandedElement: AuthDetailRow | null = null;
  allRows: AuthDetailRow[] = [];

  overdueCount = 0;
  dueTodayCount = 0;
  dueFutureCount = 0;

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;

  constructor(
    private authService: DashboardServiceService,
    private router: Router,
    private fb: FormBuilder,
    private headerService: HeaderService
  ) { }

  ngOnInit(): void {
    this.filtersForm = this.fb.group({
      authType: [''],
      treatmentType: [''],
      authPriority: [''],
      authStatus: [''],
      serviceFromDate: [null],
      serviceToDate: [null],
      createdFrom: [null],
      createdTo: [null],
      provider: [''],
      providerSpecialty: [''],
      authDueFrom: [null],
      authDueTo: [null]
    });
    this.loadData();
    this.setupFilterPredicate();
  }

  private loadData(): void {
    this.authService.getauthdetails(1).subscribe({
      next: (data: any[]) => {
        const rows = (data ?? []).map(this.normalizeRow);
        console.log('Loaded auth details', rows);
        this.dataSource.data = rows;
        this.allRows = rows;
        this.recountDueBuckets(this.allRows);
        // Hook up paginator/sort after data is set
        Promise.resolve().then(() => {
          this.dataSource.paginator = this.paginator;
          this.dataSource.sort = this.sort;
        });
      },
      error: (err) => {
        console.error('Failed to load auth details', err);
        this.dataSource.data = [];
      }
    });

    // Powerful combined filtering
    this.dataSource.filterPredicate = (row, filterJson) => {
      const f = JSON.parse(filterJson) as {
        q: string;
        authType: string;
        treatmentType: string;
        authPriority: string;
        authStatus: string;
        serviceFromDate: string | null;
        serviceToDate: string | null;
        createdFrom: string | null;
        createdTo: string | null;
        provider: string;
        providerSpecialty: string;
        authDueFrom: string | null;
        authDueTo: string | null;
        dueChip: DueChip;
      };

      // 0) Normalize dates
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const dAuthDue = row.authDueDate ? new Date(row.authDueDate) : null;
      if (dAuthDue) dAuthDue.setHours(0, 0, 0, 0);

      // 1) Due chip logic (Auth Due Date)
      if (f.dueChip) {
        if (!dAuthDue) return false;
        if (f.dueChip === 'OVERDUE' && !(dAuthDue.getTime() < today.getTime())) return false;
        if (f.dueChip === 'TODAY' && !(dAuthDue.getTime() === today.getTime())) return false;
        if (f.dueChip === 'FUTURE' && !(dAuthDue.getTime() > today.getTime())) return false;
      }

      // 2) Quick text search (auth #, member id, type, status, provider…)
      const hay = [
        row.authNumber, row.memberId?.toString(),
        row.templateName, row.treatmentTypeValue, row.treatmentType,
        row.requestPriorityValue, row.authPriority,
        row.authStatusValue, row.authStatus,
        row.provider, row.providerSpecialty
      ].filter(Boolean).join(' ').toLowerCase();
      if (f.q && !hay.includes(f.q.toLowerCase())) return false;

      // 3) Exact/contains filters
      const contains = (val: any, needle: string) =>
        !needle || (val ?? '').toString().toLowerCase().includes(needle.toLowerCase());

      if (!contains(row.templateName, f.authType)) return false;
      if (!contains(row.treatmentTypeValue ?? row.treatmentType, f.treatmentType)) return false;
      if (!contains(row.requestPriorityValue ?? row.authPriority, f.authPriority)) return false;
      if (!contains(row.authStatusValue ?? row.authStatus, f.authStatus)) return false;
      if (!contains(row.provider, f.provider)) return false;
      if (!contains(row.providerSpecialty, f.providerSpecialty)) return false;

      // 4) Date range filters
      const inRange = (d: Date | null, fromStr: string | null, toStr: string | null) => {
        if (!d) return true; // if row has no date, do not exclude on range
        const dd = new Date(d); dd.setHours(0, 0, 0, 0);
        if (fromStr) {
          const from = new Date(fromStr); from.setHours(0, 0, 0, 0);
          if (dd < from) return false;
        }
        if (toStr) {
          const to = new Date(toStr); to.setHours(0, 0, 0, 0);
          if (dd > to) return false;
        }
        return true;
      };

      // Service date range
      const dSvcFrom = row.serviceFromDate ? new Date(row.serviceFromDate) : null;
      const dSvcTo = row.serviceToDate ? new Date(row.serviceToDate) : null;
      // For services we check both ends if you store them; otherwise omit
      if (f.serviceFromDate || f.serviceToDate) {
        // if you only have one service date, just pass that one to inRange
        if (!inRange(dSvcFrom, f.serviceFromDate, f.serviceToDate)) return false;
        if (!inRange(dSvcTo, f.serviceFromDate, f.serviceToDate)) return false;
      }

      // CreatedOn range
      const dCreated = row.createdOn ? new Date(row.createdOn) : null;
      if (!inRange(dCreated, f.createdFrom, f.createdTo)) return false;

      // Auth Due range (explicit)
      if (!inRange(dAuthDue, f.authDueFrom, f.authDueTo)) return false;

      return true;
    };
  }

  // Normalize PascalCase or camelCase payloads to our interface
  private normalizeRow = (r: any): AuthDetailRow => ({
    authNumber: r.authNumber ?? r.AuthNumber ?? '',
    authStatus: r.authStatus ?? r.AuthStatus ?? null,
    authStatusValue: r.authStatusValue ?? r.AuthStatusValue ?? null,
    templateName: r.templateName ?? r.TemplateName ?? null,
    authClassValue: r.authClassValue ?? r.AuthClassValue ?? null,
    memberId: r.memberId ?? r.MemberId ?? 0,

    nextReviewDate: r.nextReviewDate ?? r.NextReviewDate ?? null,
    authDueDate: r.authDueDate ?? r.AuthDueDate ?? null,

    createdOn: r.createdOn ?? r.CreatedOn,
    createdBy: r.createdBy ?? r.CreatedBy,
    createdUser: r.createdUser ?? r.CreatedUser ?? null,
    updatedOn: r.updatedOn ?? r.UpdatedOn ?? null,
    updatedBy: r.updatedBy ?? r.UpdatedBy ?? null,

    treatmentType: r.treatmentType ?? r.TreatmentType ?? null,
    treatmentTypeValue: r.treatmentTypeValue ?? r.TreatmentTypeValue ?? null,
    authPriority: r.authPriority ?? r.AuthPriority ?? null,
    requestPriorityValue: r.requestPriorityValue ?? r.RequestPriorityValue ?? null,
    memberName: r.memberName ?? r.MemberName ?? null
  });

  private setupFilterPredicate(): void {
    this.dataSource.filterPredicate = (row: AuthDetailRow, term: string) => {
      const t = (term || '').trim().toLowerCase();
      if (!t) return true;
      return [
        row.authNumber,
        row.templateName,
        row.treatmentTypeValue,
        row.requestPriorityValue,
        row.authStatusValue,
        row.memberId?.toString(),
        this.toDateStr(row.authDueDate),
        this.toDateStr(row.nextReviewDate),
      ]
        .filter(Boolean)
        .some(v => (v + '').toLowerCase().includes(t));
    };
  }

  applyFilter(ev: Event): void {
    const value = (ev.target as HTMLInputElement)?.value ?? '';
    this.dataSource.filter = value.trim().toLowerCase();
    if (this.dataSource.paginator) this.dataSource.paginator.firstPage();
  }

  goToPage(memberId: number): void {
    if (!memberId) return;
    // Adjust route as needed to open your Authorization view
    this.router.navigate(['/member-info', memberId]);
  }

  private toDateStr(d?: string | Date | null): string {
    if (!d) return '';
    try {
      const dt = typeof d === 'string' ? new Date(d) : d;
      if (isNaN(dt as any)) return '';
      // mm/dd/yyyy
      return `${(dt.getMonth() + 1).toString().padStart(2, '0')}/` +
        `${dt.getDate().toString().padStart(2, '0')}/` +
        `${dt.getFullYear()}`;
    } catch { return ''; }
  }

  // ——— UI actions ———
  toggleFilters(): void {
    this.showFilters = !this.showFilters;
  }

  onQuickSearch(ev: Event): void {
    const val = (ev.target as HTMLInputElement).value || '';
    this.quickSearch = val;
    this.pushFilter();
  }

  setDueChip(chip: DueChip): void {

    this.dueChip = (this.dueChip === chip) ? null : chip; // toggle off if clicking again
    this.pushFilter();
  }

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
      authDueTo: null
    });
    this.dueChip = null;
    this.quickSearch = '';
    this.pushFilter();
  }

  applyAdvancedFilters(): void {
    this.pushFilter();
  }

  // Push the aggregate filter model into MatTableDataSource
  private pushFilter(): void {
    const f = this.filtersForm.value;
    const filterModel = {
      q: this.quickSearch || '',
      authType: f.authType || '',
      treatmentType: f.treatmentType || '',
      authPriority: f.authPriority || '',
      authStatus: f.authStatus || '',
      serviceFromDate: f.serviceFromDate ? new Date(f.serviceFromDate).toISOString() : null,
      serviceToDate: f.serviceToDate ? new Date(f.serviceToDate).toISOString() : null,
      createdFrom: f.createdFrom ? new Date(f.createdFrom).toISOString() : null,
      createdTo: f.createdTo ? new Date(f.createdTo).toISOString() : null,
      provider: f.provider || '',
      providerSpecialty: f.providerSpecialty || '',
      authDueFrom: f.authDueFrom ? new Date(f.authDueFrom).toISOString() : null,
      authDueTo: f.authDueTo ? new Date(f.authDueTo).toISOString() : null,
      dueChip: this.dueChip as DueChip
    };
    this.dataSource.filter = JSON.stringify(filterModel);
    if (this.dataSource.paginator) this.dataSource.paginator.firstPage();
  }

  private recountDueBuckets(rows: AuthDetailRow[]): void {
    const today = new Date(); today.setHours(0, 0, 0, 0);

    let over = 0, todayCnt = 0, future = 0;

    for (const r of rows) {
      if (!r.authDueDate) continue;
      const d = new Date(r.authDueDate);
      d.setHours(0, 0, 0, 0);

      if (d.getTime() < today.getTime()) over++;
      else if (d.getTime() === today.getTime()) todayCnt++;
      else future++;
    }

    this.overdueCount = over;
    this.dueTodayCount = todayCnt;
    this.dueFutureCount = future;
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

  getDueDateClass(dateValue: any): string {
    if (!dateValue) return '';
    const today = new Date();
    const dueDate = new Date(dateValue);

    // Normalize (ignore time part)
    today.setHours(0, 0, 0, 0);
    dueDate.setHours(0, 0, 0, 0);

    if (dueDate.getTime() < today.getTime()) {
      return 'due-red';     // overdue
    } else if (dueDate.getTime() === today.getTime()) {
      return 'due-orange';  // due today
    } else {
      return 'due-green';   // future
    }
  }

  getDaysLeftLabel(dateValue: any): string {
    if (!dateValue) return '';

    const today = new Date();
    const due = new Date(dateValue);

    // Strip time parts to avoid off-by-one issues
    today.setHours(0, 0, 0, 0);
    due.setHours(0, 0, 0, 0);

    const msPerDay = 24 * 60 * 60 * 1000;
    const diff = Math.round((due.getTime() - today.getTime()) / msPerDay); // positive = days left

    if (diff === 0) return 'Due today';
    if (diff > 0) return `${diff} day${diff === 1 ? '' : 's'} left`;
    const overdue = Math.abs(diff);
    return `${overdue} day${overdue === 1 ? '' : 's'} overdue`;
  }

}
