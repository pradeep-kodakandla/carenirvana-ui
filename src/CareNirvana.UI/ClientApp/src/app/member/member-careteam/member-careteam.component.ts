import { Component, ViewChild } from '@angular/core';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatSortModule } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { MatMenu } from '@angular/material/menu';
import { Router } from '@angular/router';
import { animate, state, style, transition, trigger } from '@angular/animations';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { MatMenuTrigger } from '@angular/material/menu';

@Component({
  selector: 'app-member-careteam',
  templateUrl: './member-careteam.component.html',
  styleUrl: './member-careteam.component.css',
  animations: [
    trigger('detailExpand', [
      state('collapsed,void', style({ height: '0px', minHeight: '0' })),
      state('expanded', style({ height: '*' })),
      transition('expanded <=> collapsed', animate('225ms cubic-bezier(0.4, 0.0, 0.2, 1)')),
    ]),
  ],
})
export class MemberCareteamComponent {

  selectedDiv: number | null = 1; // Track the selected div

  // Method to select a div and clear others
  selectDiv(index: number) {
    this.selectedDiv = index; // Set the selected div index
  }
  /*Div Selection Style change logic*/
  displayedColumns: string[] = ['enrollmentStatus', 'memberId', 'firstName', 'lastName', 'DOB', 'risk', 'nextContact', 'assignedDate', 'programName', 'description'];
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
    const users = Array.from({ length: 100 }, (_, k) => createNewUser(k + 1));

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


  onContextMenuAction1(item: UserData) {
    alert(`Click on Action 1 for ${item.enrollmentStatus}`);
  }

  onContextMenuAction2(item: UserData) {
    alert(`Click on Action 2 for ${item.enrollmentStatus}`);
  }

}
/** Builds and returns a new User. */
export function createNewUser(id: number): UserData {
  const name =
    NAMES[Math.round(Math.random() * (NAMES.length - 1))];

  return {
    enrollmentStatus: 'Active',
    firstName: name,
    memberId: NUMS[Math.round(Math.random() * (NUMS.length - 1))], /*(100 * 100).toString(),*/
    lastName: FRUITS[Math.round(Math.random() * (FRUITS.length - 1))],
    DOB: '09/14/2024',
    risk: 'Low',
    nextContact: '09/14/2024',
    assignedDate: '09/14/2024',
    programName: 'Care Management',
    description: 'Description'
  };
}
export interface UserData {
  enrollmentStatus: string;
  memberId: string;
  firstName: string;
  lastName: string;
  DOB: string;
  risk: string;
  nextContact: string;
  assignedDate: string;
  programName: string;
  description: string;
}

/** Constants used to fill up our data base. */
const FRUITS: string[] = [
  'blueberry',
  'lychee',
  'kiwi',
  'mango',
  'peach',
  'lime',
  'pomegranate',
  'pineapple',
];
const NUMS: string[] = [
  '10000',
  '10001',
  '10003',
  '10004',
  '10005',
  '10006',
  '10007',
  '10008',
  '10009',
  '10010',
];

const NAMES: string[] = [
  'Pradeep',
  'Pawan',
  'Sridhar',
  'Rohitha',
  'Paavana',
  'Jack',
  'Charlotte',
  'Theodore',
  'Isla',
  'Oliver',
  'Isabella',
  'Jasper',
  'Cora',
  'Levi',
  'Violet',
  'Arthur',
  'Mia',
  'Thomas',
  'Elizabeth',
];
