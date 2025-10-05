import { Component, Input, OnInit } from '@angular/core';
import { MemberrelationService, MemberCareStaffView, MemberCareStaffCreateRequest, MemberCareStaffUpdateRequest, PagedResult } from 'src/app/service/memberrelation.service';
import { finalize } from 'rxjs/operators';

@Component({
  selector: 'app-member-careteam',
  templateUrl: './member-careteam.component.html',
  styleUrls: ['./member-careteam.component.css']
})
export class MemberCareteamComponent implements OnInit {
  @Input() memberDetailsId!: number;    // pass from parent member shell

  // list state
  loading = false;
  items: MemberCareStaffView[] = [];
  filtered: MemberCareStaffView[] = [];
  searchTerm = '';
  sortKey: 'userName_asc' | 'userName_desc' | 'roleName_asc' | 'roleName_desc' | 'isPrimary_desc' = 'userName_asc';
  showSort = false;

  // paging
  page = 1;
  pageSize = 10;
  total = 0;

  // selection/edit state
  selectedId: number | null = null;
  isFormVisible = false;
  saving = false;
  showValidationErrors = false;

  // permissions (wire to your auth as needed)
  canAdd = true;
  canEdit = true;
  canDelete = true;

  // form model (covers both create & update)
  form: any = {
    memberCareStaffId: null as number | null,
    memberDetailsId: null as number | null,
    userId: null as number | null,
    roleId: null as number | null,
    isPrimary: false as boolean,
    activeFlag: true as boolean
  };

  summary = { primary: 0, active: 0 };

  constructor(private api: MemberrelationService) { }

  ngOnInit(): void {
    if (!this.memberDetailsId) {
      this.memberDetailsId = Number(sessionStorage.getItem("selectedMemberDetailsId"));
    }
    this.load();
  }

  private load(): void {
    this.loading = true;
    this.api.listCareTeam({
      memberDetailsId: this.memberDetailsId,
      page: this.page,
      pageSize: this.pageSize,
      includeInactive: true
    })
      .pipe(finalize(() => this.loading = false))
      .subscribe((res: any) => {
        // 👇 normalize server vs client shapes
        const items = res?.Items ?? res?.items ?? [];
        const total = res?.Total ?? res?.totalCount ?? 0;

        this.items = items;
        this.total = total;

        this.applyFilter();
        this.computeSummary();
      }, _ => {
        this.items = [];
        this.filtered = [];
        this.total = 0;
      });
  }


  // ---------- list helpers ----------
  applyFilter(): void {
    const needle = (this.searchTerm || '').toLowerCase();
    this.filtered = (this.items || []).filter(x => {
      const name = (x.userName || '').toLowerCase();
      const role = (x.roleName || '').toLowerCase();
      return !needle || name.includes(needle) || role.includes(needle) || String(x.userId).includes(needle);
    });
    this.applySort(this.sortKey, /*skipAssign*/ true);
  }

  applySort(key: typeof this.sortKey, skipAssign = false): void {
    const arr = this.filtered || [];
    const by = (k: keyof MemberCareStaffView) => (a: any, b: any) => (String(a[k] || '').localeCompare(String(b[k] || '')));
    const byBoolDesc = (k: keyof MemberCareStaffView) => (a: any, b: any) => (Number(!!b[k]) - Number(!!a[k]));

    switch (key) {
      case 'userName_asc': arr.sort(by('userName')); break;
      case 'userName_desc': arr.sort((a, b) => -by('userName')(a, b)); break;
      case 'roleName_asc': arr.sort(by('roleName')); break;
      case 'roleName_desc': arr.sort((a, b) => -by('roleName')(a, b)); break;
      case 'isPrimary_desc': arr.sort(byBoolDesc('isPrimary')); break;
    }
    if (!skipAssign) this.sortKey = key;
  }

  trackById = (_: number, x: MemberCareStaffView) => x.memberCareStaffId;

  prevPage(): void { if (this.page > 1) { this.page--; this.load(); } }
  nextPage(): void { if (this.page * this.pageSize < this.total) { this.page++; this.load(); } }

  // ---------- CRUD ----------
  openFormForAdd(): void {
    this.isFormVisible = true;
    this.showValidationErrors = false;
    this.selectedId = null;
    this.form = {
      memberCareStaffId: null,
      memberDetailsId: this.memberDetailsId,
      userId: null,
      roleId: null,
      isPrimary: false,
      activeFlag: true
    };
  }

  editItem(row: MemberCareStaffView): void {
    this.selectedId = row.memberCareStaffId;
    this.isFormVisible = true;
    this.showValidationErrors = false;
    this.form = {
      memberCareStaffId: row.memberCareStaffId,
      memberDetailsId: row.memberDetailsId,
      userId: row.userId,
      roleId: (row as any).roleId ?? null,   // depends on your backend view; safe fallback
      isPrimary: !!row.isPrimary,
      activeFlag: row.activeFlag !== false
    };
  }

  cancelForm(): void {
    this.isFormVisible = false;
    this.selectedId = null;
  }

  saveItem(): void {
    this.showValidationErrors = true;
    if (!this.form.userId || !this.memberDetailsId) return;

    this.saving = true;

    if (!this.form.memberCareStaffId) {
      // CREATE
      const req: MemberCareStaffCreateRequest = {
        memberDetailsId: this.memberDetailsId,
        userId: Number(this.form.userId),
        roleId: this.form.roleId ? Number(this.form.roleId) : undefined,
        isPrimary: !!this.form.isPrimary,
        createdBy: this.getUserIdOrNull() ?? undefined,
      };
      this.api.createCareTeam(req)
        .pipe(finalize(() => this.saving = false))
        .subscribe(_ => {
          this.isFormVisible = false;
          this.load();
        });
    } else {
      // UPDATE
      const req: MemberCareStaffUpdateRequest = {
        userId: this.form.userId ? Number(this.form.userId) : undefined,
        roleId: this.form.roleId ? Number(this.form.roleId) : undefined,
        isPrimary: this.form.isPrimary,
        updatedBy: this.getUserIdOrNull() ?? undefined
      };
      this.api.updateCareTeam(this.form.memberCareStaffId, req)
        .pipe(finalize(() => this.saving = false))
        .subscribe(_ => {
          this.isFormVisible = false;
          this.load();
        });
    }
  }

  deleteItem(row: MemberCareStaffView): void {
    if (!row?.memberCareStaffId) return;
    const deletedBy = this.getUserIdOrNull() ?? undefined;
    this.api.deleteCareTeam(row.memberCareStaffId, deletedBy)
      .subscribe(_ => this.load());
  }

  // ---------- misc ----------
  private getUserIdOrNull(): number | null {
    const v = sessionStorage.getItem('loggedInUserid');
    const n = v ? Number(v) : NaN;
    return Number.isFinite(n) ? n : null;
  }

  private computeSummary(): void {
    const list = this.items || [];
    this.summary.primary = list.filter(x => x.isPrimary).length;
    this.summary.active = list.filter(x => x.activeFlag !== false).length;
  }
}
