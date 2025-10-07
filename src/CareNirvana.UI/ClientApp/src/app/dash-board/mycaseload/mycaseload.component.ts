import { Component, OnInit, ViewChild, AfterViewInit, ChangeDetectorRef } from '@angular/core';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { MatTable } from '@angular/material/table';
import { HeaderService } from 'src/app/service/header.service';
import { Router } from '@angular/router';
import { DashboardServiceService } from 'src/app/service/dashboard.service.service';

type SelectedFilter =
  | { group: 'Risk'; label: string; key: 'High' | 'Medium' | 'Low' }
  | { group: 'Enrollment'; label: string; key: 'Active' | 'Soon Ending' | 'Inactive' }
  | { group: 'Diagnosis'; label: string; key: string }
  | { group: 'Quality'; label: string; key: string };

@Component({
  selector: 'app-mycaseload',
  templateUrl: './mycaseload.component.html',
  styleUrls: ['./mycaseload.component.css']
})

export class MycaseloadComponent implements OnInit, AfterViewInit {
  constructor(
    private headerService: HeaderService,
    private router: Router,
    private cdr: ChangeDetectorRef,
    private dashboard: DashboardServiceService
  ) { }

  // View mode toggle
  viewMode: 'card' | 'table' = 'table';


  // Full member list
  members: any[] = [];
  filtered: any[] = [];
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
    'alert','name', 'program', 'dob', 'risk', 'lastContact', 'nextContact', 'inlineCounts', 'expand'
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
    risk: { high: 0, medium: 0, low: 0, norisk: 0 },
    enroll: { active: 0, inactive: 0, soonEnding: 0 }
  };

  ngOnInit(): void {

    //  this.loadMembers(testMembers);
    this.diagnosisOptions.forEach(d => this.diagnosisSelection[d] = false);
    this.qualityOptions.forEach(q => this.qualitySelection[q] = false);
    this.dashboard.getmembersummary(sessionStorage.getItem('loggedInUserid')).subscribe((data) => {
      console.log('Member Summary', data);
      if (data && Array.isArray(data)) {
        this.loadMembers(data);
      }
    }, error => {
      console.error('Error fetching member summary', error);
    });
  }

  getProduct(levelMap: unknown): string {
    if (!levelMap) return '';
    try {
      const obj = typeof levelMap === 'string' ? JSON.parse(levelMap) : levelMap as any;
      return obj?.LOB ?? '';
    } catch { return ''; }
  }

  ngAfterViewInit(): void {
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;

    this.dataSource.filterPredicate = (data, filter) => {
      const haystack = [
        data.FirstName,
        data.LastName,
        data.MemberId,
        this.getProduct?.(data.LevelMap),
        data.RiskLevelCode
      ]
        .map(x => (x ?? '').toString().toLowerCase())
        .join(' ');

      return haystack.includes((filter || '').toLowerCase());
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
    this.calculateRiskCounts(this.members);
    this.calculateEnrollmentCounts(this.members);
    /*    this.dataSource.data = data;*/

    this.summaryStats[0].value = data.length;
    this.summaryStats[1].value = data.reduce((sum, m) => sum + (m.authCount || 0), 0);
    this.summaryStats[2].value = data.reduce((sum, m) => sum + (m.activityCount || 0), 0);

    this.filtered = [...this.members];
    this.dataSource.data = this.members;
    setTimeout(() => {  // ensures paginator is ready
      this.updatePagedMembers();
    }, 0);
  }

  private updatePagedMembers(): void {
    if (!this.paginator) {
      this.pagedMembers = this.filtered;
      return;
    }
    const start = this.paginator.pageIndex * this.paginator.pageSize;
    const end = start + this.paginator.pageSize;
    this.pagedMembers = (this.filtered || []).slice(start, end);
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

  onMemberClick(memberId: string, memberName: string, memberDetailsId: string): void {
    const tabLabel = `Member: ${memberName}`;
    const tabRoute = `/member-info/${memberId}`;

    const existingTab = this.headerService.getTabs().find(tab => tab.route === tabRoute);

    if (existingTab) {
      this.headerService.selectTab(tabRoute);
      const mdId = existingTab.memberDetailsId ?? null;
      if (mdId) sessionStorage.setItem('selectedMemberDetailsId', mdId);

      this.router.navigateByUrl('/', { skipLocationChange: true }).then(() => {
        this.router.navigate([tabRoute]);
      });
    } else {
      this.headerService.addTab(tabLabel, tabRoute, memberId, memberDetailsId);
      sessionStorage.setItem('selectedMemberDetailsId', memberDetailsId);
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

  toggleRisk(level: 'High' | 'Medium' | 'Low' | 'Norisk'): void {
    this.filters.risks.has(level) ? this.filters.risks.delete(level) : this.filters.risks.add(level);
    this.applyFilters();
  }

  toggleEnroll(state: 'Active' | 'Soon Ending' | 'Inactive'): void {
    this.filters.enroll.has(state) ? this.filters.enroll.delete(state) : this.filters.enroll.add(state);
    this.applyFilters();
  }

  resetFilters(): void {
    this.filters.risks.clear();
    this.filters.enroll.clear();
    this.applyFilters();
  }

  applyFilters(): void {
    let arr = [...this.members];

    // Risk filter
    if (this.filters.risks.size) {
      arr = arr.filter(m => {
        const val = (m.RiskLevelCode || '').toLowerCase();
        return (this.filters.risks.has('High') && val === 'high') ||
          (this.filters.risks.has('Medium') && val === 'medium') ||
          (this.filters.risks.has('Low') && (val === 'low' )) ||
          (this.filters.risks.has('Norisk') && (val === '' ));
      });
    }

    // Enrollment filter
    if (this.filters.enroll.size) {
      arr = arr.filter(m => this.filters.enroll.has(this.getEnrollStatus(m)));
    }

    this.filtered = arr;
    this.dataSource.data = arr;

    // keep card view in sync with paginator
    this.updatePagedMembers();
  }

  // --- Enrollment classifier reused by counts + filtering ---
  private getEnrollStatus(m: any): 'Active' | 'Soon Ending' | 'Inactive' {
    const today = new Date();
    const start = new Date(m.StartDate);
    const end = new Date(m.EndDate);
    if (!(start <= today && end >= today)) return 'Inactive';
    const daysLeft = Math.floor((end.getTime() - today.getTime()) / 86400000);
    return daysLeft <= 30 ? 'Soon Ending' : 'Active';
  }

  // --- Calculate counts after you set this.members from API ---
  private calculateRiskCounts(list: any[]): void {
    this.counts.risk = { high: 0, medium: 0, low: 0, norisk: 0 };
    list.forEach(m => {
      const code = (m.RiskLevelCode || '').toLowerCase();
      if (code === 'high') this.counts.risk.high++;
      else if (code === 'medium') this.counts.risk.medium++;
      else if (code === 'low') this.counts.risk.low++;
      else this.counts.risk.norisk++;
    });
  }

  private calculateEnrollmentCounts(list: any[]): void {
    this.counts.enroll = { active: 0, soonEnding: 0, inactive: 0 };
    list.forEach(m => {
      const s = this.getEnrollStatus(m);
      if (s === 'Active') this.counts.enroll.active++;
      else if (s === 'Soon Ending') this.counts.enroll.soonEnding++;
      else this.counts.enroll.inactive++;
    });
  }

  /*Filter Selection Logic - Start*/



  // Build the current selection list (computed on each change)
  get selectedFilters(): SelectedFilter[] {
    const out: SelectedFilter[] = [];

    // Risk chips
    this.filters.risks.forEach(r =>
      out.push({ group: 'Risk', label: r, key: r as 'High' | 'Medium' | 'Low' })
    );

    // Enrollment chips
    this.filters.enroll.forEach(e =>
      out.push({
        group: 'Enrollment',
        label: e,
        key: e as 'Active' | 'Soon Ending' | 'Inactive'
      })
    );

    // Diagnosis (checkbox list via ngModel map)
    Object.entries(this.diagnosisSelection || {}).forEach(([k, v]) => {
      if (v) out.push({ group: 'Diagnosis', label: k, key: k });
    });

    // Quality (checkbox list via ngModel map)
    Object.entries(this.qualitySelection || {}).forEach(([k, v]) => {
      if (v) out.push({ group: 'Quality', label: k, key: k });
    });

    return out;
  }

  // Remove a single pill from the selection bar
  removeSelectedFilter(f: SelectedFilter): void {
    switch (f.group) {
      case 'Risk':
        this.filters.risks.delete(f.key as 'High' | 'Medium' | 'Low');
        break;
      case 'Enrollment':
        this.filters.enroll.delete(f.key as 'Active' | 'Soon Ending' | 'Inactive');
        break;
      case 'Diagnosis':
        if (this.diagnosisSelection) this.diagnosisSelection[f.key] = false;
        break;
      case 'Quality':
        if (this.qualitySelection) this.qualitySelection[f.key] = false;
        break;
    }
    this.applyFilters();
  }

  // Clear all selections at once
  clearAllSelected(): void {
    this.filters.risks.clear();
    this.filters.enroll.clear();
    Object.keys(this.diagnosisSelection || {}).forEach(k => (this.diagnosisSelection[k] = false));
    Object.keys(this.qualitySelection || {}).forEach(k => (this.qualitySelection[k] = false));
    this.applyFilters();
  }
  /*Filter Selection Logic - End*/
}
