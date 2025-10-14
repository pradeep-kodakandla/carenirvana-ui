import { Component, OnInit } from '@angular/core';
import { MemberenrollmentService } from 'src/app/service/memberenrollment.service';

type StatusFilter = 'Active' | 'Inactive' | 'All';

export interface MemberEnrollment {
  levelMap: Record<string, string>;
  startDate?: string | null;
  endDate?: string | null;
  status?: string | null;         // if your API uses ActiveFlag instead, we map it below
  activeFlag?: boolean | null;
}

@Component({
  selector: 'app-member-enrollment',
  templateUrl: './member-enrollment.component.html',
  styleUrls: ['./member-enrollment.component.css']
})
export class MemberEnrollmentComponent implements OnInit {
  // raw + filtered lists
  enrollments: MemberEnrollment[] = [];
  filtered: MemberEnrollment[] = [];

  // ui state
  searchText = '';
  //statusFilter: StatusFilter = 'Active';
  statusFilter: 'Active' | 'Inactive' | 'All' = 'Active';

  constructor(
    private memberEnrollment: MemberenrollmentService
  ) { }

  ngOnInit(): void {
    // Keep your original call pattern; just wire setMemberEnrollments(...)
    // Example using your snippet:
    this.memberEnrollment.getMemberEnrollment(Number(sessionStorage.getItem("selectedMemberDetailsId"))).subscribe(
      (data) => {
        console.log('Fetched member enrollment data:', data);
        if (data) this.setMemberEnrollments(data);
      },
      (error) => console.error('Error fetching member enrollment data:', error)
    );
  }

  /** Call this from your subscription, pass the API payload directly */
  setMemberEnrollments(data: any): void {
    const items = Array.isArray(data) ? data
      : Array.isArray(data?.items) ? data.items
        : data ? [data] : [];

    const normalized: MemberEnrollment[] = items.map((row: any) => {
      // parse level_map
      let levelMap: Record<string, string> = {};
      const raw = row.level_map ?? row.LevelMap ?? row.levelMap ?? null;
      if (raw) {
        if (typeof raw === 'string') {
          try { levelMap = JSON.parse(raw); } catch { levelMap = {}; }
        } else if (typeof raw === 'object') {
          levelMap = raw;
        }
      }

      // normalize fields (Pascal, camel, snake)
      const startDate = row.startDate ?? row.StartDate ?? row.start_date ?? null;
      const endDate = row.endDate ?? row.EndDate ?? row.end_date ?? null;

      // status can be boolean or text
      let status: string | null = null;
      if (typeof row.status === 'string') status = row.status;
      else if (typeof row.Status === 'string') status = row.Status;
      else if (typeof row.status === 'boolean') status = row.status ? 'Active' : 'Inactive';
      else if (typeof row.Status === 'boolean') status = row.Status ? 'Active' : 'Inactive';

      const activeFlag = (status === 'Active');

      return {
        levelMap,
        startDate,
        endDate,
        status,
        activeFlag
      };
    });

    this.enrollments = normalized;
    this.applyAllFilters();
  }


  onSearchChange(value: string) {
    this.searchText = value ?? '';
    this.applyAllFilters();
  }

  onStatusFilterChange(value: 'Active' | 'Inactive' | 'All' | string) {
    this.statusFilter = (value as any);
    this.applyAllFilters();
  }

  private applyAllFilters() {
    const term = (this.searchText || '').toLowerCase().trim();

    const byStatus = (m: MemberEnrollment) => {
      if (this.statusFilter === 'All') return true;
      console.log('Filtering by status:', this.statusFilter, m);
      // use explicit status label first; fallback to activeFlag
      const statusLabel = (m.status ?? '').toLowerCase();
      const isActive =
        statusLabel ? ['active', 'inactive', 'open'].some(s => statusLabel == s)
          : (m.activeFlag === true);
      console.log('Determined isActive:', isActive, 'from statusLabel:', statusLabel, 'and activeFlag:', m.activeFlag);
      return this.statusFilter === 'Active' ? isActive : !isActive;
    };

    const bySearch = (m: MemberEnrollment) => {
      if (!term) return true;
      const hay = [
        ...Object.entries(m.levelMap || {}).map(([k, v]) => `${k} ${v}`),
        m.status ?? '',
        m.startDate ?? '',
        m.endDate ?? ''
      ].join(' ').toLowerCase();
      return hay.includes(term);
    };

    this.filtered = this.enrollments.filter(e => byStatus(e) && bySearch(e));
  }

  // Helpers for template
  getLevelPairs(m: MemberEnrollment): Array<{ key: string; val: string }> {
    if (!m?.levelMap) return [];
    return Object.entries(m.levelMap)
      .filter(([_, v]) => v != null && String(v).trim() !== '')
      .map(([key, val]) => ({ key, val: String(val) }));
  }

  displayStatus(m: MemberEnrollment): string {
    // prefer status string if present; otherwise derive from activeFlag
    if (!m) return '';
    const today = new Date();
    const endDate = m.endDate ? new Date(m.endDate) : new Date('2999-12-31');

    return endDate >= today ? 'Active' : 'Inactive';
  }

  statusClass(m: MemberEnrollment): string {
    const s = this.displayStatus(m).toLowerCase();
    if (s.includes('inactive') || s.includes('closed') || s.includes('terminated')) return 'status-badge inactive';
    return 'status-badge active';
  }
}
