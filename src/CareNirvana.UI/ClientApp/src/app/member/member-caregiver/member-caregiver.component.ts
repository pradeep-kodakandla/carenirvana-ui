import { Component, Input, OnInit } from '@angular/core';
import { finalize } from 'rxjs/operators';
import { MemberrelationService, MemberCaregiverDto, MemberCaregiver } from 'src/app/service/memberrelation.service';

@Component({
  selector: 'app-member-caregiver',
  templateUrl: './member-caregiver.component.html',
  styleUrls: ['./member-caregiver.component.css']
})
export class MemberCaregiverComponent implements OnInit {
  @Input() memberDetailsId!: number;

  loading = false;
  items: MemberCaregiverDto[] = [];
  filtered: MemberCaregiverDto[] = [];
  searchTerm = '';
  showSort = false;
  sortKey: 'name_asc' | 'name_desc' | 'isPrimary_desc' | 'active_desc' = 'name_asc';

  // pagination (client-side for now)
  page = 1;
  pageSize = 10;
  total = 0;

  // form/edit state
  selectedId: number | null = null;
  isFormVisible = false;
  saving = false;
  showValidationErrors = false;

  // permissions (hook to your RBAC as needed)
  canAdd = true;
  canEdit = true;
  canDelete = true;

  // flattened form (matches backend caregiver)
  form: MemberCaregiver = {
    memberCaregiverId: undefined,
    memberDetailsId: undefined,
    caregiverFirstName: '',
    caregiverLastName: '',
    caregiverMiddleName: '',
    primaryEmail: '',
    isPrimary: false,
    isHealthcareProxy: false,
    isFormalCaregiver: false,
    activeFlag: true
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
    this.api.getCaregiversByMember(this.memberDetailsId)
      .pipe(finalize(() => this.loading = false))
      .subscribe((list: MemberCaregiverDto[]) => {
        this.items = Array.isArray(list) ? list : [];
        this.total = this.items.length;
        this.applyFilter();
        this.computeSummary();
      }, _ => {
        this.items = [];
        this.filtered = [];
        this.total = 0;
      });
  }

  // ------------- list helpers -------------
  applyFilter(): void {
    const n = (this.searchTerm || '').toLowerCase();
    const pageStart = (this.page - 1) * this.pageSize;
    const pageEnd = pageStart + this.pageSize;

    // filter
    const filtered = (this.items || []).filter(dto => {
      const c = dto.caregiver || {};
      const name = this.fullName(c).toLowerCase();
      const email = (c.primaryEmail || '').toLowerCase();
      return !n || name.includes(n) || email.includes(n);
    });

    // sort
    this.sortInternal(filtered, this.sortKey);

    // paginate
    this.filtered = filtered.slice(pageStart, pageEnd);
  }

  applySort(key: typeof this.sortKey): void {
    this.sortKey = key;
    this.applyFilter();
  }

  private sortInternal(arr: MemberCaregiverDto[], key: typeof this.sortKey) {
    const nameOf = (c: MemberCaregiver) => `${c.caregiverLastName || ''}, ${c.caregiverFirstName || ''}`.trim();
    switch (key) {
      case 'name_asc': arr.sort((a, b) => nameOf(a.caregiver!).localeCompare(nameOf(b.caregiver!))); break;
      case 'name_desc': arr.sort((a, b) => nameOf(b.caregiver!).localeCompare(nameOf(a.caregiver!))); break;
      case 'isPrimary_desc': arr.sort((a, b) => Number(!!b.caregiver?.isPrimary) - Number(!!a.caregiver?.isPrimary)); break;
      case 'active_desc': arr.sort((a, b) => Number(b.caregiver?.activeFlag !== false) - Number(a.caregiver?.activeFlag !== false)); break;
    }
  }

  trackById = (_: number, dto: MemberCaregiverDto) => dto.caregiver?.memberCaregiverId;

  prevPage(): void { if (this.page > 1) { this.page--; this.applyFilter(); } }
  nextPage(): void { if (this.page * this.pageSize < this.total) { this.page++; this.applyFilter(); } }

  // ------------- CRUD -------------
  openFormForAdd(): void {
    this.isFormVisible = true;
    this.showValidationErrors = false;
    this.selectedId = null;
    this.form = {
      memberCaregiverId: undefined,
      memberDetailsId: this.memberDetailsId,
      caregiverFirstName: '',
      caregiverLastName: '',
      caregiverMiddleName: '',
      primaryEmail: '',
      isPrimary: false,
      isHealthcareProxy: false,
      isFormalCaregiver: false,
      activeFlag: true
    };
  }

  editItem(dto: MemberCaregiverDto): void {
    const c = dto.caregiver!;
    this.selectedId = c.memberCaregiverId ?? null;
    this.isFormVisible = true;
    this.showValidationErrors = false;

    this.form = {
      memberCaregiverId: c.memberCaregiverId,
      memberDetailsId: c.memberDetailsId ?? this.memberDetailsId,
      caregiverFirstName: c.caregiverFirstName || '',
      caregiverLastName: c.caregiverLastName || '',
      caregiverMiddleName: c.caregiverMiddleName || '',
      primaryEmail: c.primaryEmail || '',
      isPrimary: !!c.isPrimary,
      isHealthcareProxy: !!c.isHealthcareProxy,
      isFormalCaregiver: !!c.isFormalCaregiver,
      activeFlag: c.activeFlag !== false
    };
  }

  cancelForm(): void {
    this.isFormVisible = false;
    this.selectedId = null;
  }

  saveItem(): void {
    this.showValidationErrors = true;
    if (!this.form.caregiverFirstName || !this.form.caregiverLastName) return;

    this.saving = true;

    if (!this.form.memberCaregiverId) {
      // CREATE
      const payload: MemberCaregiver = { ...this.form, createdBy: this.getUserIdOrUndefined() };
      this.api.createCaregiver(payload)
        .pipe(finalize(() => this.saving = false))
        .subscribe(_ => { this.isFormVisible = false; this.load(); });
    } else {
      // UPDATE
      const id = this.form.memberCaregiverId!;
      const payload: MemberCaregiver = { ...this.form, updatedBy: this.getUserIdOrUndefined() };
      this.api.updateCaregiver(id, payload)
        .pipe(finalize(() => this.saving = false))
        .subscribe(_ => { this.isFormVisible = false; this.load(); });
    }
  }

  deleteItem(dto: MemberCaregiverDto): void {
    const id = dto?.caregiver?.memberCaregiverId;
    if (!id) return;
    const deletedBy = this.getUserIdOrUndefined();
    // our service expects a number; default to 0 when not present
    this.api.deleteCaregiver(id, Number(deletedBy ?? 0))
      .subscribe(_ => this.load());
  }

  // ------------- misc -------------
  fullName(c?: MemberCaregiver): string {
    if (!c) return '';
    const a = [c.caregiverFirstName, c.caregiverMiddleName, c.caregiverLastName].filter(Boolean);
    return a.join(' ').trim();
  }

  private getUserIdOrUndefined(): number | undefined {
    const v = sessionStorage.getItem('loggedInUserid');
    const n = v ? Number(v) : NaN;
    return Number.isFinite(n) ? n : undefined;
  }

  private computeSummary(): void {
    const list = (this.items || []).map(x => x.caregiver || {});
    this.summary.primary = list.filter(x => x.isPrimary).length;
    this.summary.active = list.filter(x => x.activeFlag !== false).length;
  }
}
