import { AfterViewInit, Component, EventEmitter, OnInit, Output, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, FormGroup } from '@angular/forms';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTable, MatTableDataSource } from '@angular/material/table';
import { Observable, of } from 'rxjs';

import { DashboardServiceService } from 'src/app/service/dashboard.service.service';
import { HeaderService } from 'src/app/service/header.service';

/**
 * Matches the API shape returned by your AG case query.
 * If you already have this model elsewhere, replace this interface import accordingly.
 */
export interface AgCaseGridRow {
  caseNumber?: string | null;
  memberDetailId?: number | string | null;

  caseType?: string | null;
  caseTypeText?: string | null;

  memberName?: string | null;
  memberId?: string | null;

  createdByUserName?: string | null;
  createdBy?: number | string | null;
  createdOn?: string | Date | null;

  caseLevelId?: number | null;
  levelId?: number | null;

  casePriority?: string | null;
  casePriorityText?: string | null;

  receivedDateTime?: string | Date | null;

  caseStatusId?: string | null;
  caseStatusText?: string | null;

  lastDetailOn?: string | Date | null;

  // --- additional optional fields used by the configurable columns ---
  caseHeaderId?: number | string | null;
  caseDetailId?: number | string | null;
  caseTemplateId?: number | string | null;
  caseTemplateName?: string | null;
  caseCategory?: string | null;
  caseCategoryText?: string | null;
  memberDetailsId?: number | string | null;
  isWorkgroupAssigned?: boolean | null;
  isWorkgroupPending?: boolean | null;
  assignedWorkgroupWorkbasketIds?: any;
}

/**
 * One configurable table column.
 * `key` MUST match both the matColumnDef name in the template and (where
 * possible) the data field name, so MatTableDataSource sorting works.
 */
interface ColumnDef {
  key: string;
  label: string;     // human-readable header, also shown in the column chooser
  locked?: boolean;  // locked columns are always visible and cannot be toggled
  visible: boolean;  // current on/off state (restored from storage)
}

@Component({
  selector: 'app-assignedcomplaints',
  templateUrl: './assignedcomplaints.component.html',
  styleUrls: ['./assignedcomplaints.component.css']
})
export class AssignedcomplaintsComponent implements OnInit, AfterViewInit {
  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;
  @ViewChild(MatTable) table!: MatTable<any>;

  @Output() addClicked = new EventEmitter<string>();

  // ============================================================
  // Column configuration (settings gear / column chooser)
  // ============================================================
  // Master catalog of every column the table CAN show, in display order.
  //   - locked  -> always visible, user cannot hide it
  //   - visible -> current on/off state (also restored from storage)
  // `displayedColumns` is DERIVED from this list, so column order stays
  // consistent no matter what order the user toggles things on/off.
  allColumns: ColumnDef[] = [
    { key: 'memberId',         label: 'Member',        locked: true, visible: true  },
    { key: 'caseNumber',       label: 'Case #',        locked: true, visible: true  },
    { key: 'caseType',         label: 'Case Type',                   visible: true  },
    { key: 'caseCategory',     label: 'Case Category',                visible: true  },
    { key: 'caseTemplate',     label: 'Case Template',                visible: false },
    { key: 'receivedDateTime', label: 'Received',                     visible: true  },
    { key: 'priority',         label: 'Priority',                     visible: true  },
    { key: 'status',           label: 'Status',                       visible: true  },
    { key: 'caseLevel',        label: 'Case Level',                   visible: false },
    { key: 'createdBy',        label: 'Created By',                   visible: false },
    { key: 'createdOn',        label: 'Created',                      visible: true  },
    { key: 'lastDetailOn',     label: 'Last Activity',                visible: false },
    { key: 'actions',          label: 'Actions',       locked: true, visible: true  },
  ];

  // Derived list bound to <table mat-table>. Rebuilt on every change.
  displayedColumns: string[] = [];

  // Snapshot of out-of-the-box visibility, used by "Reset to default".
  private columnDefaults: Record<string, boolean> = {};

  // Column chooser popover open/closed.
  showColumnSettings = false;

  // localStorage key for persisting the user's column layout.
  private readonly COL_PREF_KEY = 'assignedcomplaints.columnPrefs.v1';

  // === Column resize (drag-from-header) ===
  // Default widths in px. Adjust to taste; user drags override these at runtime.
  columnWidths: Record<string, number> = {
    memberId: 180,
    caseNumber: 150,
    caseType: 130,
    caseCategory: 170,
    caseTemplate: 150,
    receivedDateTime: 130,
    priority: 130,
    status: 140,
    caseLevel: 110,
    createdBy: 190,
    createdOn: 130,
    lastDetailOn: 140,
    actions: 90,
  };
  private readonly minColumnWidth = 60;
  private resizing: { col: string; startX: number; startWidth: number } | null = null;
  private resizeMoveHandler?: (e: MouseEvent) => void;
  private resizeUpHandler?: (e: MouseEvent) => void;

  dataSource = new MatTableDataSource<AgCaseGridRow>([]);
  rawData: AgCaseGridRow[] = [];
  filteredBase: AgCaseGridRow[] = [];

  // quick search + filters
  quickSearchTerm = '';
  showFilters = false;

  /**
   * Due chips (multi-select)
   * NOTE: since we currently only have receivedDateTime available in the grid,
   * we treat receivedDateTime as the "due date" for these chips.
   */
  selectedDue = new Set<'TODAY' | 'OVERDUE' | 'FUTURE'>();

  dueTodayCount = 0;
  overDueCount = 0;
  dueFutureCount = 0;

  filtersForm!: FormGroup;

  expandedElement: AgCaseGridRow | null = null;

  // right panel (same pattern as mycaseload)
  showNotesPanel = false;
  selectedRow: AgCaseGridRow | null = null;
  selectedPanel: string | null = null;
  selectedActionLabel = '';
  panelSubtitle = '';


  constructor(
    private fb: FormBuilder,
    private router: Router,
    private dashboardService: DashboardServiceService,
    private headerService: HeaderService,
    private route: ActivatedRoute
  ) { }

  ngOnInit(): void {
    // Build the column set: snapshot defaults, restore any saved layout.
    this.initColumns();

    this.filtersForm = this.fb.group({
      caseNumber: [''],
      caseType: [''],
      casePriority: [''],
      caseStatus: [''],
      receivedFrom: [null],
      receivedTo: [null],
      createdFrom: [null],
      createdTo: [null],
    });

    this.getComplaintDetails$().subscribe({
      next: (rows) => {
        this.rawData = rows ?? [];
        this.recomputeAll();
      },
      error: () => {
        this.rawData = [];
        this.recomputeAll();
      }
    });
  }

  ngAfterViewInit(): void {
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;

    // Map column names -> the real value to sort by.
    // Without this, MatTableDataSource looks up row[columnName] which doesn't
    // exist for derived columns ('priority', 'status', 'caseCategory', ...),
    // so those headers would be no-ops.
    this.dataSource.sortingDataAccessor = (item: any, property: string): string | number => {
      switch (property) {
        case 'memberId':
          return (item?.memberName || item?.memberId || '').toString().toLowerCase();
        case 'caseNumber':
          return (item?.caseNumber || '').toString().toLowerCase();
        case 'caseType':
          return (item?.caseTypeText || item?.caseType || '').toString().toLowerCase();
        case 'caseCategory':
          return (item?.caseCategoryText || item?.caseCategory || '').toString().toLowerCase();
        case 'caseTemplate':
          return (item?.caseTemplateName || item?.caseTemplateId || '').toString().toLowerCase();
        case 'receivedDateTime':
          return item?.receivedDateTime ? new Date(item.receivedDateTime).getTime() : 0;
        case 'priority':
          return (item?.casePriorityText || item?.casePriority || '').toString().toLowerCase();
        case 'status':
          return (item?.caseStatusText || item?.caseStatusId || '').toString().toLowerCase();
        case 'caseLevel':
          return item?.caseLevelId != null ? Number(item.caseLevelId) : -1;
        case 'createdBy':
          return (item?.createdByUserName || item?.createdBy || '').toString().toLowerCase();
        case 'createdOn':
          return item?.createdOn ? new Date(item.createdOn).getTime() : 0;
        case 'lastDetailOn':
          return item?.lastDetailOn ? new Date(item.lastDetailOn).getTime() : 0;
        default:
          return (item as any)[property];
      }
    };

    // quick search across selected fields
    this.dataSource.filterPredicate = (row: AgCaseGridRow, filter: string) => {
      const q = (filter || '').trim().toLowerCase();
      if (!q) return true;

      const set = [
        row?.caseNumber,
        row?.caseTypeText ?? row?.caseType,
        (row as any)?.caseCategoryText ?? (row as any)?.caseCategory,
        row?.caseStatusText ?? row?.caseStatusId,
        row?.casePriorityText ?? row?.casePriority,
        row?.memberName,
        row?.memberId?.toString()
      ];

      return set.some(v => (v ?? '').toString().toLowerCase().includes(q));
    };
  }

  /** Replace with your real API call */
  private getComplaintDetails$(): Observable<AgCaseGridRow[]> {
    const userId = Number(sessionStorage.getItem('loggedInUserid') ?? 0);


    if (!userId) return of([]);

    // expects API: GET /api/dashboard/agcases/{userId}
    return this.dashboardService.getAgCasesByUser(userId);
  }

  /** Top bar buttons */
  toggleFilters(): void { this.showFilters = !this.showFilters; }

  resetFilters(): void {
    this.filtersForm.reset({
      caseNumber: '',
      caseType: '',
      casePriority: '',
      caseStatus: '',
      receivedFrom: null,
      receivedTo: null,
      createdFrom: null,
      createdTo: null,
    });
    this.recomputeAll();
  }

  applyAdvancedFilters(): void { this.recomputeAll(); }


  /** ===== Due chips ===== */
  setDueChip(kind: 'TODAY' | 'OVERDUE' | 'FUTURE'): void {
    if (this.selectedDue.has(kind)) this.selectedDue.delete(kind);
    else this.selectedDue.add(kind);

    this.recomputeAll();
  }

  isDueSelected(kind: 'TODAY' | 'OVERDUE' | 'FUTURE'): boolean {
    return this.selectedDue.has(kind);
  }


  /** Search box */
  onQuickSearch(ev: Event): void {
    const val = (ev.target as HTMLInputElement)?.value ?? '';
    this.quickSearchTerm = val;
    this.dataSource.filter = (val || '').trim().toLowerCase();
    if (this.dataSource.paginator) this.dataSource.paginator.firstPage();
  }



  private computeDueCounts(): void {
    const todayStart = this.startOfDay(new Date())!;
    const todayEnd = this.endOfDay(new Date())!;

    const counts = (this.rawData ?? []).reduce((acc, r) => {
      const dt = this.toDate(r?.receivedDateTime);
      if (!dt) return acc;

      if (dt >= todayStart && dt <= todayEnd) acc.today++;
      else if (dt < todayStart) acc.overdue++;
      else acc.future++;

      return acc;
    }, { today: 0, overdue: 0, future: 0 });

    this.dueTodayCount = counts.today;
    this.overDueCount = counts.overdue;
    this.dueFutureCount = counts.future;
  }

  /** Main recompute: advanced filters + feed table + reapply quick search */
  private recomputeAll(): void {
    let base = [...(this.rawData ?? [])];

    // update chip counts (always from rawData)
    this.computeDueCounts();

    // filter by due chips (if any selected) using receivedDateTime as due date
    if (this.selectedDue && this.selectedDue.size > 0) {
      const todayStart = this.startOfDay(new Date())!;
      const todayEnd = this.endOfDay(new Date())!;

      base = base.filter(r => {
        const dt = this.toDate(r?.receivedDateTime);
        if (!dt) return false;

        let match = false;
        if (this.selectedDue.has('TODAY') && dt >= todayStart && dt <= todayEnd) match = true;
        if (this.selectedDue.has('OVERDUE') && dt < todayStart) match = true;
        if (this.selectedDue.has('FUTURE') && dt > todayEnd) match = true;

        return match;
      });
    }


    const f = this.filtersForm?.value ?? {};

    // Case #
    if (f.caseNumber) {
      const q = ('' + f.caseNumber).toLowerCase();
      base = base.filter(r => (r?.caseNumber ?? '').toString().toLowerCase().includes(q));
    }

    // Case Type
    if (f.caseType) {
      const q = ('' + f.caseType).toLowerCase();
      base = base.filter(r => ((r?.caseTypeText ?? r?.caseType) ?? '')
        .toString().toLowerCase().includes(q));
    }

    // Priority
    if (f.casePriority) {
      const q = ('' + f.casePriority).toLowerCase();
      base = base.filter(r => ((r?.casePriorityText ?? r?.casePriority) ?? '')
        .toString().toLowerCase().includes(q));
    }

    // Status
    if (f.caseStatus) {
      const q = ('' + f.caseStatus).toLowerCase();
      base = base.filter(r => ((r?.caseStatusText ?? r?.caseStatusId) ?? '')
        .toString().toLowerCase().includes(q));
    }

    // Received date range
    if (f.receivedFrom || f.receivedTo) {
      const from = f.receivedFrom ? this.startOfDay(this.toDate(f.receivedFrom)) : null;
      const to = f.receivedTo ? this.endOfDay(this.toDate(f.receivedTo)) : null;
      base = base.filter(r => {
        const dt = this.toDate(r?.receivedDateTime);
        if (!dt) return false;
        if (from && dt < from) return false;
        if (to && dt > to) return false;
        return true;
      });
    }

    // CreatedOn range
    if (f.createdFrom || f.createdTo) {
      const from = f.createdFrom ? this.startOfDay(this.toDate(f.createdFrom)) : null;
      const to = f.createdTo ? this.endOfDay(this.toDate(f.createdTo)) : null;
      base = base.filter(r => {
        const dt = this.toDate(r?.createdOn);
        if (!dt) return false;
        if (from && dt < from) return false;
        if (to && dt > to) return false;
        return true;
      });
    }

    this.filteredBase = base;
    this.dataSource.data = base;

    // re-apply quick search term
    this.dataSource.filter = (this.quickSearchTerm || '').trim().toLowerCase();
    if (this.dataSource.paginator) this.dataSource.paginator.firstPage();
  }

  /** ===== Navigation handlers ===== */
  onMemberClick(memberId: string, memberName: string, memberDetailsId: any): void {
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
      if (memberDetailsId != null) sessionStorage.setItem('selectedMemberDetailsId', String(memberDetailsId));
      this.router.navigateByUrl('/', { skipLocationChange: true }).then(() => {
        this.router.navigate([tabRoute]);
      });
    }
  }


  onCaseClick(caseNumber: string = '', memId: string = '', memDetailsId: any = null) {

    const memberId = Number(memId) || 0;
    const memberDetailsId = memDetailsId

    const urlTree = this.router.createUrlTree(
      ['/member-info', memberId, 'case', caseNumber, 'details']
      //  { queryparams: isnew ? { mode: 'new' } : {} }
    );

    const tabRoute = this.router.serializeUrl(urlTree); // ✅ includes query params safely
    const tabLabel = `Case # ${caseNumber}`;

    const existingTab = this.headerService.getTabs().find(t => t.route === tabRoute);

    if (existingTab) {
      this.headerService.selectTab(tabRoute);
    } else {
      this.headerService.addTab(tabLabel, tabRoute, String(memberId), memberDetailsId);
    }
    // ✅ no skipLocationChange hack (this often causes weird “stuck” behavior)
    this.router.navigateByUrl(tabRoute);
  }


  //onCaseClick(caseNumber: string = '', memId: string = '', memberDetailsId: any = null): void {
  //  this.addClicked.emit(caseNumber);

  //  if (!caseNumber) return;

  //  const memberId = memId ?? String(this.route.parent?.snapshot.paramMap.get('id') ?? '');

  //  // TODO: adjust this route to your actual complaint/case details route
  //  const tabRoute = `/member-info/${memberId}/ag-case/${caseNumber}`;
  //  const tabLabel = `Case ${caseNumber}`;

  //  const existingTab = this.headerService.getTabs().find(t => t.route === tabRoute);

  //  if (existingTab) {
  //    this.headerService.selectTab(tabRoute);
  //    const mdId = existingTab.memberDetailsId ?? null;
  //    if (mdId) sessionStorage.setItem('selectedMemberDetailsId', mdId);

  //  } else {
  //    this.headerService.addTab(tabLabel, tabRoute, String(memberId));
  //    if (memberDetailsId != null) sessionStorage.setItem('selectedMemberDetailsId', String(memberDetailsId));
  //  }

  //  this.router.navigateByUrl('/', { skipLocationChange: true }).then(() => {
  //    this.router.navigate([tabRoute]);
  //  });
  //}

  /** ===== helpers ===== */
  private toDate(val: any): Date | null {
    if (!val) return null;
    if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
    const d = new Date(val);
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

  /** ===== Right side panel (design only for now) ===== */
  openPanel(panel: string, row: AgCaseGridRow): void {
    this.selectedPanel = panel;
    this.selectedRow = row ?? null;
    this.selectedActionLabel = this.getActionLabel(panel);
    this.panelSubtitle = (row?.memberName ?? row?.memberId ?? '').toString();
    this.showNotesPanel = true;
  }

  closePanel(): void {
    this.showNotesPanel = false;
    this.selectedPanel = null;
    this.selectedRow = null;
    this.selectedActionLabel = '';
    this.panelSubtitle = '';
  }

  getPanelTitle(): string {
    return this.selectedActionLabel || 'Details';
  }

  private getActionLabel(panel: string): string {
    switch ((panel || '').toLowerCase()) {
      case 'activity': return 'Add Activity';
      case 'messages': return 'Messages';
      case 'notes': return 'Add Notes';
      case 'summary': return 'Summary';
      case 'unassign': return 'Unassign';
      default: return 'Details';
    }
  }




  // Add near your other component state
  selectedCaseHeaderId: number | null = null;
  selectedCaseTemplateId: number | null = null;
  selectedCaseLevelId: number | null = null;
  selectedMemberDetailsId: number | null = null;
  selectedCaseNumber: string | null = null;

  // “dashboard embed” modes (same idea as AssignedAuths)
  notesViewMode: 'add' | 'full' = 'add';
  documentsViewMode: 'add' | 'full' = 'add';
  activityViewMode: 'add' | 'full' = 'add';

  // used to trigger editor when opening add mode
  startAddDocuments = false;

  // ---- helpers (safe extraction from row; do NOT break existing row typing)
  private toNum(v: any): number | null {
    const n = v === null || v === undefined || v === '' ? NaN : Number(v);
    return Number.isFinite(n) ? n : null;
  }

  private extractCaseHeaderId(row: any): number | null {
    return this.toNum(row?.caseHeaderId ?? row?.caseHeaderID ?? row?.caseId ?? row?.caseHeader);
  }

  private extractCaseTemplateId(row: any): number | null {
    return this.toNum(row?.caseTemplateId ?? row?.templateId ?? row?.caseTemplateID);
  }

  private extractCaseLevelId(row: any): number | null {
    return this.toNum(row?.caseLevelId ?? row?.levelId ?? row?.caseLevelID);
  }

  private extractMemberDetailsId(row: any): number | null {
    return this.toNum(row?.memberDetailsId ?? row?.memberDetailId ?? row?.memberDetailID);
  }

  // ---- OPEN PANEL APIs (called from row menu)  :contentReference[oaicite:1]{index=1}

  openActivity(row: any, mode: 'add' | 'full' = 'add'): void {
    this.selectedRow = row;
    this.selectedPanel = 'activity';
    this.showNotesPanel = true;

    this.selectedCaseNumber = row?.caseNumber ?? null;
    this.selectedCaseHeaderId = this.extractCaseHeaderId(row);
    this.selectedCaseTemplateId = this.extractCaseTemplateId(row);
    this.selectedCaseLevelId = this.extractCaseLevelId(row);
    this.selectedMemberDetailsId = this.extractMemberDetailsId(row);

    this.activityViewMode = mode;
    this.selectedActionLabel = mode === 'full' ? 'Activities' : 'Add Activity';
    this.panelSubtitle = (row?.MemberName ?? row?.memberName ?? '').toString() + (' (ID: ' + row?.memberId + ')') + (' (Case #: ' + this.selectedCaseNumber + ')');
    //this.panelSubtitle = this.selectedCaseNumber ? `Case #${this.selectedCaseNumber}` : '';
  }

  openNotes(row: any, mode: 'add' | 'full' = 'add'): void {
    this.selectedRow = row;
    this.selectedPanel = 'notes';
    this.showNotesPanel = true;

    this.selectedCaseNumber = row?.caseNumber ?? null;
    this.selectedCaseHeaderId = this.extractCaseHeaderId(row);
    this.selectedCaseTemplateId = this.extractCaseTemplateId(row);
    this.selectedCaseLevelId = this.extractCaseLevelId(row);
    this.selectedMemberDetailsId = this.extractMemberDetailsId(row);
    this.notesViewMode = mode;
    this.selectedActionLabel = mode === 'full' ? 'Notes' : 'Add Notes';
    this.panelSubtitle = (row?.MemberName ?? row?.memberName ?? '').toString() + (' (ID: ' + row?.memberId + ')') + (' (Case #: ' + this.selectedCaseNumber + ')');
  }

  openDocuments(row: any, mode: 'add' | 'full' = 'add'): void {
    this.selectedRow = row;
    this.selectedPanel = 'documents';
    this.showNotesPanel = true;

    this.selectedCaseNumber = row?.caseNumber ?? null;
    this.selectedCaseHeaderId = this.extractCaseHeaderId(row);
    this.selectedCaseTemplateId = this.extractCaseTemplateId(row);
    this.selectedCaseLevelId = this.extractCaseLevelId(row);
    this.selectedMemberDetailsId = this.extractMemberDetailsId(row);

    this.documentsViewMode = mode;
    this.startAddDocuments = mode === 'add';
    this.selectedActionLabel = mode === 'full' ? 'Documents' : 'Add Documents';
    this.panelSubtitle = (row?.MemberName ?? row?.memberName ?? '').toString() + (' (ID: ' + row?.memberId + ')') + (' (Case #: ' + this.selectedCaseNumber + ')');
  }

  // ---- callbacks from embedded components (View All / Add Only toggles)

  // CaseActivities has a "View all activities" action in embed header. :contentReference[oaicite:2]{index=2}
  onActivityViewAll(): void {
    this.activityViewMode = 'full';
    this.selectedActionLabel = 'Activities';
  }

  // CaseNotes: when in add-only, we show "view all" from component output -> switch to full
  onNotesViewAll(): void {
    this.notesViewMode = 'full';
    this.selectedActionLabel = 'Notes';
  }

  // CaseDocuments: add-only has a “View All Documents” button. :contentReference[oaicite:3]{index=3}
  onDocumentsRequestViewAll(): void {
    this.documentsViewMode = 'full';
    this.startAddDocuments = false;
    this.selectedActionLabel = 'Documents';
  }

  onDocumentsRequestAddOnly(): void {
    this.documentsViewMode = 'add';
    this.startAddDocuments = true;
    this.selectedActionLabel = 'Add Documents';
  }

  public isExpedited(row: any): boolean {
    const v =
      row?.casePriorityText ?? row?.casePriority;
    const s = (v ?? '').toString().trim();
    return s !== '-' && s.toLowerCase().startsWith('exped'); // handles "Expedited", "EXPEDITED"
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
  // Column resize handlers (drag from header edge)
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
    document.body.classList.add('ac-resizing');

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
    document.body.classList.remove('ac-resizing');
    if (this.resizeMoveHandler) document.removeEventListener('mousemove', this.resizeMoveHandler);
    if (this.resizeUpHandler) document.removeEventListener('mouseup', this.resizeUpHandler);
    this.resizeMoveHandler = undefined;
    this.resizeUpHandler = undefined;
  }

}
