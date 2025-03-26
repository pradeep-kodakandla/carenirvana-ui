import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);
import { Component, ViewChild, ChangeDetectionStrategy } from '@angular/core';
import { Router } from '@angular/router';
import { animate, state, style, transition, trigger } from '@angular/animations';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { MatMenuTrigger } from '@angular/material/menu';
import { ChartOptions } from 'chart.js';
import { TabService } from '../../service/tab.service';
import { FormControl } from '@angular/forms';
import { HeaderService } from 'src/app/service/header.service';



@Component({
  selector: 'app-mycaseload',
  templateUrl: './mycaseload.component.html',
  styleUrl: './mycaseload.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [
    trigger('detailExpand', [
      state('collapsed,void', style({ height: '0px', minHeight: '0' })),
      state('expanded', style({ height: '*' })),
      transition('expanded <=> collapsed', animate('225ms cubic-bezier(0.4, 0.0, 0.2, 1)')),
    ]),
  ],
})
export class MycaseloadComponent {
  fontStyleControl = new FormControl('');
  fontStyle?: string;

  selectedDiv: number | null = 1; // Track the selected div

  // Method to select a div and clear others
  selectDiv(index: number) {
    this.selectedDiv = index; // Set the selected div index
  }
  /*Div Selection Style change logic*/
  displayedColumns: string[] = ['menu', 'enrollmentStatus', 'memberId', 'firstName', 'lastName', 'DOB', 'risk', 'nextContact', 'assignedDate', 'programName', 'description'];
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

  openMenu(event: Event) {
    // Stop the click event from propagating to the row
    event.stopPropagation();
  }
  constructor(private router: Router, private tabService: TabService, private headerService: HeaderService) {
    // Create 100 users
    const users = Array.from({ length: 100 }, (_, k) => createNewUser(k + 1));

    // Assign the data to the data source for the table to render
    this.dataSource = new MatTableDataSource(users);
  }


  // Method to load a component dynamically


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

  addTabAndNavigate(name: string) {
    this.tabService.addTab(name, 'John Smith - ' + name);
    this.router.navigate(['/member-info', name]);
  }


  onMemberClick(memberId: string, memberName:string): void {
    const tabLabel = `Member: ${memberName}`;
    const tabRoute = `/member-info/${memberId}`;

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
      this.headerService.addTab(tabLabel, tabRoute, memberId);
      this.router.navigateByUrl('/', { skipLocationChange: true }).then(() => {
        this.router.navigate([tabRoute]);
      });
    }
  }




  /*Table Context Menu*/
  @ViewChild(MatMenuTrigger)
  contextMenu!: MatMenuTrigger;

  contextMenuPosition = { x: '0px', y: '0px' };

  onContextMenu(event: MouseEvent, item: UserData) {
    event.preventDefault();
    this.contextMenuPosition.x = event.clientX + 'px';
    this.contextMenuPosition.y = event.clientY + 'px';
    this.contextMenu.menuData = { 'item': item };
    this.contextMenu.menu!.focusFirstItem('mouse');
    this.contextMenu.openMenu();
  }

  onContextMenuAction1(item: UserData) {
    alert(`Click on Action 1 for ${item.enrollmentStatus}`);
  }

  onContextMenuAction2(item: UserData) {
    alert(`Click on Action 2 for ${item.enrollmentStatus}`);
  }

  title = 'ng2-charts-demo';

  // Pie
  public pieChartOptions: ChartOptions<'pie'> = {
    responsive: false,
  };
  public pieChartLabels = [['Risk'], ['Risk2'], 'Risk3'];
  public pieChartDatasets = [{
    data: [300, 500, 100]
  }];
  public pieChartLegend = true;
  public pieChartPlugins = [];

  items = [
    {
      photo: 'assets/item1.jpg',
      header: 'JOHN SMITH',
      content: 'DOB: 10/22/2024'
    },
    {
      photo: 'assets/item1.jpg',
      header: 'JOHN SMITH',
      content: 'DOB: 10/22/2024'
    },
    {
      photo: 'assets/item1.jpg',
      header: 'JOHN SMITH',
      content: 'DOB: 10/22/2024'
    },
    {
      photo: 'assets/item1.jpg',
      header: 'JOHN SMITH',
      content: 'DOB: 10/22/2024'
    },
    {
      photo: 'assets/item1.jpg',
      header: 'JOHN SMITH',
      content: 'DOB: 10/22/2024'
    },
    {
      photo: 'assets/item1.jpg',
      header: 'JOHN SMITH',
      content: 'DOB: 10/22/2024'
    },
    {
      photo: 'assets/item1.jpg',
      header: 'JOHN SMITH',
      content: 'DOB: 10/22/2024'
    },
    {
      photo: 'assets/item1.jpg',
      header: 'JOHN SMITH',
      content: 'DOB: 10/22/2024'
    }
  ];




}
/** Builds and returns a new User. */
export function createNewUser(id: number): UserData {
  const name =
    NAMES[Math.round(Math.random() * (NAMES.length - 1))];

  return {
    menu: '',
    enrollmentStatus: STATUS[Math.round(Math.random() * (STATUS.length - 1))],
    firstName: name,
    memberId: NUMS[Math.round(Math.random() * (NUMS.length - 1))], /*(100 * 100).toString(),*/
    lastName: FRUITS[Math.round(Math.random() * (FRUITS.length - 1))],
    DOB: '09/14/2024',
    risk: 'Low',
    nextContact: '09/14/2024',
    assignedDate: '09/14/2024',
    programName: 'Care Management',
    description: 'I am a good boy - I dont have any health issues'
  };
}
export interface UserData {
  menu: string;
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
  'John',
  'Hopes',
  'Kevin',
  'Bob',
  'Isabella',
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
  'Jeans',
  'Thomas',
  'Elizabeth',
];

const STATUS: string[] = [
  'Active',
  'Inactive',
];
