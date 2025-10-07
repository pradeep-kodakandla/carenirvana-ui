import { Component, OnDestroy, OnInit } from '@angular/core';
import { finalize, Subject, takeUntil } from 'rxjs';
import {
  MemberalertService,
  MemberAlert,
  UpdateAlertStatusRequest
} from 'src/app/service/memberalert.service';


type SortKey =
  | 'name_asc' | 'name_desc'
  | 'status_asc' | 'status_desc'
  | 'date_desc' | 'date_asc';

@Component({
  selector: 'app-member-alerts',
  templateUrl: './member-alerts.component.html',
  styleUrls: ['./member-alerts.component.css']
})
export class MemberAlertsComponent implements OnInit, OnDestroy {
  // left pane state
  loading = false;
  searchTerm = '';
  showSort = false;
  sortKey: SortKey = 'date_desc';

  // paging
  page = 1;
  pageSize = 25;
  total = 0;

  // data
  items: MemberAlert[] = [];
  filtered: MemberAlert[] = [];
  selectedId?: number;

  // right pane form state
  isFormVisible = false;
  saving = false;

  form: {
    memberAlertId?: number;
    alertStatusId?: number | null;
    dismissedDate?: string | null;
    acknowledgedDate?: string | null;
  } = {};
  selectedAlert?: MemberAlert;

  // supply your memberDetailsIds from outer page or route
  memberDetailsIds: number[] = []; // set from parent or route param

  private destroy$ = new Subject<void>();

  constructor(private api: MemberalertService) { }

  ngOnInit(): void {
    // example: if parent sets memberDetailsIds through @Input, call load() in ngOnChanges
    const sel = Number(sessionStorage.getItem("selectedMemberDetailsId"));
    if (sel && !this.memberDetailsIds.includes(sel)) {
      this.memberDetailsIds.push(sel);
    }
    this.load();
  }

  ngOnDestroy(): void {
    this.destroy$.next(); this.destroy$.complete();
  }

  // --------- LOAD ----------
  load(): void {
    this.loading = true;
    console.log('Loading alerts for memberDetailsIds', this.memberDetailsIds);
    this.api.getAlerts(this.memberDetailsIds, undefined, true, this.page, this.pageSize)
      .pipe(finalize(() => this.loading = false), takeUntil(this.destroy$))
      .subscribe({
        next: res => {
          console.log('Loaded alerts', res);
          this.items = res.items ?? [];
          this.total = res.total ?? 0;
          this.applyFilter(); // refresh filtered after load
          // keep selection consistent
          if (this.selectedId && !this.items.some(x => x.memberAlertId === this.selectedId)) {
            this.cancelForm();
          }
        },
        error: _ => {
          this.items = []; this.filtered = []; this.total = 0;
        }
      });
  }

  // --------- FILTER & SORT ----------
  applyFilter(): void {
    const q = (this.searchTerm || '').trim().toLowerCase();
    const base = q
      ? this.items.filter(a =>
        (a.cfgAlertName ?? '').toLowerCase().includes(q) ||
        (a.alertStatusName ?? '').toLowerCase().includes(q) ||
        (a.alertSourceName ?? '').toLowerCase().includes(q) ||
        (a.memberFirstName ?? '').toLowerCase().includes(q) ||
        (a.memberLastName ?? '').toLowerCase().includes(q))
      : this.items.slice();

    this.filtered = this.sortList(base, this.sortKey);
  }

  applySort(key: SortKey): void {
    this.sortKey = key;
    this.filtered = this.sortList(this.filtered.slice(), key);
  }

  private sortList(list: MemberAlert[], key: SortKey): MemberAlert[] {
    const byName = (a: MemberAlert) =>
      `${a.memberLastName ?? ''},${a.memberFirstName ?? ''},${a.cfgAlertName ?? ''}`.toLowerCase();
    const byStatus = (a: MemberAlert) => `${a.alertStatusName ?? ''}`.toLowerCase();
    const byDate = (a: MemberAlert) => new Date(a.alertDate ?? a.createdOn ?? 0).getTime();

    return list.sort((a, b) => {
      switch (key) {
        case 'name_asc': return byName(a) > byName(b) ? 1 : -1;
        case 'name_desc': return byName(a) < byName(b) ? 1 : -1;
        case 'status_asc': return byStatus(a) > byStatus(b) ? 1 : -1;
        case 'status_desc': return byStatus(a) < byStatus(b) ? 1 : -1;
        case 'date_asc': return byDate(a) - byDate(b);
        default: return byDate(b) - byDate(a); // date_desc
      }
    });
  }

  // --------- PAGING ----------
  nextPage(): void {
    if (this.page * this.pageSize >= this.total) return;
    this.page++; this.load();
  }
  prevPage(): void {
    if (this.page <= 1) return;
    this.page--; this.load();
  }

  // --------- ACTIONS ----------
  trackById(_: number, x: MemberAlert) { return x.memberAlertId; }

  editItem(a: MemberAlert): void {
    this.selectedId = a.memberAlertId;
    this.selectedAlert = a;
    this.isFormVisible = true;
    this.form = {
      memberAlertId: a.memberAlertId,
      alertStatusId: a.alertStatusId ?? null,
      dismissedDate: a.dismissedDate ?? null,
      acknowledgedDate: a.acknowledgedDate ?? null
    };
  }

  openFormForAdd(): void {
    // not creating alerts from UI now; keep to edit-only
    this.isFormVisible = true;
    this.selectedId = undefined;
    this.form = { alertStatusId: null, dismissedDate: null, acknowledgedDate: null };
  }

  cancelForm(): void {
    this.isFormVisible = false;
    this.selectedId = undefined;
    this.form = {};
  }

  // acknowledge sets acknowledgedDate=now, clears dismissedDate
  acknowledge(a: MemberAlert): void {
    const now = new Date().toISOString();
    this.saveStatus(a.memberAlertId, { alertStatusId: this.pickStatusId('Acknowledged', a), acknowledgedDate: now, dismissedDate: null });
  }
  // dismiss sets dismissedDate=now, clears acknowledgedDate
  dismiss(a: MemberAlert): void {
    const now = new Date().toISOString();
    this.saveStatus(a.memberAlertId, { alertStatusId: this.pickStatusId('Dismissed', a), dismissedDate: now, acknowledgedDate: null });
  }
  // clear both dates (keeps status unless you change below)
  clearDates(a: MemberAlert): void {
    this.saveStatus(a.memberAlertId, { alertStatusId: a.alertStatusId ?? null, dismissedDate: null, acknowledgedDate: null });
  }

  // called by form submit button
  saveItem(): void {
    if (!this.form.memberAlertId) return;
    const payload: UpdateAlertStatusRequest = {
      alertStatusId: this.form.alertStatusId ?? null,
      dismissedDate: this.form.dismissedDate ?? null,
      acknowledgedDate: this.form.acknowledgedDate ?? null,
      updatedBy: this.getUserId()
    };
    this.saving = true;
    this.api.updateAlertStatus(this.form.memberAlertId, payload)
      .pipe(finalize(() => this.saving = false), takeUntil(this.destroy$))
      .subscribe({
        next: _ => { this.load(); this.cancelForm(); },
        error: err => console.error('Update failed', err)
      });
  }

  private saveStatus(id: number, p: Partial<UpdateAlertStatusRequest>): void {
    const payload: UpdateAlertStatusRequest = {
      alertStatusId: p.alertStatusId ?? null,
      dismissedDate: p.dismissedDate ?? null,
      acknowledgedDate: p.acknowledgedDate ?? null,
      updatedBy: this.getUserId()
    };
    this.api.updateAlertStatus(id, payload)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: _ => this.load(),
        error: err => console.error('Update failed', err)
      });
  }

  // replace this with your auth service/JWT
  private getUserId(): number { return 1; }

  // simple mapping helper: if you have JSON admin map, you can replace with a lookup
  private pickStatusId(target: 'Acknowledged' | 'Dismissed', a: MemberAlert): number | null {
    // If you already know the numeric IDs, hardcode them here:
    // e.g., Acknowledged = 2, Dismissed = 3
    const map: Record<string, number> = {
      'acknowledged': 2,
      'dismissed': 3
    };
    const key = target.toLowerCase();
    return map[key] ?? (a.alertStatusId ?? null);
  }

  // Convert ISO (UTC) string to the yyyy-MM-ddTHH:mm string that <input type="datetime-local"> expects
  toLocalInputValue(iso: string | null | undefined): string | null {
    if (!iso) return null;
    const d = new Date(iso);
    // Build `yyyy-MM-ddTHH:mm` in local time
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const HH = String(d.getHours()).padStart(2, '0');
    const MM = String(d.getMinutes()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}T${HH}:${MM}`;
  }

  // Handle user typing/picking local time; store as ISO UTC string (or null)
  onAckChange(value: string | null): void {
    this.form.acknowledgedDate = value ? new Date(value).toISOString() : null;
  }

  onDismissChange(value: string | null): void {
    this.form.dismissedDate = value ? new Date(value).toISOString() : null;
  }

}
