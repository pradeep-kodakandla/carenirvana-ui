import { Component, ViewChild, OnInit, AfterViewInit, EventEmitter, Output, } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { FormBuilder, FormGroup } from '@angular/forms';
import { DashboardServiceService } from 'src/app/service/dashboard.service.service';
import { HeaderService } from 'src/app/service/header.service';
import { Observable, of } from 'rxjs';

@Component({
  selector: 'app-assignedauths',
  templateUrl: './assignedauths.component.html',
  styleUrls: ['./assignedauths.component.css']
})
export class AssignedauthsComponent implements OnInit, AfterViewInit {

  // ===== Right panel state (required for notes panel + other actions) =====
  showNotesPanel: boolean = false;
  selectedRow: any | null = null;
  selectedPanel: string | null = null;
  selectedActionLabel: string = '';
  panelSubtitle: string = '';

  // ===== Notes integration state =====
  selectedAuthDetailId: number | null = null;
  selectedAuthNumber: string | null = null;
  selectedAuthTemplateId: number | null = null;
  notesViewMode: 'add' | 'full' = 'add';
  documentsViewMode: 'add' | 'full' = 'add';
  activityViewMode: 'add' | 'full' = 'add';
  startAddActivity: boolean = false;
  startAddDocuments: boolean = false;

  selectedDue = new Set<'OVERDUE' | 'TODAY' | 'FUTURE'>();
  // Column ids (keep your existing column ids the same)
  displayedColumns: string[] = [

    'memberId',
    'authNumber',
    'authType',
    'authDueDate',
    'nextReviewDate',
    'treatmentType',
    'priority',
    'authStatusValue',
    'actions'
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
        console.log('Assigned Auths data loaded, count=', this.rawData);
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
  setDueChip(kind: 'OVERDUE' | 'TODAY' | 'FUTURE'): void {
    //this.dueChip = which;
    if (this.selectedDue.has(kind)) {
      this.selectedDue.delete(kind);
    } else {
      this.selectedDue.add(kind);
    }
    this.recomputeAll();
  }

  isDueSelected(kind: 'OVERDUE' | 'TODAY' | 'FUTURE'): boolean {
    return this.selectedDue.has(kind);
  }

  /** ===== Recompute pipeline ===== */
  private recomputeAll(): void {
    this.computeDueCounts();

    let base = [...this.rawData];

    if (this.selectedDue && this.selectedDue.size > 0) {
      const today = new Date();

      base = base.filter(r => {
        const d = this.toDate(r?.authDueDate);
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
      // base = [];            // or show NONE (uncomment if you prefer)
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
      const d = this.toDate(r?.authDueDate);
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


  /** ========= Right panel actions ========= */
  // Template uses openPanel/getPanelTitle/closePanel (mycaseload-style). Keep existing methods and provide wrappers.
  openPanel(panel: string, row: any): void {
    const key = (panel || '').toLowerCase();

    // Notes has extra wiring (authDetailId/authNumber/etc.)
    if (key === 'notes') {
      this.openNotes(row);
      return;
    }

    this.selectedRow = row ?? null;
    this.selectedPanel = key;
    this.selectedActionLabel = this.getActionLabel(key);
    this.panelSubtitle = (row?.MemberName ?? row?.memberName ?? row?.MemberId ?? row?.memberId ?? '').toString();
    this.showNotesPanel = true;
  }


  openDocuments(row: any, mode: 'add' | 'full' = 'add'): void {
    this.selectedRow = row ?? null;
    this.selectedPanel = 'documents';
    this.selectedActionLabel = mode === 'full' ? 'Documents' : 'Add Documents';
    this.panelSubtitle = (row?.MemberName ?? row?.memberName ?? row?.MemberId ?? row?.memberId ?? '').toString();

    this.selectedAuthDetailId = this.extractAuthDetailId(row);
    this.selectedAuthNumber = (row?.AuthNumber ?? row?.authNumber ?? null) ? String(row?.AuthNumber ?? row?.authNumber) : null;
    this.selectedAuthTemplateId = (row?.authtemplateId ?? row?.templateId ?? null) ? Number(row?.authtemplateId ?? row?.templateId) : null;

    this.documentsViewMode = mode;
    this.showNotesPanel = true;
  }


  openActivity(row: any): void {
    this.selectedRow = row ?? null;
    this.selectedPanel = 'activity';
    this.selectedActionLabel = 'Add Activity';
    this.panelSubtitle = (row?.MemberName ?? row?.memberName ?? row?.MemberId ?? row?.memberId ?? '').toString();

    this.selectedAuthDetailId = this.extractAuthDetailId(row);
    this.selectedAuthNumber = (row?.AuthNumber ?? row?.authNumber ?? null) ? String(row?.AuthNumber ?? row?.authNumber) : null;
    this.selectedAuthTemplateId = (row?.authtemplateId ?? row?.templateId ?? null) ? Number(row?.authtemplateId ?? row?.templateId) : null;

    this.showNotesPanel = true;
  }



  closePanel(): void {
    this.closeRightPanel();
  }

  getPanelTitle(): string {
    // keep it simple for now; label is set by openPanel/openNotes
    return this.selectedActionLabel || 'Details';
  }

  private getActionLabel(panel: string): string {
    switch ((panel || '').toLowerCase()) {
      case 'activity': return 'Add Activity';
      case 'messages': return 'Add Documents';
      case 'unassign': return 'Unassign';
      case 'summary': return 'Summary';
      default: return 'Details';
    }
  }
  openNotes(row: any, mode: 'add' | 'full' = 'add'): void {
    this.selectedRow = row ?? null;
    this.selectedPanel = 'notes';
    this.selectedActionLabel = 'Add Notes';
    this.panelSubtitle = (row?.MemberName ?? row?.memberName ?? row?.MemberId ?? row?.memberId ?? '').toString();
    this.selectedAuthDetailId = this.extractAuthDetailId(row);
    this.selectedAuthNumber = (row?.AuthNumber ?? row?.authNumber ?? null) ? String(row?.AuthNumber ?? row?.authNumber) : null;
    this.selectedAuthTemplateId = (row?.authtemplateId ?? row?.templateId ?? null) ? Number(row?.authtemplateId ?? row?.templateId) : null;
    this.notesViewMode = mode;
    this.showNotesPanel = true;
  }

  closeRightPanel(): void {
    this.showNotesPanel = false;
    this.selectedPanel = null;
    this.selectedRow = null;
    this.selectedAuthDetailId = null;
    this.selectedAuthNumber = null;
    // this.notesViewMode = mode;
    this.selectedActionLabel = '';
    this.panelSubtitle = '';
  }

  onNotesRequestViewAll(): void {
    this.notesViewMode = 'full';
  }

  onNotesRequestAddOnly(): void {
    this.notesViewMode = 'add';
  }

  onDocumentsRequestViewAll() {
    this.documentsViewMode = 'full';
    this.startAddDocuments = false;
  }

  onDocumentsRequestAddOnly() {
    this.documentsViewMode = 'add';
    this.startAddDocuments = true;
    Promise.resolve().then(() => (this.startAddDocuments = false));
  }

  private extractAuthDetailId(row: any): number | null {
    const v = row?.AuthDetailId ?? row?.authDetailId ?? row?.authdetailid
      ?? row?.AuthDetailsId ?? row?.authDetailsId ?? row?.authdetailsid
      ?? row?.authdetailId ?? null;
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  @Output() addClicked = new EventEmitter<string>();

  onAuthClick(authNumber: string = '', memId: string = '', memberDetailsId: string) {
    this.openAuthTab(authNumber, memId, memberDetailsId, false);
  }

  private openAuthTab(authNumber: string, memId: string = '', memDetailsId: string, isNew: boolean): void {
    // this.memberService.setIsCollapse(true);
    this.addClicked.emit(authNumber);
    const memberId = memId;
    const memberDetailsId = memDetailsId;

    if (!memberId || Number.isNaN(memberId)) {
      console.error('Invalid memberId for auth tab route');
      return;
    }

    // âœ… normalize for new
    const authNo = isNew ? '0' : String(authNumber);

    // âœ… choose correct step
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
      this.headerService.selectTab(tabRoute);
    } else {
      this.headerService.addTab(tabLabel, tabRoute, String(memberId), memberDetailsId);
    }

    this.router.navigateByUrl(tabRoute);
  }

  onActivityRequestViewAll(): void {
    this.activityViewMode = 'full';
  }

  onActivityRequestAddOnly(): void {
    this.activityViewMode = 'add';
    // ensure add form opens
    this.startAddActivity = true;
    Promise.resolve().then(() => (this.startAddActivity = false));
  }

  private readonly tempDateOffsetDays = 10;

  getComputedAuthDueDate(row: any): Date | null {
    const created = this.toDate(row?.createdOn ?? row?.CreatedOn);
    if (created) {
      const d = new Date(created);
      d.setDate(d.getDate() + this.tempDateOffsetDays);
      return d;
    }
    return this.toDate(row?.authDueDate ?? row?.AuthDueDate);
  }

  getComputedNextReviewDate(row: any): Date | null {
    const created = this.toDate(row?.createdOn ?? row?.CreatedOn);
    if (created) {
      const d = new Date(created);
      d.setDate(d.getDate() + this.tempDateOffsetDays);
      return d;
    }
    return this.toDate(row?.nextReviewDate ?? row?.NextReviewDate);
  }


}
