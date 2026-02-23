import { Component, EventEmitter, Input, OnInit, Output, ViewChild, ViewEncapsulation } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatPaginator, PageEvent } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { MatMenuTrigger } from '@angular/material/menu';
import { AgCaseGridRow, CasedetailService } from 'src/app/service/casedetail.service';
import { HeaderService } from 'src/app/service/header.service';
import { Observable } from 'rxjs';
import { MemberService } from 'src/app/service/shared-member.service';

// ── Level step interface ──
interface LevelStep {
  number: number;
  status: 'completed' | 'current' | 'future';
}

@Component({
  selector: 'app-membercasedetails',
  templateUrl: './membercasedetails.component.html',
  styleUrls: ['./membercasedetails.component.css'],
  encapsulation: ViewEncapsulation.None,
})
export class MembercasedetailsComponent implements OnInit {
  @Input() memberId!: number;
  @Output() caseClicked = new EventEmitter<string>();
  @Output() addCaseClicked = new EventEmitter<void>();

  isLoading = true;
  isEmpty = false;

  viewMode: 'card' | 'table' = 'card';
  compactMode = false;

  pageSize = 10;
  pageIndex = 0;
  pagedCardData: AgCaseGridRow[] = [];

  displayedColumns: string[] = [
    'actions',
    'caseNumber',
    'caseTypeText',
    'caseStatusText',
    'casePriorityText',
    'caseLevelId',
    'receivedDateTime',
    'lastDetailOn',
    'createdByUserName'
  ];

  dataSource = new MatTableDataSource<AgCaseGridRow>([]);

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;
  @ViewChild(MatMenuTrigger) contextMenu!: MatMenuTrigger;

  // Permissions
  permissionsMap: any = {};
  globalActionPermissions: any = {};

  constructor(
    private route: ActivatedRoute,
    private agCaseService: CasedetailService,
    private headerService: HeaderService,
    private router: Router,
    private memberService: MemberService
  ) { }

  ngOnInit(): void {
    const routeMemberId = Number(this.route.parent?.snapshot.paramMap.get('id'));
    const memberId = Number(sessionStorage.getItem('selectedMemberDetailsId') || 0) ?? this.memberId ?? routeMemberId;

    this.loadPermissionsForCaseActions();
    this.getCaseDetails(memberId);
  }

  ngAfterViewInit() {
    if (this.viewMode === 'table') {
      this.dataSource.paginator = this.paginator;
    }
    this.dataSource.sort = this.sort;
  }

  // ═══════════════════════════════════
  //  DATA LOADING
  // ═══════════════════════════════════

  getCaseDetails(memberId: number): void {
    this.isLoading = true;

    this.agCaseService.getAgCasesByMember(memberId).subscribe({
      next: (data) => {
        this.isLoading = false;
        const rows = data ?? [];
        this.isEmpty = rows.length === 0;
        this.dataSource.data = rows;
        this.pageIndex = 0;
        this.updatePagedCardData();
      },
      error: (err) => {
        console.error('Error fetching case details:', err);
        this.isLoading = false;
        this.isEmpty = true;
        this.dataSource.data = [];
        this.updatePagedCardData();
      }
    });
  }

  // ═══════════════════════════════════
  //  LEVEL STEPPER
  // ═══════════════════════════════════

  getLevelSteps(row: any): LevelStep[] {
    const currentLevel = Number(row.caseLevelId ?? row.levelId ?? 1);
    const total = this.getTotalLevels(row);
    const steps: LevelStep[] = [];

    for (let i = 1; i <= total; i++) {
      if (i < currentLevel) {
        steps.push({ number: i, status: 'completed' });
      } else if (i === currentLevel) {
        steps.push({ number: i, status: 'current' });
      } else {
        steps.push({ number: i, status: 'future' });
      }
    }

    return steps;
  }

  getTotalLevels(row: any): number {
    if (row.totalLevels && Number(row.totalLevels) > 0) {
      return Number(row.totalLevels);
    }
    return 5; // default
  }

  // ═══════════════════════════════════
  //  LEVEL TOOLTIP HELPERS
  // ═══════════════════════════════════

  /** Human-readable label for a level step's status */
  getLevelStepStatusLabel(step: LevelStep): string {
    switch (step.status) {
      case 'completed': return 'Escalated';
      case 'current':   return 'Current Level';
      case 'future':    return 'Upcoming';
      default:          return '—';
    }
  }

  // ═══════════════════════════════════
  //  STATUS / PRIORITY / TYPE SLUGS
  //
  //  Status values:
  //    "In Progress"         → "in-progress"
  //    "On Hold"             → "on-hold"
  //    "Pending"             → "pending"
  //    "Close"               → "close"
  //    "Move to Next Level"  → "move-to-next-level"
  //
  //  Priority values:
  //    "Standard"            → "standard"
  //    "Expedited"           → "expedited"
  // ═══════════════════════════════════

  getStatusSlug(row: any): string {
    const raw = (row.caseStatusText || '').trim();
    if (!raw) return 'in-progress'; // safe fallback
    return raw.toLowerCase().replace(/\s+/g, '-');
  }

  getPrioritySlug(row: any): string {
    const raw = (row.casePriorityText || row.casePriority || '').trim();
    if (!raw) return 'standard'; // safe fallback
    return raw.toLowerCase();
  }

  getTypeSlug(row: any): string {
    const raw = (row.caseTypeText || row.caseType || '').trim();
    if (!raw) return 'default';

    const slug = raw.toLowerCase().replace(/\s+/g, '-');
    const known = [
      'appeal-template', 'appealtemplate',
      'prior-authorization', 'priorauthorization',
      'concurrent-review', 'concurrentreview',
      'retrospective-review', 'retrospectivereview'
    ];
    return known.includes(slug) ? slug : 'default';
  }

  // ═══════════════════════════════════
  //  STATS HELPERS
  // ═══════════════════════════════════

  /** Count cases matching a specific status (case-insensitive) */
  getStatusCount(statusText: string): number {
    const target = statusText.toLowerCase();
    return this.dataSource.data.filter(r =>
      (r.caseStatusText || '').toLowerCase() === target
    ).length;
  }

  // ═══════════════════════════════════
  //  VIEW CONTROLS
  // ═══════════════════════════════════

  applyFilter(event: Event): void {
    const filterValue = (event.target as HTMLInputElement).value;
    this.dataSource.filter = filterValue.trim().toLowerCase();
    this.pageIndex = 0;
    this.updatePagedCardData();
  }

  toggleViewMode(): void {
    this.viewMode = this.viewMode === 'card' ? 'table' : 'card';
    this.pageIndex = 0;

    if (this.viewMode === 'card') {
      this.updatePagedCardData();
    } else {
      setTimeout(() => {
        this.dataSource.paginator = this.paginator;
      });
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

  trackByCaseNumber(index: number, row: AgCaseGridRow): string {
    return row.caseNumber;
  }

  // ═══════════════════════════════════
  //  NAVIGATION
  // ═══════════════════════════════════

  onAddCaseClick(): void {
    this.openCaseTab('0', true);
  }

  onCaseClick(caseNumber: string): void {
    this.openCaseTab(caseNumber, false);
  }

  private openCaseTab(caseNumber: string, isNew: boolean): void {
    this.memberService.setIsCollapse(true);

    const memberId = this.memberId ?? Number(this.route.parent?.snapshot.paramMap.get('id'));
    const memberDetailsId = sessionStorage.getItem('selectedMemberDetailsId') || '0';

    const urlTree = this.router.createUrlTree(
      ['/member-info', memberId, 'case', caseNumber, 'details']
    );

    const tabRoute = this.router.serializeUrl(urlTree);
    const tabLabel = isNew ? 'Case # DRAFT' : `Case # ${caseNumber}`;

    const existingTab = this.headerService.getTabs().find(t => t.route === tabRoute);

    if (existingTab) {
      this.headerService.selectTab(tabRoute);
    } else {
      this.headerService.addTab(tabLabel, tabRoute, String(memberId), memberDetailsId);
    }

    this.router.navigateByUrl(tabRoute);
  }

  // ═══════════════════════════════════
  //  PERMISSIONS
  // ═══════════════════════════════════

  loadPermissionsForCaseActions(): void {
    const permissionsJson = JSON.parse(sessionStorage.getItem('rolePermissionsJson') || '[]');

    const agModule =
      permissionsJson.find((m: any) => m.moduleName === 'AG') ||
      permissionsJson.find((m: any) => m.moduleName === 'Case Management') ||
      permissionsJson.find((m: any) => m.moduleName === 'Advanced Guidance') ||
      null;

    if (!agModule) return;

    const caseFeatureGroup =
      agModule.featureGroups?.find((fg: any) => fg.featureGroupName === 'Case') ||
      agModule.featureGroups?.find((fg: any) => fg.featureGroupName === 'Cases') ||
      null;

    if (!caseFeatureGroup) return;

    const actionsPage =
      caseFeatureGroup.pages?.find((p: any) => p.name === 'Actions') || null;

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
}
