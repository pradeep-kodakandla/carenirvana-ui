import { Component, OnInit, ViewChild, AfterViewInit } from '@angular/core';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { HeaderService } from 'src/app/service/header.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-mycaseload',
  templateUrl: './mycaseload.component.html',
  styleUrls: ['./mycaseload.component.css']
})
export class MycaseloadComponent implements OnInit, AfterViewInit {

  constructor(private headerService: HeaderService, private router: Router) { }

  // View mode toggle
  viewMode: 'card' | 'table' = 'table';

  // Full member list
  members: any[] = [];

  // DataSource for table
  dataSource = new MatTableDataSource<any>();

  // Displayed rows in card view (paginated)
  pagedMembers: any[] = [];

  // Expanded card tracking
  expandedMember: any = null;

  // Currently selected for menu
  selectedMember: any;

  // Summary widgets
  summaryStats = [
    { label: 'Total Assigned', value: 65, icon: 'assignment_ind' },
    { label: 'High Risk', value: 20, icon: 'priority_high' },
    { label: 'Medium Risk', value: 5, icon: 'report_problem' },
    { label: 'Low Risk', value: 40, icon: 'check_circle' }
  ];

  // Table columns
  displayedColumns = ['name', 'program', 'risk', 'lastContact', 'nextContact', 'inlineCounts', 'expand'];
  expandedElement: any | null = null;
  expandedRowId: number | string | null = null;

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;

  ngOnInit(): void {
    // Load data (replace this with API call in real scenario)
    const testMembers = Array.from({ length: 50 }).map((_, i) => ({
      memberId: (10000 + i).toString(),
      firstName: 'Test',
      lastName: 'User ' + (i + 1),
      risk: ['Low', 'Medium', 'High'][i % 3],
      authCount: i % 5,
      activityCount: i % 7,
      carePlanCount: i % 4,
      contactOverdue: i % 6 === 0,
      programName: 'Program ' + (i % 4),
      nextContact: '2025-06-0' + ((i % 9) + 1),
      assignedDate: '2025-05-0' + ((i % 9) + 1)
    }));

    this.loadMembers(testMembers);
  }

  ngAfterViewInit(): void {
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;

    this.dataSource.filterPredicate = (data, filter) => {
      const fullName = `${data.firstName} ${data.lastName} ${data.memberId}`.toLowerCase();
      return fullName.includes(filter);
    };

    this.paginator.page.subscribe(() => {
      this.updatePagedMembers();
    });
  }

  loadMembers(data: any[]): void {
    this.members = data;
    this.dataSource.data = data;

    this.summaryStats[0].value = data.length;
    this.summaryStats[1].value = data.reduce((sum, m) => sum + (m.authCount || 0), 0);
    this.summaryStats[2].value = data.reduce((sum, m) => sum + (m.activityCount || 0), 0);

    // Defer paging if paginator is not yet ready
    if (this.paginator) {
      this.paginator.firstPage();
      this.updatePagedMembers();
    } else {
      // Defer paged update until ngAfterViewInit
      setTimeout(() => this.updatePagedMembers(), 0);
    }
  }


  updatePagedMembers(): void {
    const start = this.paginator.pageIndex * this.paginator.pageSize;
    const end = start + this.paginator.pageSize;
    const filtered = this.dataSource.filteredData;
    this.pagedMembers = filtered.slice(start, end);
  }

  toggleViewMode(): void {
    this.viewMode = this.viewMode === 'card' ? 'table' : 'card';
    this.updatePagedMembers();
  }

  toggleExpand(member: any): void {
    this.expandedMember = this.expandedMember === member ? null : member;
  }

  onSearch(event: any): void {
    const filterValue = event.target.value.trim().toLowerCase();
    this.dataSource.filter = filterValue;
    this.paginator.firstPage();
    this.updatePagedMembers();
  }

  onMemberClick(memberId: string, memberName: string): void {
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

  // Menu Actions
  addActivity(member: any): void {
    console.log('Add activity for', member);
  }

  addNotes(member: any): void {
    console.log('Add notes for', member);
  }

  sendLetter(member: any): void {
    console.log('Send letter to', member);
  }

  unassign(member: any): void {
    console.log('Unassign member', member);
  }

  getRiskEmoji(risk: string): string {
    switch (risk?.toLowerCase()) {
      case 'high': return '🔴';
      case 'medium': return '🟡';
      case 'low': return '🟢';
      default: return '⚪';
    }
  }

  getRiskLabel(risk: string): string {
    return risk ? risk.charAt(0).toUpperCase() + risk.slice(1).toLowerCase() : '';
  }

  getRiskClass(risk: string): string {
    switch (risk?.toLowerCase()) {
      case 'high': return 'high-risk-text';
      case 'medium': return 'medium-risk-text';
      case 'low': return 'low-risk-text';
      default: return '';
    }
  }

  private getRowId(row: any): number | string | null {
    return row?.memberId ?? row?.id ?? row?.MemberId ?? null;
  }

  toggleRow(row: any) {
    const id = this.getRowId(row);
    this.expandedRowId = (this.expandedRowId === id ? null : id);
  }

  // Predicate used by the detail-row "when:" to decide which row to show
  isDetailRow = (_index: number, row: any) => this.expandedRowId === this.getRowId(row);
 
}
