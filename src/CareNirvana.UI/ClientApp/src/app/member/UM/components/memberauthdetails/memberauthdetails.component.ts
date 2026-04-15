import { Component, EventEmitter, Input, OnInit, Output, ViewChild, ViewEncapsulation, } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatPaginator, PageEvent } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { MatMenuTrigger } from '@angular/material/menu';
import { HeaderService } from 'src/app/service/header.service';
import { MemberService } from 'src/app/service/shared-member.service';
import { AuthDetailApiService } from 'src/app/service/authdetailapi.service';

/** Shape of each decision inside decisionStatusesJson */
export interface ParsedDecision {
  itemId: string;
  procedureNo: string;
  serviceCode: string;
  procedureDescription: string;
  decisionStatus: string;          // "Approved", "Denied", "Pending", etc.
  decisionStatusId: string;
  decisionStatusCode: string;      // "Administrative Approval", etc.
  decisionStatusCodeId: string;
  requested: string | number;
  approved: string | number;
  denied: string | number;
  decisionDateTime: string;
  decisionRequestDatetime: string;
}

export interface MemberAuthGridRow {
  authNumber: string;

  // raw ids
  authTypeId?: number | null;
  authStatus?: number | null;
  authClassId?: number | null;

  // optional "text" fields if backend/UI maps them
  authTypeText?: string | null;
  authStatusText?: string | null;

  authDueDate?: string | Date | null;
  nextReviewDate?: string | Date | null;
  treatmentType?: string | null;

  createdOn?: string | Date | null;
  createdByUserName?: string | null;

  // Closed datetime (populated when auth status is Close / Close and Adjusted)
  authClosedDatetime?: string | Date | null;
  closedDatetime?: string | Date | null;

  // Decision fields from API
  totalDecisions?: number | null;
  decisionStatusesJson?: string | null;
  overallDecisionStatus?: string | null;
  overallDecisionStatusCode?: string | null;

  // anything else coming from API
  [key: string]: any;
}

@Component({
  selector: 'app-memberauthdetails',
  templateUrl: './memberauthdetails.component.html',
  styleUrl: './memberauthdetails.component.css',
  encapsulation: ViewEncapsulation.None,
})
export class MemberauthdetailsComponent implements OnInit {
  @Input() memberId!: number;

  // keep outputs in case parent wants to react (same idea as case component)
  @Output() authClicked = new EventEmitter<string>();
  @Output() addAuthClicked = new EventEmitter<void>();

  isLoading = true;
  isEmpty = false;

  viewMode: 'card' | 'table' = 'card';
  compactMode = false;

  pageSize = 10;
  pageIndex = 0;
  pagedCardData: MemberAuthGridRow[] = [];

  /** Status filter bar state */
  activeStatusFilter: string | null = null;   // null = show all (Total)
  searchFilterValue = '';
  statusCountList: { status: string; count: number; slug: string }[] = [];

  // ════════════════════════════════════════════════
  //  RIGHT PANEL — shared open/close/expand state
  // ════════════════════════════════════════════════
  detailPanelOpen = false;
  detailPanelExpanded = false;
  selectedAuthNumber = '';

  /** Full row reference — kept so templates can fall back like assignedauths does */
  selectedRow: MemberAuthGridRow | null = null;

  /**
   * Controls which content is shown inside the right panel:
   *  'details' → app-authorization-details (opened via "View Details" / Details link)
   *  'action'  → notes / documents / activity (opened via row action menu)
   */
  panelMode: 'details' | 'action' = 'details';

  // ════════════════════════════════════════════════
  //  ACTION PANEL — state (mirrors assignedauths)
  // ════════════════════════════════════════════════
  selectedPanel: string | null = null;
  selectedActionLabel = '';
  panelSubtitle = '';
  selectedAuthDetailId: number | null = null;
  selectedAuthTemplateId: number | null = null;

  notesViewMode: 'add' | 'full' = 'add';
  documentsViewMode: 'add' | 'full' = 'add';
  activityViewMode: 'add' | 'full' = 'add';
  startAddActivity = false;
  startAddDocuments = false;

  /** Tracks which cards have their decisions expanded (by authNumber) */
  expandedDecisions = new Set<string>();

  /** Cache for parsed decision arrays (avoids re-parsing in template) */
  private parsedDecisionsCache = new Map<string, ParsedDecision[]>();

  /** Color map for dynamic status dots */
  private statusColorMap: Record<string, string> = {
    approved: '#22C55E',
    'partially-approved': '#10B981',
    partial: '#10B981',
    pending: '#8B5CF6',
    pended: '#8B5CF6',
    'in-progress': '#3B82F6',
    inprogress: '#3B82F6',
    open: '#0EA5E9',
    submitted: '#06B6D4',
    'under-review': '#6366F1',
    underreview: '#6366F1',
    denied: '#EF4444',
    cancelled: '#64748B',
    canceled: '#64748B',
    withdrawn: '#78716C',
    closed: '#6B7280',
    close: '#6B7280',
    voided: '#475569',
    void: '#475569',
    modified: '#F59E0B',
    expired: '#F43F5E',
    'on-hold': '#F97316',
    onhold: '#F97316',
  };

  displayedColumns: string[] = [
    'actions',
    'authNumber',
    'authTypeText',
    'authStatusText',
    'overallDecision',
    'authDueDate',
    'nextReviewDate',
    'treatmentType',
    'createdOn',
    'createdByUserName',
    'viewDetails',
  ];

  dataSource = new MatTableDataSource<MemberAuthGridRow>([]);

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;

  @ViewChild(MatMenuTrigger) contextMenu!: MatMenuTrigger;
  contextMenuPosition = { x: '0px', y: '0px' };

  // Permissions (same safe fallback pattern)
  permissionsMap: any = {};
  globalActionPermissions: any = {};

  constructor(
    private route: ActivatedRoute,
    private authDetailService: AuthDetailApiService,
    private headerService: HeaderService,
    private router: Router,
    private memberService: MemberService
  ) { }

  ngOnInit(): void {
    const routeMemberId = Number(this.route.parent?.snapshot.paramMap.get('id'));
    const memberId =
      Number(sessionStorage.getItem('selectedMemberDetailsId') || 0) ??
      this.memberId ??
      routeMemberId;

    // Custom filter predicate: combines text search + status filter
    this.dataSource.filterPredicate = (row: MemberAuthGridRow, filter: string) => {
      const parsed = JSON.parse(filter) as { text: string; status: string | null };

      // Status filter
      if (parsed.status) {
        const rowStatus = (row.authStatusText || '').toString().trim().toLowerCase();
        if (rowStatus !== parsed.status.toLowerCase()) {
          return false;
        }
      }

      // Text search filter
      if (parsed.text) {
        const search = parsed.text.toLowerCase();
        const haystack = Object.values(row)
          .filter(v => v !== null && v !== undefined)
          .map(v => String(v).toLowerCase())
          .join(' ');
        return haystack.includes(search);
      }

      return true;
    };

    this.loadPermissionsForAuthActions();
    this.getAuthDetails(memberId);
  }

  ngAfterViewInit() {
    if (this.viewMode === 'table') {
      this.dataSource.paginator = this.paginator;
    }
    this.dataSource.sort = this.sort;
  }

  getAuthDetails(memberId: number): void {
    this.isLoading = true;

    this.authDetailService.getByMember(memberId).subscribe({
      next: (data: MemberAuthGridRow[]) => {
        this.isLoading = false;
        console.log('Fetched auth details:', data);
        const rows = data ?? [];
        this.isEmpty = rows.length === 0;

        // Pre-parse decisionStatusesJson for all rows
        this.parsedDecisionsCache.clear();
        for (const row of rows) {
          if (row.decisionStatusesJson) {
            this.parsedDecisionsCache.set(row.authNumber, this.parseDecisionJson(row.decisionStatusesJson));
          }
        }

        this.dataSource.data = rows;
        this.pageIndex = 0;
        this.activeStatusFilter = null;
        this.searchFilterValue = '';
        this.buildStatusCounts();
        this.applyFilters();
      },
      error: (err: any) => {
        console.error('Error fetching auth details:', err);
        this.isLoading = false;
        this.isEmpty = true;
        this.dataSource.data = [];
        this.statusCountList = [];
        this.parsedDecisionsCache.clear();
        this.applyFilters();
      },
    });
  }

  applyFilter(event: Event) {
    this.searchFilterValue = ((event.target as HTMLInputElement).value ?? '').trim().toLowerCase();
    this.pageIndex = 0;
    this.applyFilters();
  }

  clearSearch(): void {
    this.searchFilterValue = '';
    this.pageIndex = 0;
    this.applyFilters();
  }

  /** Apply combined text + status filter to dataSource */
  private applyFilters(): void {
    const filterObj = JSON.stringify({
      text: this.searchFilterValue,
      status: this.activeStatusFilter,
    });
    this.dataSource.filter = filterObj;
    this.pageIndex = 0;
    this.isEmpty = this.dataSource.filteredData.length === 0 && !this.isLoading;
    this.updatePagedCardData();
  }

  toggleViewMode(): void {
    this.viewMode = this.viewMode === 'card' ? 'table' : 'card';
    this.pageIndex = 0;

    if (this.viewMode === 'card') {
      this.updatePagedCardData();
    } else {
      this.dataSource.paginator = this.paginator;
    }
  }

  toggleCompactMode(): void {
    this.compactMode = !this.compactMode;
  }

  onPageChange(event: PageEvent): void {
    this.pageSize = event.pageSize;
    this.pageIndex = event.pageIndex;

    if (this.viewMode === 'card') {
      this.updatePagedCardData();
    } else {
      this.dataSource.paginator = this.paginator;
    }
  }

  updatePagedCardData(): void {
    const start = this.pageIndex * this.pageSize;
    const end = start + this.pageSize;
    this.pagedCardData = this.dataSource.filteredData.slice(start, end);
  }

  // ════════════════════════════════════════════════
  //  RIGHT PANEL — Open / Close / Expand / Switch
  // ════════════════════════════════════════════════

  /** Opens the panel in "details" mode (View Details link / Details button) */
  openDetailPanel(authNumber: string): void {
    // Toggle off if same auth + already in details mode
    if (this.detailPanelOpen && this.selectedAuthNumber === authNumber && this.panelMode === 'details') {
      this.closeDetailPanel();
      return;
    }

    this.selectedAuthNumber = authNumber;
    this.panelMode = 'details';
    this.selectedPanel = null;
    this.detailPanelOpen = true;
    this.detailPanelExpanded = true;
  }

  /** Switches an already-open action panel back to details view for the same auth */
  switchToDetailsPanel(): void {
    this.panelMode = 'details';
    this.selectedPanel = null;
    this.selectedActionLabel = '';
    this.panelSubtitle = '';
  }

  closeDetailPanel(): void {
    this.detailPanelOpen = false;
    this.detailPanelExpanded = false;
    this.panelMode = 'details';
    this.selectedPanel = null;
    this.selectedActionLabel = '';
    this.panelSubtitle = '';
    this.selectedAuthDetailId = null;
    this.selectedAuthTemplateId = null;
    this.selectedRow = null;

    setTimeout(() => {
      if (!this.detailPanelOpen) {
        this.selectedAuthNumber = '';
      }
    }, 350);
  }

  toggleDetailPanelExpand(): void {
    this.detailPanelExpanded = !this.detailPanelExpanded;
  }

  // ════════════════════════════════════════════════
  //  ACTION PANEL — Open helpers (menu actions)
  // ════════════════════════════════════════════════

  openActivity(row: MemberAuthGridRow): void {
    this.selectedRow = row ?? null;
    this.selectedPanel = 'activity';
    this.panelMode = 'action';
    this.selectedActionLabel = 'Add Activity';

    this.selectedAuthDetailId = Number(row?.authDetailId ?? 0);
    this.selectedAuthNumber = String(row?.AuthNumber ?? row?.authNumber ?? '');
    this.selectedAuthTemplateId = Number(row?.authTypeId ?? row?.AuthTypeId ?? row?.authTypeid ?? 0);
    this.activityViewMode = 'add';
    this.startAddActivity = false;
    this.panelSubtitle = 'Auth # ' + this.selectedAuthNumber;

    this.detailPanelOpen = true;
    this.detailPanelExpanded = true;

    console.log('[MAD] openActivity – row:', row,
      'authDetailId:', this.selectedAuthDetailId,
      'authNumber:', this.selectedAuthNumber);
  }

  openNotes(row: MemberAuthGridRow, mode: 'add' | 'full' = 'add'): void {
    this.selectedRow = row ?? null;
    this.selectedPanel = 'notes';
    this.panelMode = 'action';
    this.selectedActionLabel = mode === 'full' ? 'Notes' : 'Add Notes';

    // Use same extraction pattern as assignedauths: PascalCase first, then camelCase
    this.selectedAuthDetailId = Number(row?.authDetailId ?? 0);
    this.selectedAuthNumber = String(row?.AuthNumber ?? row?.authNumber ?? '');
    this.selectedAuthTemplateId = Number(row?.authTypeId ?? row?.AuthTypeId ?? row?.authTypeid ?? 0);
    this.notesViewMode = mode;
    this.panelSubtitle = 'Auth # ' + this.selectedAuthNumber;

    this.detailPanelOpen = true;
    this.detailPanelExpanded = true;

    console.log('[MAD] openNotes – row:', row,
      'authDetailId:', this.selectedAuthDetailId,
      'authNumber:', this.selectedAuthNumber);
  }



  openDocuments(row: MemberAuthGridRow, mode: 'add' | 'full' = 'add'): void {
    this.selectedRow = row ?? null;
    this.selectedPanel = 'documents';
    this.panelMode = 'action';
    this.selectedActionLabel = mode === 'full' ? 'Documents' : 'Add Documents';

    this.selectedAuthDetailId = Number(row?.authDetailId ?? 0);
    this.selectedAuthNumber = String(row?.AuthNumber ?? row?.authNumber ?? '');
    this.selectedAuthTemplateId = Number(row?.authTypeId ?? row?.AuthTypeId ?? row?.authTypeid ?? 0);
    this.documentsViewMode = mode;
    this.startAddDocuments = false;
    this.panelSubtitle = 'Auth # ' + this.selectedAuthNumber;

    this.detailPanelOpen = true;
    this.detailPanelExpanded = true;

    console.log('[MAD] openDocuments – row:', row,
      'authDetailId:', this.selectedAuthDetailId,
      'authNumber:', this.selectedAuthNumber);
  }

  // ════════════════════════════════════════════════
  //  ACTION PANEL — mode-change callbacks (child → parent)
  // ════════════════════════════════════════════════

  onNotesRequestViewAll(): void {
    this.notesViewMode = 'full';
    this.selectedActionLabel = 'Notes';
  }

  onNotesRequestAddOnly(): void {
    this.notesViewMode = 'add';
    this.selectedActionLabel = 'Add Notes';
  }

  onDocumentsRequestViewAll(): void {
    this.documentsViewMode = 'full';
    this.startAddDocuments = false;
    this.selectedActionLabel = 'Documents';
  }

  onDocumentsRequestAddOnly(): void {
    this.documentsViewMode = 'add';
    this.startAddDocuments = true;
    this.selectedActionLabel = 'Add Documents';
    Promise.resolve().then(() => (this.startAddDocuments = false));
  }

  onActivityRequestViewAll(): void {
    this.activityViewMode = 'full';
  }

  onActivityRequestAddOnly(): void {
    this.activityViewMode = 'add';
    this.startAddActivity = true;
    Promise.resolve().then(() => (this.startAddActivity = false));
  }

  // ════════════════════════════════════════════════
  //  ACTION PANEL — icon helper (used in template)
  // ════════════════════════════════════════════════

  getActionIcon(): string {
    switch (this.selectedPanel) {
      case 'notes': return 'edit_note';
      case 'documents': return 'description';
      case 'activity': return 'add_task';
      default: return 'more_horiz';
    }
  }

  // ════════════════════════════════════════════════
  //  DECISION HELPERS — Parse + Display
  // ════════════════════════════════════════════════

  /**
   * Safely parses the decisionStatusesJson string into an array of ParsedDecision objects.
   * Handles both string and pre-parsed array inputs.
   */
  private parseDecisionJson(raw: string | any[] | null): ParsedDecision[] {
    if (!raw) return [];
    try {
      const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  /** Returns parsed decisions for a row (cached for performance) */
  getDecisionStatuses(row: MemberAuthGridRow): ParsedDecision[] {
    if (this.parsedDecisionsCache.has(row.authNumber)) {
      return this.parsedDecisionsCache.get(row.authNumber)!;
    }

    const parsed = this.parseDecisionJson(row.decisionStatusesJson ?? null);
    this.parsedDecisionsCache.set(row.authNumber, parsed);
    return parsed;
  }

  /** Toggle expanded state for decisions on a card */
  toggleDecisionExpand(authNumber: string): void {
    if (this.expandedDecisions.has(authNumber)) {
      this.expandedDecisions.delete(authNumber);
    } else {
      this.expandedDecisions.add(authNumber);
    }
  }

  /** Returns whether decisions are expanded for a given auth card */
  isDecisionsExpanded(authNumber: string): boolean {
    return this.expandedDecisions.has(authNumber);
  }

  /** Returns the decisions to display (first 1 or all depending on expanded state) */
  getVisibleDecisions(row: MemberAuthGridRow): ParsedDecision[] {
    const all = this.getDecisionStatuses(row);
    if (all.length <= 1 || this.expandedDecisions.has(row.authNumber)) {
      return all;
    }
    return all.slice(0, 1);
  }

  /** Whether the row has any decision data to display */
  hasDecisions(row: MemberAuthGridRow): boolean {
    return (row.totalDecisions ?? 0) > 0 || this.getDecisionStatuses(row).length > 0;
  }

  /** Returns a CSS slug for a decision status label (e.g. "Approved" → "approved") */
  getDecisionStatusSlug(status: string): string {
    return (status || 'pending').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  }

  /** Returns a CSS slug for the overall decision status */
  getOverallDecisionSlug(row: MemberAuthGridRow): string {
    const raw = (row.overallDecisionStatus || 'pending').toString().trim();
    return raw.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  }

  /** Aggregates decision counts: { approved, denied, pending, partial, total } */
  getDecisionSummary(row: MemberAuthGridRow): { approved: number; denied: number; pending: number; partial: number; total: number } {
    const decisions = this.getDecisionStatuses(row);
    const summary = { approved: 0, denied: 0, pending: 0, partial: 0, total: decisions.length };

    for (const d of decisions) {
      const slug = this.getDecisionStatusSlug(d.decisionStatus);
      if (slug === 'approved') summary.approved++;
      else if (slug === 'denied') summary.denied++;
      else if (slug === 'partially-approved' || slug === 'partial') summary.partial++;
      else summary.pending++;
    }

    return summary;
  }

  /******** Permissions (safe fallback) ********/
  loadPermissionsForAuthActions() {
    const permissionsJson = JSON.parse(
      sessionStorage.getItem('rolePermissionsJson') || '[]'
    );

    const umModule =
      permissionsJson.find((m: any) => m.moduleName === 'UM') ||
      permissionsJson.find((m: any) => m.moduleName === 'Authorization') ||
      permissionsJson.find((m: any) => m.moduleName === 'Auth') ||
      null;

    if (!umModule) return;

    const authFeatureGroup =
      umModule.featureGroups?.find((fg: any) => fg.featureGroupName === 'Auth') ||
      umModule.featureGroups?.find(
        (fg: any) => fg.featureGroupName === 'Authorization'
      ) ||
      null;

    if (!authFeatureGroup) return;

    const actionsPage = authFeatureGroup.pages?.find((p: any) => p.name === 'Actions') || null;
    if (!actionsPage) return;

    for (const action of actionsPage.actions ?? []) {
      this.globalActionPermissions[action.name.toLowerCase()] = action.checked;
    }

    for (const resource of actionsPage.resources ?? []) {
      const resourceName = resource.name;
      this.permissionsMap[resourceName] = {};
      for (const action of resource.actions ?? []) {
        this.permissionsMap[resourceName][action.name.toLowerCase()] = action.checked;
      }
    }
  }

  hasPermission(resource: string, action: string): boolean {
    if (!Object.keys(this.permissionsMap || {}).length) return true;
    return this.permissionsMap[resource]?.[action.toLowerCase()] ?? false;
  }

  hasPagePermission(action: string): boolean {
    if (!Object.keys(this.globalActionPermissions || {}).length) return true;
    return this.globalActionPermissions[action.toLowerCase()] ?? false;
  }

  /******** Slug + Count helpers (used by template) ********/
  getStatusSlug(row: MemberAuthGridRow): string {
    const raw = (row.authStatusText || row.authStatus || '').toString().trim();
    return raw.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || 'default';
  }

  getTypeSlug(row: MemberAuthGridRow): string {
    const raw = (row.authTemplateName || row.authTypeText || row.authTypeId || '').toString().trim();
    return raw.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || 'default';
  }

  getPrioritySlug(row: MemberAuthGridRow): string {
    const raw = (row.requestPriority || 'standard').toString().trim();
    return raw.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  }

  getStatusCount(statusText: string): number {
    return this.dataSource.data.filter(
      (r) => (r.authStatusText || '').toLowerCase() === statusText.toLowerCase()
    ).length;
  }

  /** Builds dynamic status count list from current data */
  buildStatusCounts(): void {
    const countMap = new Map<string, number>();

    for (const row of this.dataSource.data) {
      const status = (row.authStatusText || '').toString().trim();
      if (!status) continue;
      countMap.set(status, (countMap.get(status) || 0) + 1);
    }

    this.statusCountList = Array.from(countMap.entries())
      .map(([status, count]) => ({
        status,
        count,
        slug: status.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
      }))
      .sort((a, b) => b.count - a.count);
  }

  onStatusFilterClick(status: string | null): void {
    if (this.activeStatusFilter === status) {
      this.activeStatusFilter = null;
    } else {
      this.activeStatusFilter = status;
    }
    this.pageIndex = 0;
    this.applyFilters();
  }

  getStatusDotColor(slug: string): string {
    return this.statusColorMap[slug] || '#6B7280';
  }

  trackByAuthNumber(_index: number, row: MemberAuthGridRow): string {
    return row.authNumber;
  }

  getDueDateInfo(row: MemberAuthGridRow): { daysLeft: number; label: string; level: string; tooltip: string } {
    if (!row.authDueDate) {
      return { daysLeft: 0, label: '', level: 'none', tooltip: '' };
    }

    // Use closedDateTime as the reference point when available,
    // so overdue days freeze at the moment the auth was closed.
    const closedRaw = row.authClosedDatetime ?? row.closedDateTime ?? row.closeddatetime ?? row.authcloseddatetime ?? null;
    let ref: Date;
    if (closedRaw) {
      ref = new Date(closedRaw);
      if (isNaN(ref.getTime())) ref = new Date();
    } else {
      ref = new Date();
    }
    ref.setHours(0, 0, 0, 0);

    const due = new Date(row.authDueDate);
    due.setHours(0, 0, 0, 0);

    const diffMs = due.getTime() - ref.getTime();
    const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (daysLeft < 0) {
      const overdueDays = Math.abs(daysLeft);
      return {
        daysLeft,
        label: `${daysLeft}d overdue`,
        level: 'overdue',
        tooltip: `Overdue by ${overdueDays} day${overdueDays !== 1 ? 's' : ''}`
      };
    } else if (daysLeft === 0) {
      return {
        daysLeft: 0,
        label: 'Due today',
        level: 'warning',
        tooltip: 'Due today'
      };
    } else if (daysLeft <= 7) {
      return {
        daysLeft,
        label: `${daysLeft}d left`,
        level: 'warning',
        tooltip: `${daysLeft} day${daysLeft !== 1 ? 's' : ''} remaining`
      };
    } else {
      return {
        daysLeft,
        label: `${daysLeft}d left`,
        level: 'safe',
        tooltip: `${daysLeft} days remaining`
      };
    }
  }

  private getMemberIdFromRoute(): number {
    let r: ActivatedRoute | null = this.route;
    while (r) {
      const v = r.snapshot.paramMap.get('id');
      if (v) return Number(v);
      r = r.parent;
    }
    return Number(sessionStorage.getItem('selectedMemberId') || 0);
  }

  private getMemberDetailsId(): string {
    return sessionStorage.getItem('selectedMemberDetailsId') || '0';
  }

  /******** Click handlers (open auth tab like case tab) ********/
  onAddAuthClick() {
    this.openAuthTab('0', true);
  }

  onAuthClick(authNumber: string) {
    const isNew = !authNumber || authNumber === '0';
    console.log('Auth clicked:', authNumber, 'isNew:', isNew);
    this.openAuthTab(authNumber, isNew);
  }

  private openAuthTab(authNumber: string, isNew: boolean): void {
    this.memberService.setIsCollapse(true);

    const memberId = this.memberId ?? this.getMemberIdFromRoute();
    const memberDetailsId = this.getMemberDetailsId();

    if (!memberId || Number.isNaN(memberId)) {
      console.error('Invalid memberId for auth tab route');
      return;
    }

    const authNo = isNew ? '0' : String(authNumber);
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

}
