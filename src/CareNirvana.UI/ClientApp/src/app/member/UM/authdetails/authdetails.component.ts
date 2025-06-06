import { Component, EventEmitter, Output, ViewChild, ViewEncapsulation, OnInit, Input } from '@angular/core';
import { Router } from '@angular/router';
import { MatPaginator, PageEvent } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { MatMenuTrigger } from '@angular/material/menu';
import { MemberService } from 'src/app/service/shared-member.service';
import { AuthService } from 'src/app/service/auth.service';
import { HeaderService } from 'src/app/service/header.service';
import { CrudService } from 'src/app/service/crud.service';


@Component({
  selector: 'app-authdetails',
  templateUrl: './authdetails.component.html',
  styleUrl: './authdetails.component.css',
  encapsulation: ViewEncapsulation.None,
})
export class AuthdetailsComponent implements OnInit {

  authDetails: any[] = [];
  @Input() memberId!: number;
  isLoading = true;
  isEmpty = false;
  showAddHighlight = false;
  /*Div Selection Style change logic*/
  //displayedColumns: string[] = ['enrollmentStatus', 'memberId', 'firstName', 'lastName', 'DOB', 'risk', 'nextContact', 'assignedDate', 'programName', 'description'];
  permissionsMap: any = {};
  @ViewChild(MatPaginator) paginator!: MatPaginator;

  pageSize = 10;
  pageIndex = 0;
  pagedCardData: any[] = [];
  viewMode: 'card' | 'table' = 'card'; // or set default

  constructor(private router: Router, private memberService: MemberService, private authService: AuthService, private headerService: HeaderService, private crudService: CrudService) {
  }

  displayedColumns: string[] = [
    'authDetailId', 'authNumber', 'authTypeId', 'memberId',
    'authDueDate', 'nextReviewDate', 'treatmentType'
  ];
  columnsToDisplayWithExpand = [...this.displayedColumns, 'expand'];
  dataSource = new MatTableDataSource<any>();


  //@ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;

  loadPage(page: string) {
    // Use Angular Router to navigate based on the page selection
    // Assuming router has been injected in constructor
    this.router.navigate([page]);
  }

  ngOnInit(): void {
    this.getAuthDetails();
    this.loadPermissionsForAuthorizationActions();

  }

  getAuthDetails(): void {
    console.log('Fetching Auth Details for Member ID:', this.memberId);
    this.isLoading = true;  // ✅ Show spinner while fetching data

    this.authService.getAllAuthDetailsByMemberId(this.memberId).subscribe(
      (data) => {
        this.isLoading = false;  // ✅ Stop spinner
        if (!data || data.length === 0) {
          console.warn('No Auth Details found for Member ID:', this.memberId);
          this.isEmpty = true; // ✅ Show "No data available"
          this.showAddHighlight = true;
          this.authDetails = [];
          this.dataSource.data = [];
          return;
        }

        this.isEmpty = false;
        this.showAddHighlight = false;


        this.authService.getAuthTemplates(0).subscribe((authTypes: any[]) => {
          // Create a map for easy lookup
          const authTypeMap = new Map(authTypes.map(type => [type.Id, type.TemplateName]));

          this.authDetails = data.map((item: any) => ({
            authDetailId: item.Id || '',
            authNumber: item.AuthNumber || '',
            authTypeId: authTypeMap.get(item.AuthTypeId) || '',
            memberId: item.MemberId || '',
            authDueDate: item.AuthDueDate || '',
            nextReviewDate: item.NextReviewDate || '',
            treatmentType: item.TreatmentType || ''
          }));
          this.dataSource.data = this.authDetails;
          this.updatePagedCardData();
        });

      },
      (error) => {
        console.error('Error fetching auth details:', error);
        this.isLoading = false;
        this.isEmpty = true;
        this.showAddHighlight = true;
        this.authDetails = [];
        this.dataSource.data = [];
      }
    );
  }


  ngAfterViewInit() {
    if (this.viewMode === 'table') {
      this.dataSource.paginator = this.paginator;
    }
    this.dataSource.sort = this.sort;
  }

  applyFilter(event: Event) {
    const filterValue = (event.target as HTMLInputElement).value;
    this.dataSource.filter = filterValue.trim().toLowerCase();
    this.pageIndex = 0;
    this.updatePagedCardData();
  }


  /*Table Context Menu*/
  @ViewChild(MatMenuTrigger)
  contextMenu!: MatMenuTrigger;

  contextMenuPosition = { x: '0px', y: '0px' };

  /*auth Search*/
  isFocused = false;

  onFocus() {
    this.isFocused = true;
  }

  onBlur() {
    this.isFocused = false;
  }
  /*auth Search*/

  /*to display add auth component*/
  @Output() addClicked = new EventEmitter<string>();

  onAddClick(authNumber: string = '') {
    //console.log('Add Auth Clicked:', authNumber);
    this.addClicked.emit(authNumber);
    this.memberService.setIsCollapse(true);
    if (!authNumber) {
      authNumber = 'DRAFT';
    }


    const tabLabel = `Auth No ${authNumber}`;
    const tabRoute = `/member-auth/${authNumber}/${this.memberId}`;

    // Check if tab already exists
    const existingTab = this.headerService.getTabs().find(tab => tab.route === tabRoute);

    if (existingTab) {
      // Select the existing tab instead of creating a new one
      this.headerService.selectTab(tabRoute);
      this.router.navigateByUrl('/', { skipLocationChange: true }).then(() => {
        this.router.navigate([tabRoute]);
      });
    } else {
      // reate and select the new tab
      this.headerService.addTab(tabLabel, tabRoute, String(this.memberId));
      this.router.navigateByUrl('/', { skipLocationChange: true }).then(() => {
        this.router.navigate([tabRoute]);
      });
    }
  }

  compactMode: boolean = false;

  toggleViewMode(): void {
    this.viewMode = this.viewMode === 'card' ? 'table' : 'card';
    this.pageIndex = 0;

    if (this.viewMode === 'card') {
      this.updatePagedCardData();
    } else {
      this.dataSource.paginator = this.paginator;
    }
  }




  toggleCompactMode() {
    this.compactMode = !this.compactMode;
  }

  /**********Helper Methods********/
  globalActionPermissions: any = {};

  loadPermissionsForAuthorizationActions() {
    const permissionsJson = JSON.parse(sessionStorage.getItem('rolePermissionsJson') || '[]');
    const umModule = permissionsJson.find((m: any) => m.moduleName === 'Utilization Management');
    if (!umModule) return;

    const authFeatureGroup = umModule.featureGroups.find((fg: any) => fg.featureGroupName === 'Authorization');
    if (!authFeatureGroup) return;

    const actionsPage = authFeatureGroup.pages.find((p: any) => p.name === 'Actions');
    if (!actionsPage) return;

    // 🔹 Page-level actions
    for (const action of actionsPage.actions ?? []) {
      this.globalActionPermissions[action.name.toLowerCase()] = action.checked;
    }

    // 🔹 Resource-level actions
    for (const resource of actionsPage.resources ?? []) {
      const resourceName = resource.name;
      this.permissionsMap[resourceName] = {};
      for (const action of resource.actions) {
        this.permissionsMap[resourceName][action.name.toLowerCase()] = action.checked;
      }
    }
  }

  hasPermission(resource: string, action: string): boolean {
    return this.permissionsMap[resource]?.[action.toLowerCase()] ?? false;
  }

  hasPagePermission(action: string): boolean {
    return this.globalActionPermissions[action.toLowerCase()] ?? false;
  }


  handleCardPagination(event: PageEvent) {
    this.pageSize = event.pageSize;
    this.pageIndex = event.pageIndex;
    this.updatePagedCardData();
  }

  updatePagedCardData(): void {
    const start = this.pageIndex * this.pageSize;
    const end = start + this.pageSize;
    this.pagedCardData = this.dataSource.filteredData.slice(start, end);
  }


  onPageChange(event: PageEvent): void {
    this.pageSize = event.pageSize;
    this.pageIndex = event.pageIndex;

    if (this.viewMode === 'card') {
      this.updatePagedCardData();
    } else if (this.viewMode === 'table') {
      this.dataSource.paginator = this.paginator;
    }
  }


  /**********Helper Methods********/
}

