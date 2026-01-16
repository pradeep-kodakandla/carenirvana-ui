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
        this.updatePagedCardData();
      },
      error: (err: any) => {
        console.error('Error fetching auth details:', err);
        this.isLoading = false;
        this.isEmpty = true;
        this.dataSource.data = [];
        this.updatePagedCardData();
      },
    });
  }

  applyFilter(event: Event) {
    const filterValue = (event.target as HTMLInputElement).value ?? '';
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
