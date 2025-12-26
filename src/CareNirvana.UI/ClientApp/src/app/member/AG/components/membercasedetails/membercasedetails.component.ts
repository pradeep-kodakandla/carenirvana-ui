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

// TODO: replace with your real service
// import { AgCaseService } from 'src/app/service/agcase.service';
class AgCaseServiceMock {
  getAgCasesByMember(memberId: number): Observable<AgCaseGridRow[]> {
    throw new Error('Wire to real service');
  }
}

@Component({
  selector: 'app-membercasedetails',
  templateUrl: './membercasedetails.component.html',
  styleUrl: './membercasedetails.component.css',
  encapsulation: ViewEncapsulation.None,
})
export class MembercasedetailsComponent implements OnInit {
  @Input() memberId!: number;
  @Output() caseClicked = new EventEmitter<string>(); // parent can open case tab/screen
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
    'memberName',
    'casePriorityText',
    'caseStatusText',
    'receivedDateTime',
    'lastDetailOn',
    'createdOn',
    'createdByUserName'
  ];

  dataSource = new MatTableDataSource<AgCaseGridRow>([]);

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;

  // Context menu hook (if you need right click later)
  @ViewChild(MatMenuTrigger) contextMenu!: MatMenuTrigger;
  contextMenuPosition = { x: '0px', y: '0px' };

  // Permissions (same pattern as authdetails)
  permissionsMap: any = {};
  globalActionPermissions: any = {};

  constructor(
    private route: ActivatedRoute,
    // private agCaseService: AgCaseService
    private agCaseService: CasedetailService,
    private headerService: HeaderService,
    private router: Router,
    private memberService: MemberService
  ) { }

  ngOnInit(): void {
    const routeMemberId = Number(this.route.parent?.snapshot.paramMap.get('id'));
    const memberId = Number(sessionStorage.getItem('selectedMemberDetailsId') || 0) ?? this.memberId ?? routeMemberId;

    console.log('MemberCaseDetailsComponent initialized for memberId:', memberId);
    this.loadPermissionsForCaseActions();
    this.getCaseDetails(memberId);
  }

  ngAfterViewInit() {
    if (this.viewMode === 'table') {
      this.dataSource.paginator = this.paginator;
    }
    this.dataSource.sort = this.sort;
  }

  getCaseDetails(memberId: number): void {
    this.isLoading = true;

    this.agCaseService.getAgCasesByMember(memberId).subscribe({
      next: (data) => {
        this.isLoading = false;

        const rows = (data ?? []);
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

  applyFilter(event: Event) {
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

  //onCaseClick(caseNumber: string) {
  //  this.caseClicked.emit(caseNumber);
  //}

  //onAddCaseClick() {
  //  this.addCaseClicked.emit();
  //}

  /******** Permissions (safe fallback) ********/
  loadPermissionsForCaseActions() {
    const permissionsJson = JSON.parse(sessionStorage.getItem('rolePermissionsJson') || '[]');

    // Try common module names (keep safe)
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
      caseFeatureGroup.pages?.find((p: any) => p.name === 'Actions') ||
      null;

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
    // If permissions not loaded, don't block UI by default
    if (!Object.keys(this.permissionsMap || {}).length) return true;
    return this.permissionsMap[resource]?.[action.toLowerCase()] ?? false;
  }

  hasPagePermission(action: string): boolean {
    if (!Object.keys(this.globalActionPermissions || {}).length) return true;
    return this.globalActionPermissions[action.toLowerCase()] ?? false;
  }

  //private openCaseWizardInTab(caseIdOrNumber: string, isNew: boolean = false) {
  //  this.memberService.setIsCollapse(true);

  //  const memberId = this.memberId ?? Number(this.route.parent?.snapshot.paramMap.get('id'));
  //  const memberDetailsId = sessionStorage.getItem('selectedMemberDetailsId') || '0';

  //  // ✅ Case wizard route pattern (matches your redirect example: case/1/details)
  //  const caseKey = (caseIdOrNumber && caseIdOrNumber.trim()) ? caseIdOrNumber : '0';
  //  const tabRoute = isNew
  //    ? `/case/${caseKey}/details?mode=new`
  //    : `/case/${caseKey}/details`;

  //  const tabLabel = isNew ? `New Case` : `Case ${caseKey}`;

  //  const existingTab = this.headerService.getTabs().find(t => t.route === tabRoute);

  //  if (existingTab) {
  //    this.headerService.selectTab(tabRoute);
  //  } else {
  //    this.headerService.addTab(tabLabel, tabRoute, String(memberId), memberDetailsId);
  //  }

  //  // ✅ same “refresh navigation” pattern you use for auth
  //  this.router.navigateByUrl('/', { skipLocationChange: true }).then(() => {
  //    this.router.navigateByUrl(tabRoute);
  //  });
  //}

  ///** Add Case button */
  //onAddCaseClick() {
  //  // use 0 (recommended) so your route stays numeric-friendly
  //  this.openCaseWizardInTab('0', true);
  //}

  ///** Case number click */
  //onCaseClick(caseNumber: string) {
  //  this.openCaseWizardInTab(caseNumber, false);
  //}

  onAddCaseClick() {
    this.openCaseTab('0', true);
  }

  onCaseClick(caseNumber: string) {
    this.openCaseTab(caseNumber, false);
  }

  private openCaseTab(caseNumber: string, isNew: boolean) {
    this.memberService.setIsCollapse(true);

    const memberId = this.memberId ?? Number(this.route.parent?.snapshot.paramMap.get('id'));
    const memberDetailsId = sessionStorage.getItem('selectedMemberDetailsId') || '0';

    const urlTree = this.router.createUrlTree(
      ['/member-info', memberId, 'case', caseNumber, 'details']
      /*{ queryParams: isNew ? { mode: 'new' } : {} }*/
    );

    const tabRoute = this.router.serializeUrl(urlTree); // ✅ includes query params safely
    const tabLabel = isNew ? `New Case` : `Case ${caseNumber}`;

    const existingTab = this.headerService.getTabs().find(t => t.route === tabRoute);

    if (existingTab) {
      this.headerService.selectTab(tabRoute);
    } else {
      this.headerService.addTab(tabLabel, tabRoute, String(memberId), memberDetailsId);
    }
    console.log('Navigating to case tab route:', tabRoute);
    // ✅ no skipLocationChange hack (this often causes weird “stuck” behavior)
    this.router.navigateByUrl(tabRoute);
  }

}
