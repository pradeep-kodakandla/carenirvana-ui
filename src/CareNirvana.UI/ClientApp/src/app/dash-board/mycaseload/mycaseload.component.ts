import { Component, OnInit, ViewChild, AfterViewInit, ChangeDetectorRef } from '@angular/core';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { MatTable } from '@angular/material/table';
import { HeaderService } from 'src/app/service/header.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-mycaseload',
  templateUrl: './mycaseload.component.html',
  styleUrls: ['./mycaseload.component.css']
})
export class MycaseloadComponent implements OnInit, AfterViewInit {
  constructor(
    private headerService: HeaderService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) { }

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

  // Expanded row for table (use object reference)
  expandedRow: any | null = null;

  // Summary widgets
  summaryStats = [
    //{ label: 'Total Assigned', value: 65, icon: 'assignment_ind' },
    { label: 'High Risk', value: 20, icon: 'priority_high' },
    { label: 'Medium Risk', value: 5, icon: 'report_problem' },
    { label: 'Low Risk', value: 40, icon: 'check_circle' }
  ];

  // Table columns
  displayedColumns: string[] = [
    'name', 'program', 'dob', 'risk', 'lastContact', 'nextContact', 'inlineCounts', 'expand'
  ];

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;
  @ViewChild(MatTable) table!: MatTable<any>;

  // Filter settings
  showFilters = false;

  filters = {
    risks: new Set<string>(),
    enroll: new Set<string>(),
    diagnoses: [] as string[],
    quality: [] as string[],
  };

  diagnosisOptions = ['Diabetes', 'Hypertension', 'COPD', 'Heart Disease'];
  qualityOptions = ['HbA1c Control', 'BP Control', 'Medication Adherence'];
  diagnosisSelection: Record<string, boolean> = {};
  qualitySelection: Record<string, boolean> = {};

  counts = {
    risk: { high: 2, medium: 2, low: 2 },
    enroll: { active: 4, inactive: 1, soonEnding: 1 }
  };

  ngOnInit(): void {

    const testMembers = Array.from({ length: 50 }).map((_, i) => ({
      memberId: (10000 + i).toString(),
      firstName: 'Test',
      lastName: 'User ' + (i + 1),
      dob: `01-0${((i % 9) + 1)}-198${i % 10}`,
      risk: ['Low', 'Medium', 'High'][i % 3],
      authCount: i % 5,
      activityCount: i % 7,
      carePlanCount: i % 4,
      contactOverdue: i % 6 === 0,
      programName: 'Program ' + (i % 4),
      nextContact: `06-0${((i % 9) + 1)}-2025`,
      lastContact: `05-0${((i % 9) + 1)}-2025`
    }));
    //const testMembers = [
    //  {
    //    memberId: '10000',
    //    firstName: 'Test',
    //    lastName: 'User 0',
    //    dob: '01-01-1980',
    //    risk: 'High',
    //    authCount: 2,
    //    activityCount: 3,
    //    carePlanCount: 1,
    //    contactOverdue: false,
    //    programName: 'Program A',
    //    nextContact: '06-01-2025',
    //    lastContact: '05-01-2025'
    //  },
    //  {
    //    memberId: '10001',
    //    firstName: 'Test',
    //    lastName: 'User 1',
    //    dob: '01-01-1980',
    //    risk: 'High',
    //    authCount: 2,
    //    activityCount: 3,
    //    carePlanCount: 1,
    //    contactOverdue: false,
    //    programName: 'Program A',
    //    nextContact: '06-01-2025',
    //    lastContact: '05-01-2025'
    //  },
    //  {
    //    memberId: '10002',
    //    firstName: 'Test',
    //    lastName: 'User 2',
    //    dob: '02-02-1985',
    //    risk: 'Low',
    //    authCount: 1,
    //    activityCount: 2,
    //    carePlanCount: 0,
    //    contactOverdue: true,
    //    programName: 'Program B',
    //    nextContact: '06-02-2025',
    //    lastContact: '05-02-2025'
    //  }
    //];

    this.loadMembers(testMembers);
    this.diagnosisOptions.forEach(d => this.diagnosisSelection[d] = false);
    this.qualityOptions.forEach(q => this.qualitySelection[q] = false);
  }

  ngAfterViewInit(): void {
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;

    this.dataSource.filterPredicate = (data, filter) => {
      const fullName = `${data.firstName} ${data.lastName} ${data.memberId}`.toLowerCase();
      return fullName.includes(filter);
    };

    this.paginator.page.subscribe(() => {
      this.expandedRow = null;
      this.updatePagedMembers();
    });

    this.sort.sortChange.subscribe(() => {
      this.expandedRow = null;
      this.updatePagedMembers();
    });
  }

  loadMembers(data: any[]): void {
    this.members = data;
    this.dataSource.data = data;

    this.summaryStats[0].value = data.length;
    this.summaryStats[1].value = data.reduce((sum, m) => sum + (m.authCount || 0), 0);
    this.summaryStats[2].value = data.reduce((sum, m) => sum + (m.activityCount || 0), 0);

    if (this.paginator) {
      this.paginator.firstPage();
      this.updatePagedMembers();
    } else {
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

    const existingTab = this.headerService.getTabs().find(tab => tab.route === tabRoute);

    if (existingTab) {
      this.headerService.selectTab(tabRoute);
      this.router.navigateByUrl('/', { skipLocationChange: true }).then(() => {
        this.router.navigate([tabRoute]);
      });
    } else {
      this.headerService.addTab(tabLabel, tabRoute, memberId);
      this.router.navigateByUrl('/', { skipLocationChange: true }).then(() => {
        this.router.navigate([tabRoute]);
      });
    }
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

  // Toggle row using object reference
  toggleRow(row: any): void {
    this.expandedRow = this.expandedRow === row ? null : row;
    setTimeout(() => {
      if (this.table) {
        this.table.renderRows();
      }
      this.cdr.detectChanges();
    }, 0);
  }

  // Predicate for detail row
  isDetailRow = (index: number, row: any): boolean => {
    const isExpanded = row === this.expandedRow;
    return isExpanded;
  };

  // Track by memberId for performance
  trackById = (_: number, row: any) => row.memberId;

  // Filter methods
  toggleFilters() {
    this.showFilters = !this.showFilters;
  }

  resetFilters() {
    this.filters.risks.clear();
    this.filters.enroll.clear();
    Object.keys(this.diagnosisSelection).forEach(k => this.diagnosisSelection[k] = false);
    Object.keys(this.qualitySelection).forEach(k => this.qualitySelection[k] = false);
    this.applyFilters();
  }

  toggleRisk(r: string) {
    this.filters.risks.has(r) ? this.filters.risks.delete(r) : this.filters.risks.add(r);
  }

  toggleEnroll(s: string) {
    this.filters.enroll.has(s) ? this.filters.enroll.delete(s) : this.filters.enroll.add(s);
  }

  applyFilters() {
    this.filters.diagnoses = Object.keys(this.diagnosisSelection).filter(k => this.diagnosisSelection[k]);
    this.filters.quality = Object.keys(this.qualitySelection).filter(k => this.qualitySelection[k]);
  }
}
