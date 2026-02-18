import { Component, EventEmitter, Input, OnInit, Output, ViewChild, ViewEncapsulation, } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatPaginator, PageEvent } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { MatMenuTrigger } from '@angular/material/menu';
import { HeaderService } from 'src/app/service/header.service';
import { MemberService } from 'src/app/service/shared-member.service';
import { AuthDetailApiService } from 'src/app/service/authdetailapi.service';

export interface MemberAuthGridRow {
  authNumber: string;

  // raw ids
  authTypeId?: number | null;
  authStatus?: number | null;
  authClassId?: number | null;

  // optional “text” fields if backend/UI maps them
  authTypeText?: string | null;
  authStatusText?: string | null;

  authDueDate?: string | Date | null;
  nextReviewDate?: string | Date | null;
  treatmentType?: string | null;

  createdOn?: string | Date | null;
  createdByUserName?: string | null;

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

  /** Color map for dynamic status dots */
  private statusColorMap: Record<string, string> = {
    approved:             '#22C55E',
    'partially-approved': '#10B981',
    partial:              '#10B981',
    pending:              '#8B5CF6',
    pended:               '#8B5CF6',
    'in-progress':        '#3B82F6',
    inprogress:           '#3B82F6',
    open:                 '#0EA5E9',
    submitted:            '#06B6D4',
    'under-review':       '#6366F1',
    underreview:          '#6366F1',
    denied:               '#EF4444',
    cancelled:            '#64748B',
    canceled:             '#64748B',
    withdrawn:            '#78716C',
    closed:               '#6B7280',
    close:                '#6B7280',
    voided:               '#475569',
    void:                 '#475569',
    modified:             '#F59E0B',
    expired:              '#F43F5E',
    'on-hold':            '#F97316',
    onhold:               '#F97316',
  };

  displayedColumns: string[] = [
    'actions',
    'authNumber',
    'authTypeText',
    'authStatusText',
    'authDueDate',
    'nextReviewDate',
    'treatmentType',
    'createdOn',
    'createdByUserName',
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

    // ✅ expected service method:
    // - if your service method name differs, change it here
    this.authDetailService.getByMember(memberId).subscribe({
      next: (data: MemberAuthGridRow[]) => {
        this.isLoading = false;
        console.log('Fetched auth details:', data);
        const rows = data ?? [];
        this.isEmpty = rows.length === 0;

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

  /******** Permissions (safe fallback) ********/
  loadPermissionsForAuthActions() {
    const permissionsJson = JSON.parse(
      sessionStorage.getItem('rolePermissionsJson') || '[]'
    );

    // Try common module names (safe)
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
      .sort((a, b) => b.count - a.count); // sort by count descending
  }

  /** Handles clicking a status chip to toggle filtering */
  onStatusFilterClick(status: string | null): void {
    // Toggle: if same status clicked again, reset to "all"
    if (this.activeStatusFilter === status) {
      this.activeStatusFilter = null;
    } else {
      this.activeStatusFilter = status;
    }
    this.pageIndex = 0;
    this.applyFilters();
  }

  /** Returns the dot color for a given status slug */
  getStatusDotColor(slug: string): string {
    return this.statusColorMap[slug] || '#6B7280';
  }

  trackByAuthNumber(_index: number, row: MemberAuthGridRow): string {
    return row.authNumber;
  }

  /**
   * Calculates due-date countdown info for display.
   * Returns { daysLeft, label, level, tooltip }
   *   level: 'overdue' | 'warning' | 'safe' | 'none'
   */
  getDueDateInfo(row: MemberAuthGridRow): { daysLeft: number; label: string; level: string; tooltip: string } {
    if (!row.authDueDate) {
      return { daysLeft: 0, label: '', level: 'none', tooltip: '' };
    }

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const due = new Date(row.authDueDate);
    due.setHours(0, 0, 0, 0);

    const diffMs = due.getTime() - now.getTime();
    const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (daysLeft < 0) {
      // Overdue
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
      // Warning zone
      return {
        daysLeft,
        label: `${daysLeft}d left`,
        level: 'warning',
        tooltip: `${daysLeft} day${daysLeft !== 1 ? 's' : ''} remaining`
      };
    } else {
      // Safe
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
      const v = r.snapshot.paramMap.get('id'); // member-info/:id
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

    // ✅ normalize for new
    const authNo = isNew ? '0' : String(authNumber);

    // ✅ choose correct step
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
