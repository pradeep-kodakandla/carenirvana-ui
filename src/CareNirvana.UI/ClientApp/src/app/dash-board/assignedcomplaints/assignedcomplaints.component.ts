import { AfterViewInit, Component, EventEmitter, OnInit, Output, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, FormGroup } from '@angular/forms';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
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
}

@Component({
  selector: 'app-assignedcomplaints',
  templateUrl: './assignedcomplaints.component.html',
  styleUrls: ['./assignedcomplaints.component.css']
})
export class AssignedcomplaintsComponent implements OnInit, AfterViewInit {
  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;

  @Output() addClicked = new EventEmitter<string>();

  displayedColumns: string[] = [
    'memberId',
    'caseNumber',
    'caseType',
    'receivedDateTime',
    'priority',
    'status',
    'createdOn',
    'actions'
  ];

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
        console.log('Fetched AG cases:', this.rawData);
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

    // quick search across selected fields
    this.dataSource.filterPredicate = (row: AgCaseGridRow, filter: string) => {
      const q = (filter || '').trim().toLowerCase();
      if (!q) return true;

      const set = [
        row?.caseNumber,
        row?.caseTypeText ?? row?.caseType,
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
    console.log('Fetching AG cases for user ID:', userId);

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
      this.headerService.addTab(tabLabel, tabRoute, String(memberId));
      if (memberDetailsId != null) sessionStorage.setItem('selectedMemberDetailsId', String(memberDetailsId));
      this.router.navigateByUrl('/', { skipLocationChange: true }).then(() => {
        this.router.navigate([tabRoute]);
      });
    }
  }

  onCaseClick(caseNumber: string = '', memId: string = '', memberDetailsId: any = null): void {
    this.addClicked.emit(caseNumber);

    if (!caseNumber) return;

    const memberId = memId ?? String(this.route.parent?.snapshot.paramMap.get('id') ?? '');

    // TODO: adjust this route to your actual complaint/case details route
    const tabRoute = `/member-info/${memberId}/ag-case/${caseNumber}`;
    const tabLabel = `Case ${caseNumber}`;

    const existingTab = this.headerService.getTabs().find(t => t.route === tabRoute);

    if (existingTab) {
      this.headerService.selectTab(tabRoute);
      const mdId = existingTab.memberDetailsId ?? null;
      if (mdId) sessionStorage.setItem('selectedMemberDetailsId', mdId);

    } else {
      this.headerService.addTab(tabLabel, tabRoute, String(memberId));
      if (memberDetailsId != null) sessionStorage.setItem('selectedMemberDetailsId', String(memberDetailsId));
    }

    this.router.navigateByUrl('/', { skipLocationChange: true }).then(() => {
      this.router.navigate([tabRoute]);
    });
  }

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
    this.panelSubtitle = this.selectedCaseNumber ? `Case #${this.selectedCaseNumber}` : '';
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
    this.panelSubtitle = this.selectedCaseNumber ? `Case #${this.selectedCaseNumber}` : '';
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
    this.panelSubtitle = this.selectedCaseNumber ? `Case #${this.selectedCaseNumber}` : '';
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

  // OPTIONAL: Update your existing getActionLabel() switch to include documents if you want consistent titles
  // (keep your current cases, just add:)
  //
  // case 'documents': return 'Documents';


}
