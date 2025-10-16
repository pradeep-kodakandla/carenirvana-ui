import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { MemberProgram, MemberprogramService } from 'src/app/service/memberprogram.service';
import { Subscription } from 'rxjs';
import { CrudService } from 'src/app/service/crud.service';
import { firstValueFrom } from 'rxjs';

type AutoKey = 'program' | 'status' | 'reason' | 'referral' | 'assignedTo';

// View model with UI-only display fields
interface MemberProgramView extends MemberProgram {
  _programLabel?: string;
  _statusLabel?: string;
  _statusReasonLabel?: string;
  _referralSourceLabel?: string;
  _assignedToLabel?: string;
  _startEndDisplay?: string;
}

interface AutoStore {
  open: boolean;
  filtered: { id: number | null; label: string }[];
}

@Component({
  selector: 'app-member-program',
  templateUrl: './member-program.component.html',
  styleUrls: ['./member-program.component.css']
})
export class MemberProgramComponent implements OnInit, OnDestroy {

  @Input() memberDetailsId!: number;
  @Input() currentUserId!: number;

  // permissions (tweak as needed)
  canAdd = true;
  canEdit = true;
  canDelete = true;

  // list data
  items: MemberProgram[] = [];
  filtered: (MemberProgram & any)[] = [];
  total = 0;
  loading = false;

  // paging/sorting/filter
  page = 1;
  pageSize = 25;
  sort: string = 'startDate_desc';
  searchTerm = '';

  // selection/form
  selectedId: number | null = null;
  isFormVisible = false;
  saving = false;
  showValidationErrors = false;

  // master lookups (replace with your cfg service or API)
  programs: { id: number; label: string }[] = [];               // cfgProgram
  statuses: { id: number; label: string }[] = [];               // cfgProgramStatus
  reasons: { id: number; label: string; statusId?: number }[] = []; // cfgProgramStatusReason
  referrals: { id: number; label: string }[] = [];               // cfgProgramReferralSource
  users: { id: number; label: string }[] = [];               // securityuserdetail

  // autocomplete stores
  auto: Record<AutoKey, AutoStore> = {
    program: { open: false, filtered: [] },
    status: { open: false, filtered: [] },
    reason: { open: false, filtered: [] },
    referral: { open: false, filtered: [] },
    assignedTo: { open: false, filtered: [] },
  };

  // form model
  form: {
    memberProgramId?: number;
    memberDetailsId?: number;
    programId?: number | null;
    programDisplay?: string;

    programStatusId?: number | null;
    statusDisplay?: string;

    programStatusReasonId?: number | null;
    reasonDisplay?: string;

    programReferralSourceId?: number | null;
    referralDisplay?: string;

    assignedTo?: number | null;
    assignedToDisplay?: string;

    startDate?: string | null;
    endDate?: string | null;
    activeFlag?: boolean | null;

    createdBy?: number;
    updatedBy?: number | null;
  } = {};

  summary = {
    active: 0,
    recentStart: '',
    assignedToMe: 0
  };

  showSort = false;

  private sub?: Subscription;

  constructor(private svc: MemberprogramService, private crud: CrudService) { }

  async ngOnInit(): Promise<void> {
    if (!this.memberDetailsId) {
      this.memberDetailsId = Number(sessionStorage.getItem("selectedMemberDetailsId"));
    }
    this.ensureInputs();
    //this.loadLookups();
    //this.load();
    try {
      await this.loadLookups();  // Wait until done
      this.load();
    } catch (err) {
      console.error('Failed to load lookups', err);
    }
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  // ─────────────────────────── data loads ───────────────────────────

  private ensureInputs() {
    if (!this.memberDetailsId) {
      console.warn('memberDetailsId is required by MemberProgramComponent');
    }
  }

  private async loadLookups() {

    const list = await firstValueFrom(this.crud.getData('cm', 'program'));
    if (!list) return;
    this.programs = list.map(item => ({
      id: Number(item.id),          // convert string to number
      label: item.programName       // map to label
    }));


    const listStatus = await firstValueFrom(this.crud.getData('cm', 'programstatus'));
    if (!listStatus) return;
    this.statuses = listStatus.map(item => ({
      id: Number(item.id),          // convert string to number
      label: item.programStatus       // map to label
    }));



    const listStatusReason = await firstValueFrom(this.crud.getData('cm', 'programstatusreason'));
    if (!listStatusReason) return;
    this.reasons = listStatusReason.map(item => ({
      id: Number(item.id),          // convert string to number
      label: item.programStatusReason       // map to label
    }));


    const listSource = await firstValueFrom(this.crud.getData('cm', 'programreferralsource'));
    if (!listSource) return;
    this.referrals = listSource.map(item => ({
      id: Number(item.id),          // convert string to number
      label: item.programReferralSource       // map to label
    }));


    this.users = [
      { id: this.currentUserId || 1, label: 'Me' },
      { id: 2, label: 'Nurse A' },
      { id: 3, label: 'Nurse B' },
    ];
  }

  load() {
    this.loading = true;
    this.sub = this.svc.list(this.memberDetailsId, this.page, this.pageSize, false)
      .subscribe({
        next: res => {
          this.items = (res.items ?? []).map(x => this.decorate(x));
          this.total = res.total ?? 0;
          this.applyFilter();
          this.computeSummary();
          this.loading = false;
        },
        error: _ => {
          this.items = [];
          this.filtered = [];
          this.total = 0;
          this.loading = false;
        }
      });
  }

  private decorate(x: MemberProgram): MemberProgramView {
    const _programLabel = this.findLabel(this.programs, x.programId);
    const _statusLabel = this.findLabel(this.statuses, x.programStatusId);
    const _statusReasonLabel = this.findLabel(this.reasons, x.programStatusReasonId);
    const _referralSourceLabel = this.findLabel(this.referrals, x.programReferralSourceId);
    const _assignedToLabel = this.findLabel(this.users, x.assignedTo);

    const start = x.startDate ? this.asDate(x.startDate) : null;
    const end = x.endDate ? this.asDate(x.endDate) : null;
    const sd = start ? this.fmt(start) : '—';
    const ed = end ? this.fmt(end) : '—';
    const _startEndDisplay = `${sd} → ${ed}`;

    return { ...x, _programLabel, _statusLabel, _statusReasonLabel, _referralSourceLabel, _assignedToLabel, _startEndDisplay };
  }


  // ─────────────────────────── filter/sort/paging ───────────────────────────

  applyFilter() {
    const t = (this.searchTerm || '').trim().toLowerCase();
    const base: MemberProgramView[] = [...this.items];
    const filtered = !t ? base : base.filter(p =>
      (p._programLabel || '').toLowerCase().includes(t) ||
      (p._statusLabel || '').toLowerCase().includes(t) ||
      (p._statusReasonLabel || '').toLowerCase().includes(t) ||
      (p._assignedToLabel || '').toLowerCase().includes(t) ||
      (p._referralSourceLabel || '').toLowerCase().includes(t)
    );

    this.filtered = this.sortList(filtered, this.sort);
  }


  applySort(sortKey: string) {
    this.sort = sortKey;
    this.filtered = this.sortList(this.filtered, this.sort);
  }

  private sortList(arr: MemberProgramView[], key: string): MemberProgramView[] {
    const [field, dir] = key.split('_');
    const mul = dir === 'desc' ? -1 : 1;

    return [...arr].sort((a, b) => {
      let av: any, bv: any;

      if (field === 'startDate') {
        av = a.startDate ? this.asDate(a.startDate).getTime() : 0;
        bv = b.startDate ? this.asDate(b.startDate).getTime() : 0;
      } else {
        av = ((a as any)[`_${field}`] ?? (a as any)[field] ?? '').toString().toLowerCase();
        bv = ((b as any)[`_${field}`] ?? (b as any)[field] ?? '').toString().toLowerCase();
      }

      if (av < bv) return -1 * mul;
      if (av > bv) return 1 * mul;
      return 0;
    });
  }


  prevPage() { if (this.page > 1) { this.page--; this.load(); } }
  nextPage() { if (this.page * this.pageSize < this.total) { this.page++; this.load(); } }

  // ─────────────────────────── selection / form ───────────────────────────

  openFormForAdd() {
    this.isFormVisible = true;
    this.showValidationErrors = false;
    this.selectedId = null;

    this.form = {
      memberDetailsId: this.memberDetailsId,
      programId: undefined,
      programDisplay: '',
      programStatusId: undefined,
      statusDisplay: '',
      programStatusReasonId: undefined,
      reasonDisplay: '',
      programReferralSourceId: undefined,
      referralDisplay: '',
      assignedTo: this.currentUserId ?? null,
      assignedToDisplay: this.findLabel(this.users, this.currentUserId) || '',
      startDate: this.todayDateOnly(),
      endDate: null,
      activeFlag: true,
      createdBy: this.currentUserId
    };

    this.resetAutos();
  }

  editProgram(p: MemberProgram & any) {
    this.isFormVisible = true;
    this.showValidationErrors = false;
    this.selectedId = p.memberProgramId;

    this.form = {
      memberProgramId: p.memberProgramId,
      memberDetailsId: p.memberDetailsId,
      programId: p.programId,
      programDisplay: p._programLabel || '',
      programStatusId: p.programStatusId,
      statusDisplay: p._statusLabel || '',
      programStatusReasonId: p.programStatusReasonId ?? null,
      reasonDisplay: p._statusReasonLabel || '',
      programReferralSourceId: p.programReferralSourceId ?? null,
      referralDisplay: p._referralSourceLabel || '',
      assignedTo: p.assignedTo ?? null,
      assignedToDisplay: p._assignedToLabel || '',
      startDate: this.toDateOnly(p.startDate),
      endDate: this.toDateOnly(p.endDate),
      activeFlag: p.activeFlag ?? true,
      updatedBy: this.currentUserId
    };

    this.resetAutos();
  }

  cancelForm() {
    this.isFormVisible = false;
    this.selectedId = null;
    this.showValidationErrors = false;
  }

  saveProgram() {
    this.showValidationErrors = true;

    if (!this.form.memberDetailsId) this.form.memberDetailsId = this.memberDetailsId;

    // basic requireds
    if (!this.form.programId || !this.form.programStatusId || !this.form.startDate) return;

    this.saving = true;

    // build payload for service
    const payload: any = {
      memberProgramId: this.form.memberProgramId ?? 0,
      memberDetailsId: this.form.memberDetailsId,
      programId: this.form.programId,
      memberEnrollmentId: null, // plug in if you have it in your shell
      programStatusId: this.form.programStatusId,
      programStatusReasonId: this.form.programStatusReasonId ?? null,
      programReferralSourceId: this.form.programReferralSourceId ?? null,
      assignedTo: this.form.assignedTo ?? null,
      startDate: this.form.startDate,
      endDate: this.form.endDate ?? null,
      activeFlag: this.form.activeFlag ?? true,
      createdBy: this.form.createdBy ?? this.currentUserId,
      updatedBy: this.form.updatedBy ?? this.currentUserId
    };
    console.log('saving member program', payload);

    if (this.form.memberProgramId) {
      this.svc.update(payload).subscribe({
        next: () => {
          this.saving = false;
          this.isFormVisible = false;
          this.load();
        },
        error: () => { this.saving = false; }
      });
    } else {
      this.svc.create(payload).subscribe({
        next: () => {
          this.saving = false;
          this.isFormVisible = false;
          this.load();
        },
        error: () => { this.saving = false; }
      });
    }
  }

  deleteProgram(p: MemberProgram) {
    if (!p.memberProgramId) return;
    if (!confirm('Delete this program?')) return;

    this.svc.delete(p.memberProgramId, this.currentUserId).subscribe({
      next: _ => this.load(),
      error: _ => { }
    });
  }

  // ─────────────────────────── autocomplete helpers ───────────────────────────

  resetAutos() {
    (['program', 'status', 'reason', 'referral', 'assignedTo'] as AutoKey[]).forEach(k => {
      this.auto[k].open = false;
      this.auto[k].filtered = [];
    });
  }

  openDropdown(key: AutoKey) {
    this.auto[key].open = true;
    this.filterOptions(key);
  }

  onAutoBlur(key: AutoKey) {
    // close with slight delay to allow mousedown select
    setTimeout(() => this.auto[key].open = false, 150);
  }

  filterOptions(key: AutoKey) {
    const val = (this.form as any)[key + 'Display']?.toLowerCase() || '';
    let source: { id: number; label: string }[] = [];

    switch (key) {
      case 'program': source = this.programs; break;
      case 'status': source = this.statuses; break;
      case 'reason':
        // if you want reason to depend on selected status:
        source = this.form.programStatusId ? this.reasons.filter(r => !r.statusId || r.statusId === this.form.programStatusId) : this.reasons;
        break;
      case 'referral': source = this.referrals; break;
      case 'assignedTo': source = this.users; break;
    }

    const filtered = source
      .filter(x => x.label.toLowerCase().includes(val))
      .slice(0, 50)
      .map(x => ({ id: x.id, label: x.label }));

    this.auto[key].filtered = filtered;
  }

  selectAuto(key: AutoKey, opt: { id: number | null; label: string }) {
    (this.form as any)[key + 'Display'] = opt.label;

    switch (key) {
      case 'program': this.form.programId = opt.id ?? null; break;
      case 'status': this.form.programStatusId = opt.id ?? null; break;
      case 'reason': this.form.programStatusReasonId = opt.id ?? null; break;
      case 'referral': this.form.programReferralSourceId = opt.id ?? null; break;
      case 'assignedTo': this.form.assignedTo = opt.id ?? null; break;
    }

    // close dropdown
    this.auto[key].open = false;

    // if status changed, recompute reasons list
    if (key === 'status') this.filterOptions('reason');
  }

  // ─────────────────────────── misc ───────────────────────────

  trackById = (_: number, x: MemberProgram) => x.memberProgramId;

  isCompleted(p: MemberProgram) {
    // a simple heuristic for green dot
    return !!p.endDate || (p.programStatusId && this.findLabel(this.statuses, p.programStatusId) === 'Closed');
    // adjust to your real logic
  }

  computeSummary() {
    this.summary.active = this.items.filter(x => x.activeFlag ?? true).length;

    const recent = [...this.items].sort((a, b) => {
      const at = a.startDate ? this.asDate(a.startDate).getTime() : 0;
      const bt = b.startDate ? this.asDate(b.startDate).getTime() : 0;
      return bt - at;
    })[0];

    this.summary.recentStart = recent?.startDate ? this.fmt(this.asDate(recent.startDate)) : '';

    const me = this.currentUserId;
    this.summary.assignedToMe = me ? this.items.filter(x => x.assignedTo === me).length : 0;
  }

  // date helpers
  private asDate(v: string | Date) { return (typeof v === 'string') ? new Date(v) : v; }
  private pad(n: number) { return String(n).padStart(2, '0'); }
  private fmt(d: Date) { return `${d.getFullYear()}-${this.pad(d.getMonth() + 1)}-${this.pad(d.getDate())}`; } // YYYY-MM-DD
  private toDateOnly(v: string | Date | null | undefined) { if (!v) return null; const d = this.asDate(v); return this.fmt(d); }
  private todayDateOnly() { const d = new Date(); return this.fmt(d); }

  private findLabel(arr: { id: number; label: string }[] | { id: number; label: string; statusId?: number }[], id: any) {
    if (id == null) return '';
    return (arr as any[]).find(x => x.id === id)?.label || '';
  }


}
