import { Component, EventEmitter, Output, ViewChild, ViewEncapsulation, OnInit, Input } from '@angular/core';
import { Router } from '@angular/router';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { MatMenuTrigger } from '@angular/material/menu';
import { MemberService } from 'src/app/service/shared-member.service';
import { AuthService } from 'src/app/service/auth.service';
import { HeaderService } from 'src/app/service/header.service';

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

  constructor(private router: Router, private memberService: MemberService, private authService: AuthService, private headerService: HeaderService) {
  }

  displayedColumns: string[] = [
    'authDetailId', 'authNumber', 'authTypeId', 'memberId',
    'authDueDate', 'nextReviewDate', 'treatmentType'
  ];
  columnsToDisplayWithExpand = [...this.displayedColumns, 'expand'];
  dataSource = new MatTableDataSource<any>();


  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;

  loadPage(page: string) {
    // Use Angular Router to navigate based on the page selection
    // Assuming router has been injected in constructor
    this.router.navigate([page]);
  }

  ngOnInit(): void {
    this.getAuthDetails();
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
        this.authDetails = data.map((item: any) => ({
          authDetailId: item.Id || '',
          authNumber: item.AuthNumber || '',
          authTypeId: item.AuthTypeId || '',
          memberId: item.MemberId || '',
          authDueDate: item.AuthDueDate || '',
          nextReviewDate: item.NextReviewDate || '',
          treatmentType: item.TreatmentType || ''
        }));

        this.dataSource.data = this.authDetails;
        console.log('Auth Details:', this.authDetails);
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
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;
  }

  applyFilter(event: Event) {
    const filterValue = (event.target as HTMLInputElement).value;
    this.dataSource.filter = filterValue.trim().toLowerCase();

    if (this.dataSource.paginator) {
      this.dataSource.paginator.firstPage();
    }
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
    //this.addClicked.emit(authNumber);
    //this.memberService.setIsCollapse(true);
    if (!authNumber) {
      authNumber = 'DRAFT';
    }


    const tabLabel = `Auth No (${authNumber})`;
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
}
