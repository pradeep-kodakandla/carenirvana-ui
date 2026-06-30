import { Component, ViewChild, OnInit, AfterViewInit, EventEmitter, Output, } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { FormBuilder, FormGroup } from '@angular/forms';
import { DashboardServiceService } from 'src/app/service/dashboard.service.service';
import { HeaderService } from 'src/app/service/header.service';
import { Observable, of } from 'rxjs';

/**
 * One configurable table column.
 * `key` MUST match the matColumnDef name in the template.
 */
interface ColumnDef {
  key: string;
  label: string;     // human-readable header, also shown in the column chooser
  locked?: boolean;  // locked columns are always visible and cannot be toggled
  visible: boolean;  // current on/off state (restored from storage)
}

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

  /** 'open' shows only Open-status auths (default); 'all' shows everything */
  statusViewFilter: 'open' | 'all' = 'open';

  // ============================================================
  // Column configuration (settings gear / column chooser)
  // ============================================================
  // Master catalog of every DATA column the table CAN show, in display order.
  //   - locked  -> always visible, user cannot hide it
  //   - visible -> current on/off state (also restored from storage)
  allColumns: ColumnDef[] = [
    { key: 'memberId',        label: 'Member',           locked: true, visible: true  },
    { key: 'authNumber',      label: 'Auth #',                         visible: true  },
    { key: 'authType',        label: 'Auth Type',                      visible: true  },
    { key: 'authClass',       label: 'Auth Class',                     visible: false },
    { key: 'authDueDate',     label: 'Auth Due Date',                  visible: true  },
    { key: 'nextReviewDate',  label: 'Next Review Date',               visible: true  },
    { key: 'treatmentType',   label: 'Treatment Type',                 visible: true  },
    { key: 'priority',        label: 'Priority',                       visible: true  },
    { key: 'authStatusValue', label: 'Status',                         visible: true  },
    { key: 'createdOn',       label: 'Created On',                     visible: false },
    { key: 'createdUser',     label: 'Created By',                     visible: false },
    { key: 'updatedOn',       label: 'Updated On',                     visible: false },
    { key: 'updatedUser',     label: 'Updated By',                     visible: false },
    { key: 'actions',         label: 'Actions',          locked: true, visible: true  },
  ];

  // Derived list bound to <table mat-table>. Rebuilt on every change.
  displayedColumns: string[] = [];

  // Snapshot of out-of-the-box visibility, used by "Reset to default".
  private columnDefaults: Record<string, boolean> = {};

  // Column chooser popover open/closed.
  showColumnSettings = false;

  // localStorage key for persisting the user's column layout.
  private readonly COL_PREF_KEY = 'assignedauths.columnPrefs.v1';

  // ============================================================
  // Column resize (drag-from-header)
  // ============================================================
  // Default widths in px. The user's drags override these at runtime.
  columnWidths: Record<string, number> = {
    memberId: 200,
    authNumber: 130,
    authType: 160,
    authDueDate: 150,
    nextReviewDate: 180,
    treatmentType: 150,
    priority: 130,
    authStatusValue: 110,
    actions: 70,
    // optional columns
    authClass: 130,
    createdOn: 160,
    createdUser: 130,
    updatedOn: 160,
    updatedUser: 130
  };
  private readonly minColumnWidth = 60;
  private resizing: { col: string; startX: number; startWidth: number } | null = null;
  private resizeMoveHandler?: (e: MouseEvent) => void;
  private resizeUpHandler?: (e: MouseEvent) => void;

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

    // Build the column set: snapshot defaults, restore any saved layout.
    this.initColumns();
  }

  ngAfterViewInit(): void {
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;

    // Map each column id -> the real value to sort by. Without this,
    // MatTableDataSource would look up row[columnId], which doesn't exist
    // for 'memberId' (shows memberName), 'authType' (templateName), the
    // computed date columns, etc., so those headers would do nothing.
    this.dataSource.sortingDataAccessor = (row: any, property: string): string | number => {
      switch (property) {
        case 'memberId':
          return (row?.memberName ?? row?.MemberName ?? '').toString().toLowerCase();
        case 'authNumber':
          return (row?.authNumber ?? row?.AuthNumber ?? '').toString().toLowerCase();
        case 'authType':
          return (row?.templateName ?? row?.TemplateName ?? '').toString().toLowerCase();
        case 'authClass':
          return (row?.authClassValue ?? row?.AuthClassValue ?? '').toString().toLowerCase();
        case 'authDueDate': {
          const d = this.getComputedAuthDueDate(row);
          return d ? d.getTime() : 0;
        }
        case 'nextReviewDate': {
          const d = this.getComputedNextReviewDate(row);
          return d ? d.getTime() : 0;
        }
        case 'treatmentType':
          return (row?.treatmentTypeValue ?? row?.treatmentType ?? '').toString().toLowerCase();
        case 'priority':
          return (row?.requestPriorityValue ?? row?.authPriority ?? '').toString().toLowerCase();
        case 'authStatusValue':
          return (row?.authStatusValue ?? row?.authStatus ?? '').toString().toLowerCase();
        case 'createdOn': {
          const d = this.toDate(row?.createdOn ?? row?.CreatedOn);
          return d ? d.getTime() : 0;
        }
        case 'createdUser':
          return (row?.createdUser ?? row?.createdBy ?? '').toString().toLowerCase();
        case 'updatedOn': {
          const d = this.toDate(row?.updatedOn ?? row?.UpdatedOn);
          return d ? d.getTime() : 0;
        }
        case 'updatedUser':
          return (row?.updatedUser ?? row?.updatedBy ?? '').toString().toLowerCase();
        default:
          return (row?.[property] ?? '').toString().toLowerCase();
      }
    };

    // quick search across selected fields (supports both camelCase and PascalCase payloads)
    this.dataSource.filterPredicate = (row: any, filter: string) => {
      const q = (filter || '').trim().toLowerCase();
      if (!q) return true;
      const set = [
        row?.authNumber ?? row?.AuthNumber,
        row?.templateName ?? row?.TemplateName,
        row?.authStatusValue ?? row?.AuthStatusValue ?? row?.authStatus ?? row?.AuthStatus,
        row?.requestPriorityValue ?? row?.RequestPriorityValue ?? row?.authPriority ?? row?.AuthPriority,
        row?.memberName ?? row?.MemberName,
        (row?.memberId ?? row?.MemberId)?.toString(),
        row?.treatmentTypeValue ?? row?.TreatmentTypeValue ?? row?.treatmentType ?? row?.TreatmentType
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

  /** Top bar buttons */
  toggleFilters(): void { this.showFilters = !this.showFilters; }

  /** Open / All status view toggle */
  setStatusFilter(val: 'open' | 'all'): void {
    this.statusViewFilter = val;
    this.recomputeAll();
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
    // Step 1: apply the Open / All status view filter first
    let base = this.getStatusFilteredData();

    // Step 2: recount chips on the status-filtered set (using same date logic as the filter)
    this.computeDueCounts(base);

    // Step 3: due-date chip filter
    if (this.selectedDue && this.selectedDue.size > 0) {
      const today = new Date();

      base = base.filter(r => {
        const d = this.toDate(this.getComputedAuthDueDate(r));
        if (!d) return false;

        const cmp = this.compareDateOnly(d, today); // <0 overdue, 0 today, >0 future

        let match = false;
        if (this.selectedDue.has('OVERDUE') && cmp < 0) match = true;
        if (this.selectedDue.has('TODAY') && cmp === 0) match = true;
        if (this.selectedDue.has('FUTURE') && cmp > 0) match = true;

        return match;
      });
    }

    // Advanced filters
    const f = this.filtersForm.value;

    if (f.authType) {
      const q = ('' + f.authType).toLowerCase();
      base = base.filter(r => (r?.templateName ?? r?.TemplateName ?? '').toString().toLowerCase().includes(q));
    }

    if (f.treatmentType) {
      const q = ('' + f.treatmentType).toLowerCase();
      base = base.filter(r => (r?.treatmentTypeValue ?? r?.TreatmentTypeValue ?? r?.treatmentType ?? r?.TreatmentType ?? '')
        .toString().toLowerCase().includes(q));
    }

    if (f.authPriority) {
      const q = ('' + f.authPriority).toLowerCase();
      base = base.filter(r => (r?.requestPriorityValue ?? r?.RequestPriorityValue ?? r?.authPriority ?? r?.AuthPriority ?? '')
        .toString().toLowerCase().includes(q));
    }

    if (f.authStatus) {
      const q = ('' + f.authStatus).toLowerCase();
      base = base.filter(r => (r?.authStatusValue ?? r?.AuthStatusValue ?? r?.authStatus ?? r?.AuthStatus ?? '')
        .toString().toLowerCase().includes(q));
    }

    // CreatedOn range
    if (f.createdFrom || f.createdTo) {
      const from = f.createdFrom ? this.startOfDay(this.toDate(f.createdFrom)) : null;
      const to = f.createdTo ? this.endOfDay(this.toDate(f.createdTo)) : null;
      base = base.filter(r => {
        const dt = this.toDate(r?.createdOn ?? r?.CreatedOn);
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
        const dt = this.toDate(r?.authDueDate ?? r?.AuthDueDate);
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

  /** Returns the subset of rawData that matches the current statusViewFilter. */
  private getStatusFilteredData(): any[] {
    if (this.statusViewFilter === 'all') return [...this.rawData];
    return this.rawData.filter(r => {
      const status = (
        r?.AuthStatusValue ?? r?.authStatusValue ??
        r?.AuthStatus ?? r?.authStatus ?? ''
      ).toString().trim().toLowerCase();
      return status === 'open' || status === 'reopen' || status === 'reopened';
    });
  }

  /** Counts for the due-date chips — operates on the already status-filtered set
   *  and uses the same getComputedAuthDueDate() logic as the row filter. */
  private computeDueCounts(statusFilteredBase: any[]): void {
    const today = new Date();
    const counts = statusFilteredBase.reduce((acc, r) => {
      const d = this.toDate(this.getComputedAuthDueDate(r));
      if (!d) return acc;
      const cmp = this.compareDateOnly(d, today);
      if (cmp < 0) acc.overdue++;
      else if (cmp === 0) acc.today++;
      else acc.future++;
      return acc;
    }, { overdue: 0, today: 0, future: 0 });

    this.overdueCount  = counts.overdue;
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
    this.panelSubtitle = (row?.MemberName ?? row?.memberName ?? '').toString() + (' (ID: ' + row?.memberId + ')') + (' (Auth #: ' + row?.authNumber + ')');
    this.showNotesPanel = true;
  }


  openDocuments(row: any, mode: 'add' | 'full' = 'add'): void {
    this.selectedRow = row ?? null;
    this.selectedPanel = 'documents';
    this.selectedActionLabel = mode === 'full' ? 'Documents' : 'Add Documents';
    this.panelSubtitle = (row?.MemberName ?? row?.memberName ?? '').toString() + (' (ID: ' + row?.memberId + ')') + (' (Auth #: ' + row?.authNumber + ')');

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
    this.panelSubtitle = (row?.MemberName ?? row?.memberName ?? '').toString() + (' (ID: ' + row?.memberId + ')') + (' (Auth #: ' + row?.authNumber + ')');
    //member?.firstName + ' ' + member?.lastName + (' (ID: ' + memberId + ')');
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

  public isExpedited(row: any): boolean {
    const v =
      row?.requestPriorityValue ?? row?.authPriority ??
      row?.RequestPriorityValue ?? row?.AuthPriority;
    const s = (v ?? '').toString().trim();
    return s !== '-' && s.toLowerCase().startsWith('exped'); // handles "Expedited", "EXPEDITED"
  }

  openAuthSummary(row: any): void {
    this.selectedRow = row ?? null;
    this.selectedPanel = 'authSummary';
    this.selectedActionLabel = 'Auth Summary';
    this.panelSubtitle =
      (row?.MemberName ?? row?.memberName ?? '').toString() +
      ' (ID: ' + (row?.memberId ?? '') + ')' +
      ' (Auth #: ' + (row?.authNumber ?? '') + ')';

    this.selectedAuthDetailId = this.extractAuthDetailId(row);
    this.selectedAuthNumber = (row?.AuthNumber ?? row?.authNumber ?? null)
      ? String(row?.AuthNumber ?? row?.authNumber)
      : null;
    this.selectedAuthTemplateId = (row?.authtemplateId ?? row?.templateId ?? null)
      ? Number(row?.authtemplateId ?? row?.templateId)
      : null;

    this.showNotesPanel = true;
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

  /** Recompute displayedColumns from the catalog (keeps master order). */
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
  }

  /** Restore the original out-of-the-box column layout. */
  resetColumns(): void {
    this.allColumns.forEach(c => (c.visible = this.columnDefaults[c.key]));
    this.rebuildDisplayedColumns();
    this.persistColumnPrefs();
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
  // Column resize handlers (drag the divider on a header's right edge)
  // ============================================================

  /** Called from each header cell's drag-handle (mousedown). */
  onResizeStart(event: MouseEvent, column: string): void {
    event.preventDefault();
    event.stopPropagation(); // don't trigger the column sort
    this.resizing = {
      col: column,
      startX: event.clientX,
      startWidth: this.columnWidths[column] ?? 120
    };
    document.body.classList.add('mc-resizing');

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
    document.body.classList.remove('mc-resizing');
    if (this.resizeMoveHandler) document.removeEventListener('mousemove', this.resizeMoveHandler);
    if (this.resizeUpHandler) document.removeEventListener('mouseup', this.resizeUpHandler);
    this.resizeMoveHandler = undefined;
    this.resizeUpHandler = undefined;
  }

}
