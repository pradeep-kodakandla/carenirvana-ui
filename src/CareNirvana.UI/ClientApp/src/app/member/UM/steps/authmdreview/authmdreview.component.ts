import { Component, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { CrudService } from 'src/app/service/crud.service';
import { AuthenticateService } from 'src/app/service/authentication.service';
import { AuthService } from 'src/app/service/auth.service';

import { UiSmartOption } from 'src/app/shared/ui/uismartdropdown/uismartdropdown.component';
import { of, Subject } from 'rxjs';
import { catchError, takeUntil } from 'rxjs/operators';
import { AuthDetailApiService } from 'src/app/service/authdetailapi.service';

export interface MdReviewLine {
  decisionLineId?: number | null;
  serviceCode: string;
  serviceDescription: string;
  modifier?: string;
  unitType?: string;
  fromDate?: string;
  toDate?: string;
  requested?: number | string | null;
  approved?: number | string | null;
  denied?: number | string | null;
  // UI
  selected?: boolean;
  initialRecommendation?: string;
}

type AssignmentType = 'Specific Medical Director' | 'Work Basket Assignment';

@Component({
  selector: 'app-authmdreview',
  templateUrl: './authmdreview.component.html',
  styleUrls: ['./authmdreview.component.css']
})
export class AuthmdreviewComponent implements OnDestroy {
  private destroy$ = new Subject<void>();

  // context-driven
  authDetailId: number | null = null;

  // service lines derived from auth saved data
  serviceLines: MdReviewLine[] = [];

  // form
  mdrForm: FormGroup;
  showWorkBasketFields = false;

  // dropdown options (UiSmartOption)
  assignmentTypeOptions: UiSmartOption[] = [
    { value: 'Specific Medical Director', label: 'Specific Medical Director' },
    { value: 'Work Basket Assignment', label: 'Work Basket Assignment' }
  ];

  priorities: UiSmartOption[] = [
    { value: 1, label: 'High' },
    { value: 2, label: 'Routine' },
    { value: 3, label: 'Low' }
  ];

  activityTypeOptions: UiSmartOption[] = [{ value: '', label: 'Select' }];
  userOptions: UiSmartOption[] = [{ value: '', label: 'Select' }];

  // workbasket options (optional)
  workBasketOptions: UiSmartOption[] = [{ value: '', label: 'Select' }];
  workBasketUserOptions: UiSmartOption[] = [{ value: '', label: 'Select' }];

  // recommendation options
  recommendationOptions: UiSmartOption[] = [
    { value: 'Approve', label: 'Approve' },
    { value: 'Deny', label: 'Deny' },
    { value: 'Pend', label: 'Pend' },
    { value: 'Partially Approve', label: 'Partially Approve' },
    { value: 'Void', label: 'Void' }
  ];

  // existing activities list (same as mdreview)
  existingActivities: any[] = [];

  constructor(
    private fb: FormBuilder,
    private crudService: CrudService,
    private authenticateService: AuthenticateService,
    private activityService: AuthService,
    private authApi: AuthDetailApiService
  ) {
    this.mdrForm = this.fb.group({
      assignmentType: ['Specific Medical Director' as AssignmentType, Validators.required],
      activityType: ['', Validators.required],
      priority: [2, Validators.required],
      assignTo: [null],

      workBasket: [null],
      workBasketUser: [null],

      scheduledDateTime: [null],
      dueDateTime: [null],

      recommendation: ['', Validators.required],
      notes: ['']
    });

    this.mdrForm.get('assignmentType')
      ?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe((v: AssignmentType) => {
        this.applyAssignmentTypeSideEffects(v);
      });
  }

  private safeParseJson(raw: any): any | null {
    if (raw == null || raw === '') return null;
    try {
      return typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch {
      return null;
    }
  }

  private loadServiceLinesFromApi(authDetailId: number): void {
    if (!authDetailId) return;

    this.authApi.getById(authDetailId)
      .pipe(
        takeUntil(this.destroy$),
        catchError((err) => {
          console.error('MDReview: getById failed', err);
          return of(null);
        })
      )
      .subscribe((auth: any) => {
        // auth.dataJson is often a JSON string (AuthDecision parses it this way)
        const top = this.safeParseJson(auth?.dataJson ?? auth?.jsonData) ?? auth?.data ?? auth ?? null;

        // sometimes the object contains another nested jsonData/dataJson string
        const normalized =
          top && typeof top === 'object'
            ? (this.safeParseJson((top as any).dataJson ?? (top as any).jsonData) ?? top)
            : top;

        const lines = this.buildServiceLinesFromAuthData(normalized);

        this.serviceLines = (lines ?? []).map(l => ({
          ...l,
          selected: true,
          initialRecommendation: l.initialRecommendation ?? ''
        }));
      });
  }

  /** Wizard shell will call this if present */
  setContext(ctx: any): void {
    // Always accept authDetailId
    const id = Number(ctx?.authDetailId ?? ctx?.authdetailid ?? ctx?.authDetailID);
    this.authDetailId = Number.isFinite(id) ? id : null;

    // try to derive service lines from whatever the shell provides
    const rawData =
      ctx?.authData?.data ??
      ctx?.authData ??
      ctx?.authSavedData?.data ??
      ctx?.authSavedData ??
      ctx?.data ??
      null;

   /* this.serviceLines = this.buildServiceLinesFromAuthData(rawData);*/

    if (Array.isArray(ctx?.serviceLines) && ctx.serviceLines.length) {
      this.serviceLines = ctx.serviceLines.map((l:any) => ({ ...l, selected: true }));
    } else {
      const rawCandidate =
        ctx?.authData?.jsonData ?? ctx?.authData?.dataJson ?? ctx?.authData?.data ?? ctx?.authData ??
        ctx?.authSavedData?.jsonData ?? ctx?.authSavedData?.dataJson ?? ctx?.authSavedData?.data ?? ctx?.authSavedData ??
        ctx?.jsonData ?? ctx?.dataJson ?? ctx?.data ?? null;

      const parsedTop = this.safeParseJson(rawCandidate) ?? rawCandidate;
      const parsed =
        (parsedTop && typeof parsedTop === 'object')
          ? (this.safeParseJson(parsedTop.jsonData ?? parsedTop.dataJson) ?? parsedTop)
          : parsedTop;

      this.serviceLines = this.buildServiceLinesFromAuthData(parsed);

      if (!this.serviceLines?.length && this.authDetailId) {
        this.loadServiceLinesFromApi(this.authDetailId);
      }
    }

    // if shell provided serviceLines explicitly, use them
    if (Array.isArray(ctx?.serviceLines) && ctx.serviceLines.length) {
      this.serviceLines = (ctx.serviceLines as MdReviewLine[]).map(l => ({
        ...l,
        selected: true,
        initialRecommendation: l.initialRecommendation ?? ''
      }));
    }

    // select all by default (same UX as decision -> mdreview)
    this.selectAllLines(true);

    // load dropdowns + activities
    this.loadActivityTypes();
    this.loadUsers();
    this.loadMdReviewActivities();

    // apply side effects once
    this.applyAssignmentTypeSideEffects(this.mdrForm.get('assignmentType')?.value);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ----------------- UI helpers -----------------

  toggleLine(line: MdReviewLine, checked: boolean): void {
    line.selected = checked;
  }

  selectAllLines(checked: boolean): void {
    this.serviceLines = (this.serviceLines ?? []).map(l => ({ ...l, selected: checked }));
  }

  get hasSelectedLines(): boolean {
    return (this.serviceLines ?? []).some(l => !!l.selected);
  }

  private applyAssignmentTypeSideEffects(v: AssignmentType): void {
    this.showWorkBasketFields = (v === 'Work Basket Assignment');

    if (!this.showWorkBasketFields) {
      this.mdrForm.get('workBasket')?.setValue(null);
      this.mdrForm.get('workBasketUser')?.setValue(null);
    } else {
      // optional: load work basket options from datasource if your env supports it
      this.loadWorkBasketOptions();
    }
  }

  // ----------------- dropdown loading -----------------

  private loadActivityTypes(): void {
    this.crudService.getData('um', 'activitytype')
      .pipe(takeUntil(this.destroy$))
      .subscribe((data: any[]) => {
        const options = (data ?? []).map(item => ({
          value: item.code ?? item.value ?? item.id,
          label: item.label ?? item.activityType ?? item.display ?? item.name ?? String(item.code ?? item.id ?? '')
        })) as UiSmartOption[];

        this.activityTypeOptions = [{ value: '', label: 'Select' }, ...options];
      });
  }

  private loadUsers(): void {
    this.authenticateService.getAllUsers()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (users: any[]) => {
          this.userOptions = [{ value: '', label: 'Select' }, ...(users ?? []).map(u => ({
            value: u.UserId ?? u.userId ?? u.id,
            label: u.UserName ?? u.userName ?? u.name
          })) as UiSmartOption[]];

          // default assignTo: logged in user if present
          const loggedInUsername = sessionStorage.getItem('loggedInUsername');
          const match = this.userOptions.find(o => o.label === loggedInUsername);
          if (match && match.value !== '') {
            this.mdrForm.get('assignTo')?.setValue(match.value);
          }
        },
        error: () => {
          this.userOptions = [{ value: '', label: 'Select' }];
        }
      });
  }

  private loadWorkBasketOptions(): void {
    // If you already have a datasource in your system for work baskets, plug it here.
    // Leaving as safe no-op so the component still works for Specific Medical Director.
    // Example if you have: this.crudService.getData('um','workbasket') ...
  }

  // ----------------- activities -----------------

  private loadMdReviewActivities(): void {
    if (!this.authDetailId) {
      this.existingActivities = [];
      return;
    }

    // mdreview uses activityService.getMdReviewActivities(authDetailId)
    const svc: any = this.activityService as any;
    if (typeof svc.getMdReviewActivities !== 'function') {
      this.existingActivities = [];
      return;
    }

    svc.getMdReviewActivities(this.authDetailId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (rows: any[]) => {
          this.existingActivities = rows ?? [];
        },
        error: () => {
          this.existingActivities = [];
        }
      });
  }

  // ----------------- save -----------------

  submitReview(): void {
    if (!this.authDetailId) {
      alert('AuthDetailId is missing in context.');
      return;
    }

    if (this.mdrForm.invalid) {
      this.mdrForm.markAllAsTouched();
      return;
    }

    const selectedLines = (this.serviceLines ?? []).filter(l => !!l.selected);
    if (!selectedLines.length) {
      alert('Select at least one service line.');
      return;
    }

    const fv = this.mdrForm.value;

    const payload = {
      authDetailId: this.authDetailId,
      assignmentType: fv.assignmentType,
      activityType: fv.activityType,
      priority: this.numOrNull(fv.priority),
      assignTo: this.numOrNull(fv.assignTo),
      queueId: this.numOrNull(fv.workBasket),
      queueUserId: this.numOrNull(fv.workBasketUser),
      scheduledDateTime: this.toIsoUtcOrNull(fv.scheduledDateTime),
      dueDateTime: this.toIsoUtcOrNull(fv.dueDateTime),
      recommendation: fv.recommendation,
      notes: fv.notes ?? '',
      serviceLines: selectedLines.map(l => ({
        decisionLineId: l.decisionLineId ?? null,
        serviceCode: l.serviceCode,
        serviceDescription: l.serviceDescription,
        modifier: l.modifier ?? '',
        unitType: l.unitType ?? '',
        fromDate: l.fromDate ?? null,
        toDate: l.toDate ?? null,
        requested: this.numOrNull(l.requested),
        approved: this.numOrNull(l.approved),
        denied: this.numOrNull(l.denied),
        initialRecommendation: l.initialRecommendation ?? ''
      }))
    };

    const svc: any = this.activityService as any;
    if (typeof svc.createMdReviewActivity !== 'function') {
      alert('createMdReviewActivity API is not available in AuthService.');
      return;
    }

    svc.createMdReviewActivity(payload)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          // refresh list
          this.loadMdReviewActivities();
        },
        error: (err: any) => {
          console.error(err);
          alert('Failed to save MD Review activity.');
        }
      });
  }

  // ----------------- mapping helpers -----------------

  /** Build service lines from auth saved data shape (procedure1_*, procedure2_* ...) */
  private buildServiceLinesFromAuthData(raw: any): MdReviewLine[] {
    if (!raw || typeof raw !== 'object') return [];

    const keys = Object.keys(raw);
    const idxs = new Set<number>();

    for (const k of keys) {
      const m = /^procedure(\d+)_/i.exec(k);
      if (m) idxs.add(Number(m[1]));
    }

    const ordered = Array.from(idxs).filter(n => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
    const lines: MdReviewLine[] = [];

    for (const i of ordered) {
      const code = raw[`procedure${i}_procedureCode`] ?? raw[`procedure${i}_serviceCode`] ?? '';
      const desc = raw[`procedure${i}_procedureDescription`] ?? raw[`procedure${i}_serviceDescription`] ?? '';
      const fromDate = raw[`procedure${i}_fromDate`] ?? null;
      const toDate = raw[`procedure${i}_toDate`] ?? null;
      const modifier = raw[`procedure${i}_modifier`] ?? '';
      const unitType = raw[`procedure${i}_unitType`] ?? '';
      const requested = raw[`procedure${i}_serviceReq`] ?? raw[`procedure${i}_requested`] ?? null;
      const approved = raw[`procedure${i}_serviceApproved`] ?? raw[`procedure${i}_approved`] ?? null;
      const denied = raw[`procedure${i}_serviceDenied`] ?? raw[`procedure${i}_denied`] ?? null;

      // only add if at least a code/desc is present
      if (!String(code ?? '').trim() && !String(desc ?? '').trim()) continue;

      lines.push({
        decisionLineId: i,
        serviceCode: String(code ?? ''),
        serviceDescription: String(desc ?? ''),
        modifier: String(modifier ?? ''),
        unitType: String(unitType ?? ''),
        fromDate: fromDate ? String(fromDate) : undefined,
        toDate: toDate ? String(toDate) : undefined,
        requested,
        approved,
        denied,
        selected: true,
        initialRecommendation: ''
      });
    }

    return lines;
  }

  private numOrNull(v: any): number | null {
    const n = Number((v && typeof v === 'object' && 'value' in v) ? (v as any).value : v);
    return Number.isFinite(n) ? n : null;
  }

  private toIsoUtcOrNull(v: any): string | null {
    if (!v) return null;
    const d = (v instanceof Date) ? v : new Date(v);
    if (isNaN(d.getTime())) return null;
    return d.toISOString();
  }
}
