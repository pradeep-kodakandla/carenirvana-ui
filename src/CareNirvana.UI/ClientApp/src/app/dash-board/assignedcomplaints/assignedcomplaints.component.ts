import { Component, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { MatMenuTrigger } from '@angular/material/menu';

export interface UserData {
  enrollmentStatus: 'Active' | 'Inactive' | 'Soon Ending' | string;
  memberId: number | string;
  firstName: string;
  lastName: string;
  DOB: string | Date;
  risk?: string;
  nextContact?: string | Date | null;
  assignedDate?: string | Date | null;
  programName?: string | null;
  description?: string | null;
  WQ?: number | string | null;
  // Add any extra fields your template uses:
  [key: string]: any;
}

@Component({
  selector: 'app-assignedcomplaints',
  templateUrl: './assignedcomplaints.component.html',
  styleUrl: './assignedcomplaints.component.css'
})
export class AssignedcomplaintsComponent {

  selectedDiv: number | null = 1; // Track the selected div

  // Method to select a div and clear others
  selectDiv(index: number) {
    this.selectedDiv = index; // Set the selected div index
  }
  /*Div Selection Style change logic*/
  displayedColumns: string[] = ['enrollmentStatus', 'memberId', 'firstName', 'lastName', 'DOB', 'risk', 'nextContact', 'assignedDate', 'programName', 'description', 'WQ'];
  columnsToDisplayWithExpand = [...this.displayedColumns, 'expand'];


  dataSource: MatTableDataSource<UserData>;
  expandedElement!: UserData | null;


  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;

  loadPage(page: string) {
    // Use Angular Router to navigate based on the page selection
    // Assuming router has been injected in constructor
    this.router.navigate([page]);
  }

  constructor(private router: Router) {
    // Create 100 users
    const users = undefined;

    // Assign the data to the data source for the table to render
    this.dataSource = new MatTableDataSource(users);
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

  goToPage(memberId: string) {
    this.router.navigate(['/member-info', memberId]);
  }

  /*Table Context Menu*/
  @ViewChild(MatMenuTrigger)
  contextMenu!: MatMenuTrigger;

  contextMenuPosition = { x: '0px', y: '0px' };

 

}

