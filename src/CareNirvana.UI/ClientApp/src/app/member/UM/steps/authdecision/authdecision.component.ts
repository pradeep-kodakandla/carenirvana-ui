import { Component, OnDestroy } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { forkJoin, of, Subject } from 'rxjs';
import { catchError, finalize, takeUntil, switchMap, map } from 'rxjs/operators';
import { AuthDetailApiService, DecisionSectionName } from 'src/app/service/authdetailapi.service';
import { DatasourceLookupService } from 'src/app/service/crud.service';
import { UiSmartOption } from 'src/app/shared/ui/uismartdropdown/uismartdropdown.component';
import { WizardToastService } from 'src/app/member/UM/components/authwizardshell/wizard-toast.service';

type DecisionTab = {
  id: number;              // UI tab id
  procedureNo: number;     // 1..N

  /** Procedure code shown in the tab title */
  procedureCode: string;

  /** Tab title text */
  name: string;

  /** Secondary line under the title (e.g. Status) */
  subtitle?: string;

  /** Current decision status (display + code for styling) */
  statusText: string;
  statusCode: string;
  statusClass: string;
};

/** Conditional visibility (same semantics as CaseDetails) */
type ShowWhen = 'always' | 'fieldEquals' | 'fieldNotEquals' | 'fieldhasvalue';

interface TplCondition {
  referenceFieldId: string | null;
  showWhen: ShowWhen;
  value: any;
  /** Optional: how this condition combines with the previous one (default AND) */
  operatorWithPrev?: 'AND' | 'OR';
}

// ui-smart-dropdown option shape
type SmartOpt = UiSmartOption;

type DecisionFieldVm = {
  id: string;
  controlName: string;
  displayName: string;
  type: string;

  required?: boolean;
  isRequired?: boolean;
  requiredMsg?: string;

  datasource?: string;
  options?: any[];
  level?: any[];

  // visibility from template (optional)
  showWhen?: ShowWhen;
  referenceFieldId?: string | null;
  visibilityValue?: any;
  conditions?: TplCondition[];

  // runtime
  isEnabled: boolean;
  value: any;

  // select UI
  selectedOptions?: any[];
};

type DecisionSectionVm = {
  sectionName: DecisionSectionName;
  fields: DecisionFieldVm[];
};

type TabState = {
  tab: DecisionTab;
  sections: DecisionSectionVm[];
  itemIdsBySection: Partial<Record<DecisionSectionName, string>>;
};

@Component({
  selector: 'app-authdecision',
  templateUrl: './authdecision.component.html',
  styleUrls: ['./authdecision.component.css']
})
export class AuthdecisionComponent implements OnDestroy {
  loading = false;
  saving = false;
  errorMsg = '';

  authDetailId: number | null = null;
  authTemplateId: number | null = null;

  tabs: DecisionTab[] = [];
  selectedTabId: number | null = null;

  activeState: TabState | null = null;

  form: FormGroup = this.fb.group({});
  optionsByControlName: Record<string, UiSmartOption[]> = {};

  private templateSections: any[] = [];
  private authData: any = {};
  private itemsBySection: Partial<Record<DecisionSectionName, any[]>> = {};
  private dropdownCache = new Map<string, SmartOpt[]>();

  /** Field id -> controlName map for the current tab (used for conditional visibility). */
  private fieldIdToControlName = new Map<string, string>();
  private visibilitySyncInProgress = false;

  /** Kills subscriptions that are bound to the current tab/form when switching tabs. */
  private tabDestroy$ = new Subject<void>();
  private destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    private api: AuthDetailApiService,
    private dsLookup: DatasourceLookupService,
    private toastSvc: WizardToastService
  ) { }

  ngOnDestroy(): void {
    this.tabDestroy$.next();
    this.tabDestroy$.complete();
    this.destroy$.next();
    this.destroy$.complete();
  }

  // called by AuthWizardShell
  setContext(ctx: any): void {
    const nextDetailId = Number(ctx?.authDetailId ?? 0) || null;
    const nextTemplateId = Number(ctx?.authTemplateId ?? 0) || null;

    const changed = nextDetailId !== this.authDetailId || nextTemplateId !== this.authTemplateId;
    console.log('AuthDecisionComponent.setContext', { nextDetailId, nextTemplateId, changed });

    this.authDetailId = nextDetailId;
    this.authTemplateId = nextTemplateId;

    if (this.authDetailId && this.authTemplateId) {
      this.reload(this.authDetailId, this.authTemplateId);
    }
  }

  // ---------------------------
  // Load
  // ---------------------------
  private reload(authDetailId: number, authTemplateId: number): void {
    this.loading = true;
    this.errorMsg = '';

    this.tabs = [];
    this.selectedTabId = null;
    this.activeState = null;
    this.itemsBySection = {};
    this.form = this.fb.group({});
    this.optionsByControlName = {};

    const sections: DecisionSectionName[] = [
      'Decision Details',
      'Member Provider Decision Info',
      'Decision Notes'
    ];

    forkJoin({
      auth: this.api.getById(authDetailId).pipe(catchError(() => of(null))),
      tmpl: this.api.getDecisionTemplate(authTemplateId).pipe(catchError(() => of(null))),
      items: forkJoin(
        sections.reduce((acc, s) => {
          acc[s] = this.api.getItems(authDetailId, s).pipe(catchError(() => of([])));
          return acc;
        }, {} as Record<DecisionSectionName, any>)
      ).pipe(catchError(() => of({} as any)))
    })
      .pipe(finalize(() => (this.loading = false)), takeUntil(this.destroy$))
      .subscribe({
        next: (res: any) => {
          this.authData = this.safeParseJson(res?.auth?.dataJson) ?? res?.auth?.data ?? {};

          const rawSections = res?.tmpl?.sections ?? res?.tmpl?.Sections ?? [];
          this.templateSections = Array.isArray(rawSections) ? rawSections : [];
          console.log('AuthDecisionComponent.reload: templateSections fragments=', this.templateSections?.length);

          this.itemsBySection = res?.items ?? {};

          this.buildTabsFromAuthData();
          this.updateTabStatuses();
          if (!this.tabs.length) {
            this.errorMsg = 'No service details found to build Decision tabs.';
            return;
          }

          this.selectedTabId = this.tabs[0].id;
          this.buildActiveState(this.tabs[0]);
        },
        error: (e) => {
          console.error(e);
          this.errorMsg = 'Unable to load auth decision.';
        }
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

  private formatDateShort(value: any): string {
    if (!value) return 'N/A';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return 'N/A';
    return d.toISOString().slice(0, 10);
  }

  private extractPrimitive(value: any): any {
    if (value === null || value === undefined) return null;
    if (typeof value !== 'object') return value;

    // common shapes from dropdowns / APIs
    const obj: any = value;
    const candidates = [
      'value',
      'code',
      'key',
      'id',
      'decisionStatusCode',
      'procedureCode',
      'statusCode',
      'decisionStatusId'
    ];

    for (const k of candidates) {
      const v = obj?.[k];
      if (v === null || v === undefined) continue;
      if (typeof v !== 'object') return v;
    }

    // label-like fallbacks
    if (typeof obj?.label === 'string') return obj.label;
    if (typeof obj?.text === 'string') return obj.text;
    if (typeof obj?.name === 'string') return obj.name;

    return null;
  }

  private asDisplayString(value: any): string {
    const prim = this.extractPrimitive(value);
    if (prim === null || prim === undefined) return '';
    return String(prim);
  }

  private normalizeStatusCode(value: any): string {
    const s = this.asDisplayString(value).trim();
    return s;
  }

  private statusToClass(statusCodeOrText: string): string {
    const n = String(statusCodeOrText ?? '').trim().toLowerCase();
    if (!n) return 'status-pended';

    if (n.startsWith('pend') || n === 'pended' || n === 'pen') return 'status-pended';
    if (n.startsWith('approv') || n === 'app' || n === 'approved') return 'status-approved';
    if (n.startsWith('deny') || n === 'den' || n === 'denied') return 'status-denied';
    if (n.startsWith('partial') || n === 'par' || n === 'partial') return 'status-partial';

    return 'status-other';
  }

  private lookupDecisionStatusLabel(codeOrId: string): { label: string; code: string } | null {
    const v = String(codeOrId ?? '').trim();
    if (!v) return null;

    for (const [ds, opts] of this.dropdownCache.entries()) {
      const k = this.normDs(ds);
      if (!k.startsWith('decisionstatus')) continue;

      for (const o of (opts ?? [])) {
        const raw: any = (o as any)?.raw;
        const cands = [
          (o as any)?.value,
          raw?.id,
          raw?.value,
          raw?.code,
          raw?.decisionStatusCode,
          raw?.statusCode
        ];

        if (cands.some(x => String(x ?? '').trim() === v)) {
          const label = (o as any)?.label ?? (o as any)?.text ?? raw?.decisionStatusName ?? raw?.name ?? v;
          const code = String((o as any)?.value ?? v);
          return { label: String(label), code };
        }
      }
    }

    return null;
  }

  private getDecisionStatusForProcedure(procedureNo: number): { statusText: string; statusCode: string } {
    // Default per requirement
    let statusText = 'Pended';
    let statusCode = 'Pended';

    try {
      const picked = this.findItemForSectionAndProcedure('Decision Details', procedureNo);
      const data = picked?.data ?? {};

      // prefer explicit keys
      let raw =
        data?.decisionStatusCode ??
        data?.decisionStatus ??
        data?.decisionStatusId ??
        data?.status ??
        null;

      if (raw === null) {
        // fallback: any key containing decisionStatus
        const k = Object.keys(data || {}).find(x => /decision\s*status/i.test(x));
        if (k) raw = (data as any)[k];
      }

      // if object, try to pick display name
      if (raw && typeof raw === 'object') {
        const obj: any = raw;
        statusText =
          obj?.decisionStatusName ??
          obj?.statusName ??
          obj?.name ??
          obj?.label ??
          obj?.text ??
          statusText;

        statusCode =
          this.asDisplayString(obj?.decisionStatusCode ?? obj?.code ?? obj?.value ?? obj?.id) ||
          this.asDisplayString(raw) ||
          statusCode;

        return { statusText: String(statusText), statusCode: String(statusCode) };
      }

      const prim = this.asDisplayString(raw);
      if (prim) {
        const looked = this.lookupDecisionStatusLabel(prim);
        if (looked) {
          statusText = looked.label;
          statusCode = looked.code;
        } else {
          // fallback: show whatever we have (code/text)
          statusText = prim;
          statusCode = prim;
        }
      }

      return { statusText, statusCode };
    } catch {
      return { statusText, statusCode };
    }
  }

  //private updateTabStatuses(): void {
  //  // Update each tab's status from Decision Details item data
  //  this.tabs = (this.tabs ?? []).map(t => {
  //    const s = this.getDecisionStatusForProcedure(t.procedureNo);
  //    const statusText = (s?.statusText ?? 'Pended') || 'Pended';
  //    const statusCode = (s?.statusCode ?? statusText) || statusText;

  //    const fromDate = this.formatDateShort(this.authData?.[`procedure${t.procedureNo}_fromDate`]);
  //    const subtitle = `Status: ${statusText}${fromDate !== 'N/A' ? ` • From: ${fromDate}` : ''}`;

  //    return {
  //      ...t,
  //      statusText,
  //      statusCode,
  //      statusClass: this.statusToClass(statusCode || statusText),
  //      subtitle
  //    };
  //  });
  //}


  private buildTabsFromAuthData(): void {
    const keys = Object.keys(this.authData ?? {});
    const set = new Set<number>();

    for (const k of keys) {
      const m = /^procedure(\d+)_/i.exec(k);
      if (m) set.add(Number(m[1]));
    }

    const nums = Array.from(set)
      .filter((n) => Number.isFinite(n) && n > 0)
      .sort((a, b) => a - b);
    const procedureNos = nums.length ? nums : [1];

    this.tabs = procedureNos.map((n, idx) => {
      const rawCode = this.authData?.[`procedure${n}_procedureCode`];
      const code = this.asDisplayString(rawCode).trim();

      const statusDefault = 'Pended';
      const fromDate = this.formatDateShort(this.authData?.[`procedure${n}_fromDate`]);

      return {
        id: idx + 1,
        procedureNo: n,
        procedureCode: code,
        name: `Code - ${code || n}`,
        statusText: statusDefault,
        statusCode: statusDefault,
        statusClass: this.statusToClass(statusDefault),
        subtitle: `Status: ${statusDefault}${fromDate !== 'N/A' ? ` • From: ${fromDate}` : ''}`
      };
    });
  }

  // ---------------------------
  // UI interactions
  // ---------------------------
  selectTab(tabId: number): void {
    const tab = this.tabs.find((t) => t.id === tabId);
    if (!tab) return;

    this.selectedTabId = tabId;
    this.buildActiveState(tab);
  }

  saveCurrentTab(): void {
    if (!this.activeState || !this.authDetailId) return;

    this.syncVisibility();

    if (this.form.invalid) {
      this.markVisibleControlsTouched();
      this.errorMsg = 'Please fill the required fields before saving.';
      return;
    }

    const userId = Number(sessionStorage.getItem('loggedInUserid') || 0);
    const authDetailId = this.authDetailId;
    const procNo = this.activeState.tab.procedureNo;

    const saveSection = (sec: DecisionSectionVm) => {
      const payload = this.buildSectionPayload(procNo, sec);
      const existingId = this.activeState!.itemIdsBySection?.[sec.sectionName];

      const call$ = existingId
        ? this.api.updateItem(authDetailId, sec.sectionName, existingId, { data: payload } as any, userId)
        : this.api.createItem(authDetailId, sec.sectionName, { data: payload } as any, userId);

      // Make both branches return the same shape
      return (call$ as any).pipe(map(() => true));
    };

    // Always save Decision Details first, then the rest
    const decisionDetails = this.activeState.sections.find(s => s.sectionName === 'Decision Details') ?? null;
    const rest = this.activeState.sections.filter(s => s.sectionName !== 'Decision Details');
    const restCalls = rest.map(s => saveSection(s));

    const req$ = decisionDetails
      ? saveSection(decisionDetails).pipe(
        switchMap(() => (restCalls.length ? forkJoin(restCalls) : of([])))
      )
      : (restCalls.length ? forkJoin(restCalls) : of([]));

    this.saving = true;
    this.errorMsg = '';

    req$
      .pipe(
        finalize(() => (this.saving = false)),
        catchError((e) => {
          console.error(e);
          this.errorMsg = e?.error?.message ?? 'Unable to save decision.';
          this.toastSvc.error('Decision save failed.');
          return of(null);
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (res: any) => {
          if (res === null) return;
          this.toastSvc.success('Decision saved successfully.');
          this.refreshItemsOnly();
        }
      });
  }
  //saveCurrentTab(): void {
  //  if (!this.activeState || !this.authDetailId) return;

  //  // IMPORTANT: ensure validators only apply to visible+enabled controls
  //  this.syncVisibility();

  //  if (this.form.invalid) {
  //    this.markVisibleControlsTouched();
  //    this.errorMsg = 'Please fill the required fields before saving.';
  //    return;
  //  }

  //  const userId = Number(sessionStorage.getItem('loggedInUserid') || 0);
  //  const authDetailId = this.authDetailId;
  //  const procNo = this.activeState.tab.procedureNo;

  //  const calls: any[] = [];

  //  for (const sec of this.activeState.sections) {
  //    const payload = this.buildSectionPayload(procNo, sec);

  //    const existingId = this.activeState.itemIdsBySection?.[sec.sectionName];
  //    if (existingId) {
  //      calls.push(
  //        this.api.updateItem(authDetailId, sec.sectionName, existingId, { data: payload } as any, userId)
  //      );
  //    } else {
  //      calls.push(
  //        this.api.createItem(authDetailId, sec.sectionName, { data: payload } as any, userId)
  //      );
  //    }
  //  }

  //  this.saving = true;
  //  this.errorMsg = '';

  //  forkJoin(calls)
  //    .pipe(
  //      finalize(() => (this.saving = false)),
  //      catchError((e) => {
  //        console.error(e);
  //        this.errorMsg = e?.error?.message ?? 'Unable to save decision.';
  //        this.toastSvc.error('Decision save failed.');
  //        return of(null);
  //      }),
  //      takeUntil(this.destroy$)
  //    )
  //    .subscribe({
  //      next: (res: any) => {
  //        if (res === null) return;
  //        this.toastSvc.success('Decision saved successfully.');
  //        // refresh only items, keep template + auth data
  //        this.refreshItemsOnly();
  //      }
  //    });
  //}

  deleteCurrentTab(): void {
    if (!this.activeState || !this.authDetailId) return;

    const userId = Number(sessionStorage.getItem('loggedInUserid') || 0);
    const authDetailId = this.authDetailId;

    const calls: any[] = [];

    for (const sec of this.activeState.sections) {
      const existingId = this.activeState.itemIdsBySection?.[sec.sectionName];
      if (existingId) {
        calls.push(this.api.deleteItem(authDetailId, sec.sectionName, existingId, userId));
      }
    }

    if (!calls.length) return;

    this.saving = true;
    this.errorMsg = '';

    forkJoin(calls)
      .pipe(
        finalize(() => (this.saving = false)),
        catchError((e) => {
          console.error(e);
          this.errorMsg = e?.error?.message ?? 'Unable to delete decision.';
          return of(null);
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: () => this.refreshItemsOnly()
      });
  }

  onFieldChanged(_st: TabState): void {
    // keep for future dirty-state handling
  }

  // ---------------------------
  // VISIBILITY (FIX)
  // ---------------------------

  isSectionVisible(st: TabState, section: DecisionSectionVm): boolean {
    const fields = section?.fields ?? [];
    return fields.some(f => this.isVisible(st, f));
  }

  isVisible(_st: TabState, field: DecisionFieldVm): boolean {
    // NOTE: do NOT hide when isEnabled=false.
    // isEnabled=false means read-only/disabled, but it must still DISPLAY.
    return this.evalFieldVisibility(field);
  }

  private evalFieldVisibility(field: DecisionFieldVm): boolean {
    if (!field) return true;

    // Conditions array (preferred)
    const conds = Array.isArray(field.conditions) ? field.conditions.filter(Boolean) : [];
    if (conds.length > 0) {
      return this.evalConditions(conds);
    }

    // Legacy single condition fields (support template variants)
    const sw = (field.showWhen ?? 'always') as ShowWhen;
    if (sw === 'always') return true;

    const refId = field.referenceFieldId ?? null;
    const val = (field.visibilityValue ?? null);

    if (!refId) return true; // cannot evaluate -> show

    return this.evalOne(sw, refId, val);
  }

  private evalConditions(conds: TplCondition[]): boolean {
    let result: boolean | null = null;

    for (let i = 0; i < conds.length; i++) {
      const c = conds[i];
      const sw = (c?.showWhen ?? 'always') as ShowWhen;

      // "always" inside conditions -> doesn't restrict; treat as true
      let current = true;

      if (sw !== 'always') {
        const refId = c?.referenceFieldId ?? null;
        if (!refId) {
          current = true; // no reference -> can't evaluate -> show
        } else {
          current = this.evalOne(sw, refId, c?.value);
        }
      }

      if (result === null) {
        result = current;
      } else {
        const op = (c?.operatorWithPrev ?? 'AND').toUpperCase();
        result = op === 'OR' ? (result || current) : (result && current);
      }
    }

    return result ?? true;
  }

  private evalOne(showWhen: ShowWhen, referenceFieldId: string, visibilityValue: any): boolean {
    const refCtrlName =
      this.fieldIdToControlName.get(referenceFieldId) ??
      referenceFieldId; // fallback (if template stores controlName directly)

    const ctrl = this.form?.get(refCtrlName);
    const raw = this.unwrapValue(ctrl?.value);

    switch (showWhen) {
      case 'fieldEquals':
        return String(raw ?? '') === String(visibilityValue ?? '');
      case 'fieldNotEquals':
        return String(raw ?? '') !== String(visibilityValue ?? '');
      case 'fieldhasvalue':
        if (raw === null || raw === undefined) return false;
        if (typeof raw === 'string') return raw.trim().length > 0;
        if (Array.isArray(raw)) return raw.length > 0;
        return true;
      case 'always':
      default:
        return true;
    }
  }

  /**
   * Enable/disable controls based on visibility + isEnabled.
   * - Invisible -> always disable (so required won't block save)
   * - Visible but isEnabled=false -> keep disabled (read-only)
   * - Visible and isEnabled=true -> enable
   */
  private syncVisibility(): void {
    if (!this.activeState || !this.form) return;
    if (this.visibilitySyncInProgress) return;

    this.visibilitySyncInProgress = true;
    try {
      for (const sec of this.activeState.sections) {
        for (const f of sec.fields) {
          const shouldShow = this.evalFieldVisibility(f);
          const ctrl = this.form.get(f.controlName);
          if (!ctrl) continue;

          const canEnable = shouldShow && f.isEnabled !== false;

          if (!shouldShow) {
            if (!ctrl.disabled) ctrl.disable({ emitEvent: false });
          } else {
            // shouldShow = true
            if (canEnable) {
              if (ctrl.disabled) ctrl.enable({ emitEvent: false });
            } else {
              if (!ctrl.disabled) ctrl.disable({ emitEvent: false });
            }
          }
        }
      }
    } finally {
      this.visibilitySyncInProgress = false;
    }
  }

  private markVisibleControlsTouched(): void {
    if (!this.activeState || !this.form) return;

    for (const sec of this.activeState.sections) {
      for (const f of sec.fields) {
        const shouldShow = this.evalFieldVisibility(f);
        if (!shouldShow) continue;

        const ctrl = this.form.get(f.controlName);
        // only mark enabled controls (disabled fields won't show required errors anyway)
        if (ctrl && !ctrl.disabled) ctrl.markAsTouched();
      }
    }
  }

  // ---------------------------
  // UI helpers
  // ---------------------------
  getDropdownOptions(controlName: string): UiSmartOption[] {
    return this.optionsByControlName[controlName] ?? [];
  }

  getCtrl(controlName: string): FormControl {
    return this.form.get(controlName) as FormControl;
  }

  isInvalidField(f: DecisionFieldVm): boolean {
    const c = this.form.get(f.controlName);
    return !!(c && c.touched && c.invalid);
  }

  // ---------------------------
  // Build view-model for a tab
  // ---------------------------
  private buildActiveState(tab: DecisionTab): void {
    // kill previous tab subscriptions
    this.tabDestroy$.next();

    const procedureNo = tab.procedureNo;

    // Build 3 sections from template
    const sections: DecisionSectionVm[] = this.extractDecisionSectionsFromTemplate().map((sec: any) => {
      const sectionName = String(sec?.sectionName ?? sec?.SectionName ?? '').trim() as DecisionSectionName;
      const fields = this.getSectionFields(sec).map((f: any) => this.toFieldVm(f));
      return { sectionName, fields };
    });

    // Attach values from backend items (preferred) or authData (fallback)
    const itemIdsBySection: Partial<Record<DecisionSectionName, string>> = {};

    for (const sec of sections) {
      const { itemId, data } = this.findItemForSectionAndProcedure(sec.sectionName, procedureNo);
      if (itemId) itemIdsBySection[sec.sectionName] = itemId;

      for (const field of sec.fields) {
        // 1) item data wins
        let v = data?.[field.id];

        // 2) fallback to authData procedureN_*
        if (v === undefined) {
          const k = `procedure${procedureNo}_${field.id}`;
          v = this.authData?.[k];
        }

        // 3) Pre-populate decision fields from the Service section (same behavior as the legacy Decision step)
        if (v === undefined) {
          v = this.getServicePrefillValue(procedureNo, field.id);
        }

        const normalized = String(field.type ?? '').toLowerCase() === 'select'
          ? (this.extractPrimitive(v) ?? v)
          : v;

        field.value = normalized ?? this.defaultValueForType(field.type);
      }
    }

    // Build reactive form controls
    this.buildFormForSections(sections, procedureNo);

    // prefetch options for select fields (datasource/static)
    this.prefetchDropdownOptions(sections);

    this.activeState = {
      tab,
      sections,
      itemIdsBySection
    };

    // initial visibility sync + watch for changes
    this.syncVisibility();
    this.form.valueChanges
      .pipe(takeUntil(this.tabDestroy$), takeUntil(this.destroy$))
      .subscribe(() => this.syncVisibility());
  }

  private defaultValueForType(type?: string): any {
    const t = String(type ?? '').toLowerCase();
    if (t === 'checkbox') return false;
    if (t === 'select') return null;
    if (t === 'datetime-local') return null;
    if (t === 'textarea') return '';
    return '';
  }

  private getServicePrefillValue(procedureNo: number, fieldId: string): any {
    const fid = String(fieldId || '').trim();
    if (!fid) return undefined;

    const get = (suffix: string) => this.authData?.[`procedure${procedureNo}_${suffix}`];

    switch (fid) {
      case 'decisionNumber':
        return String(procedureNo);

      case 'serviceCode':
        return get('procedureCode') ?? get('serviceReq') ?? get('serviceCode');

      case 'serviceDescription':
        return get('procedureDescription') ?? get('serviceDescription');

      case 'fromDate':
        return get('fromDate') ?? get('effectiveDate');

      case 'toDate':
        return get('toDate');

      case 'requested':
        return (
          get('recommendedUnits') ??
          get('requested') ??
          get('hours') ??
          get('days') ??
          get('weeks')
        );

      case 'used':
        return get('used');

      case 'reviewType':
        return get('reviewType');

      case 'modifier':
        return get('modifier');

      case 'unitType':
        return get('unitType');

      case 'alternateServiceId':
        return get('alternateServiceId');

      default:
        return undefined;
    }
  }

  /**
   * ✅ IMPORTANT FIX:
   * TemplateSectionsResponse can contain duplicates/partial objects because of jsonb_path_query.
   * We MUST MERGE all fragments per sectionName, otherwise only a subset of fields show.
   */
  private extractDecisionSectionsFromTemplate(): any[] {
    const wantedOrder: DecisionSectionName[] = [
      'Decision Details',
      'Member Provider Decision Info',
      'Decision Notes'
    ];
    const wanted = new Set<string>(wantedOrder as unknown as string[]);

    // sectionName -> fieldId -> fieldObj
    const fieldMapBySection = new Map<string, Map<string, any>>();
    // sectionName -> base section obj (first seen)
    const baseSectionByName = new Map<string, any>();

    for (const s of this.templateSections ?? []) {
      const name = String((s as any)?.sectionName ?? (s as any)?.SectionName ?? '').trim();
      if (!wanted.has(name)) continue;

      const fields = this.getSectionFields(s);
      if (!Array.isArray(fields) || fields.length === 0) continue;

      if (!baseSectionByName.has(name)) baseSectionByName.set(name, s);

      const fmap = fieldMapBySection.get(name) ?? new Map<string, any>();
      for (const f of fields) {
        const fid = String(f?.id ?? f?.fieldId ?? '').trim();
        if (!fid) continue;

        // keep the one with more properties / higher order (best-effort)
        if (!fmap.has(fid)) {
          fmap.set(fid, f);
        } else {
          const existing = fmap.get(fid);
          const exKeys = existing ? Object.keys(existing).length : 0;
          const fKeys = f ? Object.keys(f).length : 0;
          if (fKeys >= exKeys) fmap.set(fid, f);
        }
      }
      fieldMapBySection.set(name, fmap);
    }

    // Build merged sections in the right order
    const merged: any[] = [];
    for (const secName of wantedOrder as unknown as string[]) {
      const base = baseSectionByName.get(secName);
      const fmap = fieldMapBySection.get(secName);
      if (!base || !fmap) continue;

      const mergedFields = Array.from(fmap.values()).sort((a: any, b: any) => {
        const ao = Number(a?.order ?? a?.Order ?? 0);
        const bo = Number(b?.order ?? b?.Order ?? 0);
        return ao - bo;
      });

      merged.push({
        ...base,
        sectionName: secName,
        fields: mergedFields
      });
    }

    return merged;
  }

  private getSectionFields(sec: any): any[] {
    return (
      (sec as any)?.fields ??
      (sec as any)?.Fields ??
      (sec as any)?.sectionFields ??
      (sec as any)?.SectionFields ??
      []
    );
  }

  private toFieldVm(f: any): DecisionFieldVm {
    const id = String(f?.id ?? f?.fieldId ?? '').trim();
    const displayName = String(f?.displayName ?? f?.label ?? id);
    const type = String(f?.type ?? 'text');

    return {
      ...f,
      id,
      controlName: '',
      displayName,
      type,
      isEnabled: f?.isEnabled !== false,
      value: this.defaultValueForType(type),
      selectedOptions: (f as any)?.selectedOptions
    };
  }

  private buildSectionPayload(procedureNo: number, sec: DecisionSectionVm): any {
    const obj: any = {
      procedureNo
    };

    for (const f of sec.fields) {
      const ctrl = this.form.get(f.controlName);
      obj[f.id] = this.unwrapValue(ctrl?.value);
    }

    // helpful metadata (optional)
    obj.procedureCode = this.authData?.[`procedure${procedureNo}_procedureCode`] ?? null;
    obj.procedureDescription = this.authData?.[`procedure${procedureNo}_procedureDescription`] ?? null;

    return obj;
  }

  // ---------------------------
  // Reactive form helpers
  // ---------------------------
  private makeControlName(procedureNo: number, sectionName: string, fieldId: string): string {
    const sec = String(sectionName || '').toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const fid = String(fieldId || '').toLowerCase().replace(/[^a-z0-9]+/g, '_');
    return `p${procedureNo}_${sec}_${fid}`;
  }

  private buildFormForSections(sections: DecisionSectionVm[], procedureNo: number): void {
    const group: Record<string, FormControl> = {};

    // Reset options per tab to avoid leaking previous tab options
    this.optionsByControlName = {};
    this.fieldIdToControlName.clear();

    for (const sec of sections) {
      for (const f of sec.fields) {
        f.controlName = this.makeControlName(procedureNo, sec.sectionName, f.id);
        this.fieldIdToControlName.set(f.id, f.controlName);

        const required = !!(f.required || f.isRequired);
        const validators = required ? [Validators.required] : [];
        const ctrl = new FormControl(f.value, validators);

        // if read-only
        if (!f.isEnabled) ctrl.disable({ emitEvent: false });

        group[f.controlName] = ctrl;
      }
    }

    this.form = this.fb.group(group);
  }

  private unwrapValue(v: any): any {
    if (v && typeof v === 'object' && 'value' in v) return (v as any).value;
    return v;
  }

  private findItemForSectionAndProcedure(
    sectionName: DecisionSectionName,
    procedureNo: number
  ): { itemId: string | null; data: any } {
    const list = (this.itemsBySection?.[sectionName] ?? []) as any[];
    if (!Array.isArray(list) || !list.length) return { itemId: null, data: {} };

    const getProcNo = (x: any): number | null => {
      // 1) try root-level fields
      let p = Number(x?.procedureNo ?? x?.procedureIndex ?? x?.serviceIndex ?? x?.serviceNo);
      if (Number.isFinite(p) && p > 0) return p;

      // 2) try inside stored json/data
      const raw = x?.data ?? x?.jsonData ?? x?.payload ?? x?.itemData ?? {};
      const data = this.safeParseJson(raw) ?? raw ?? {};
      p = Number(
        data?.procedureNo ??
        data?.procedureIndex ??
        data?.serviceIndex ??
        data?.serviceNo ??
        data?.decisionNumber // common alt
      );
      if (Number.isFinite(p) && p > 0) return p;

      return null;
    };

    const match = list.find((x) => getProcNo(x) === procedureNo);

    // Keep your fallback behavior for proc 1
    const picked = match ?? (procedureNo === 1 ? list[0] : null);
    if (!picked) return { itemId: null, data: {} };

    const itemId = String(picked?.itemId ?? picked?.id ?? picked?.decisionItemId ?? '');
    const raw = picked?.data ?? picked?.jsonData ?? picked?.payload ?? picked?.itemData ?? {};
    const data = this.safeParseJson(raw) ?? raw ?? {};

    return { itemId: itemId || null, data };
  }


  private prefetchDropdownOptions(sections: DecisionSectionVm[]): void {
    const selectFields: DecisionFieldVm[] = [];
    for (const s of sections) {
      for (const f of s.fields) {
        if (String(f.type).toLowerCase() === 'select') selectFields.push(f);
      }
    }
    if (!selectFields.length) return;

    // 1) static select options
    for (const f of selectFields) {
      const ds = String((f as any).datasource ?? '').trim();
      if (ds) continue;

      const staticOpts = this.mapStaticOptions(((f as any).options ?? (f as any).level ?? []) as any[]);
      this.optionsByControlName[f.controlName] = this.filterBySelectedOptions(f, staticOpts);
      this.reconcileSelectValue(f);
    }

    // 2) datasource select options
    const byDatasource = new Map<string, DecisionFieldVm[]>();
    for (const f of selectFields) {
      const ds = String((f as any).datasource ?? '').trim();
      if (!ds) continue;
      const list = byDatasource.get(ds) ?? [];
      list.push(f);
      byDatasource.set(ds, list);
    }

    for (const [ds, fields] of byDatasource.entries()) {
      const cacheHit = this.dropdownCache.get(ds);
      if (cacheHit) {
        for (const f of fields) {
          this.optionsByControlName[f.controlName] = this.filterBySelectedOptions(f, cacheHit);
          this.reconcileSelectValue(f);
        }
        continue;
      }

      this.dsLookup.getOptionsWithFallback(
        ds,
        (r: any) => {
          const dsKey = ds ? this.toCamelCase(ds) : '';
          const value = this.getDatasourcePreferredValue(ds, r) ?? r?.value ?? r?.code ?? r?.id;

          const special = this.getDatasourcePreferredLabel(ds, r);

          const label =
            special ??
            r?.label ??
            r?.text ??
            r?.name ??
            r?.description ??
            r?.displayName ??
            r?.title ??
            (dsKey
              ? (r?.[dsKey] ??
                r?.[dsKey.charAt(0).toUpperCase() + dsKey.slice(1)] ??
                r?.[ds])
              : null) ??
            this.pickDisplayField(r) ??
            String(value ?? '');

          return { value, label, text: label, raw: r } as any;
        },
        ['UM', 'Admin', 'Provider']
      )
        .subscribe((opts) => {
          const safe = (opts ?? []) as any[];

          this.dropdownCache.set(ds, safe);

          for (const f of fields) {
            const finalOpts = this.filterBySelectedOptions(f, safe);
            this.optionsByControlName[f.controlName] = finalOpts;
            this.reconcileSelectValue(f);
          }
        });

    }
  }

  private filterBySelectedOptions(field: DecisionFieldVm, options: UiSmartOption[]): UiSmartOption[] {
    const allowed = (field as any).selectedOptions as any[] | undefined;
    if (!Array.isArray(allowed) || allowed.length === 0) return options ?? [];
    const allowedSet = new Set(allowed.map(a => String(a)));

    // Some templates store selectedOptions as *ids* while our dropdown value may be a *code*.
    // Keep an option if either its value OR a reasonable raw key matches an allowed value.
    return (options ?? []).filter(o => {
      const v = String((o as any)?.value ?? '').trim();
      if (allowedSet.has(v)) return true;

      const r: any = (o as any)?.raw;
      if (!r) return false;
      const rawCandidates = [
        r?.id,
        r?.value,
        r?.code,
        r?.key,
        r?.decisionStatusCode,
        r?.decisionTypeCode
      ];
      return rawCandidates.some(x => allowedSet.has(String(x ?? '').trim()));
    });
  }

  private reconcileSelectValue(field: DecisionFieldVm): void {
    const ctrl = this.form.get(field.controlName);
    if (!ctrl) return;

    const rawVal = this.extractPrimitive(this.unwrapValue(ctrl.value)) ?? this.unwrapValue(ctrl.value);
    const v = String(rawVal ?? '').trim();
    if (!v) return;

    const opts = this.optionsByControlName[field.controlName] ?? [];

    // 1) direct match
    const direct = opts.find(o => String((o as any)?.value) === v);
    if (direct) return;

    // 2) match against common raw keys (fix: backend stored id but UI expects code, etc.)
    const alt = opts.find(o => {
      const r: any = (o as any)?.raw;
      if (!r) return false;
      const cands = [r?.id, r?.value, r?.code, r?.key, r?.decisionStatusCode, r?.decisionTypeCode];
      return cands.some(x => String(x ?? '').trim() === v);
    });

    if (alt) {
      ctrl.setValue((alt as any).value, { emitEvent: false });
      return;
    }

    // 3) invalid / stale value
    ctrl.setValue(null, { emitEvent: false });
  }


  private mapStaticOptions(raw: any[]): UiSmartOption[] {
    if (!Array.isArray(raw)) return [];
    return raw
      .map((x) => {
        if (x == null) return null;
        if (typeof x === 'string' || typeof x === 'number') {
          return { value: x, label: String(x), text: String(x) } as any;
        }
        const value = x?.value ?? x?.id ?? x?.code ?? x?.key;
        const label = x?.label ?? x?.text ?? x?.name ?? x?.description ?? String(value ?? '');
        return { value, label, text: label, raw: x } as any;
      })
      .filter(Boolean) as any;
  }

  private refreshItemsOnly(): void {
    if (!this.authDetailId || !this.activeState) return;

    const sections: DecisionSectionName[] = [
      'Decision Details',
      'Member Provider Decision Info',
      'Decision Notes'
    ];

    this.loading = true;
    forkJoin(
      sections.reduce((acc, s) => {
        acc[s] = this.api.getItems(this.authDetailId!, s).pipe(catchError(() => of([])));
        return acc;
      }, {} as Record<DecisionSectionName, any>)
    )
      .pipe(finalize(() => (this.loading = false)), takeUntil(this.destroy$))
      .subscribe({
        next: (res: any) => {
          this.itemsBySection = res ?? {};
          this.updateTabStatuses();
          const tab = this.tabs.find((t) => t.id === this.selectedTabId) ?? this.tabs[0];
          if (tab) this.buildActiveState(tab);
        },
        error: (e) => {
          console.error(e);
          this.errorMsg = 'Unable to reload decision items.';
        }
      });
  }

  private toCamelCase(input: string): string {
    const parts = input
      .trim()
      .replace(/[^a-zA-Z0-9]+/g, ' ')
      .split(' ')
      .filter(Boolean);

    if (parts.length === 0) return input;
    return parts[0].toLowerCase() + parts.slice(1).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
  }

  private pickDisplayField(row: any): string | null {
    if (!row) return null;
    const skip = new Set(['id', 'value', 'code', 'activeFlag', 'createdBy', 'createdOn', 'updatedBy', 'updatedOn', 'deletedBy', 'deletedOn']);
    for (const k of Object.keys(row)) {
      if (skip.has(k)) continue;
      const v = row[k];
      if (typeof v === 'string' && v.trim().length > 0) return v;
    }
    return null;
  }

  private normDs(ds: string): string {
    return String(ds ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  /** Add decision-specific overrides here if needed */
  private getDatasourcePreferredValue(ds: string, row: any): any {
    const k = this.normDs(ds);
    if (!row) return null;

    // Decision Status Code should use code (not numeric id) when available
    if (k.startsWith('decisionstatus')) return row?.decisionStatusCode ?? row?.statusCode ?? row?.code ?? row?.value ?? row?.id ?? null;

    // Decision Type often uses code as value
    if (k.startsWith('decisiontype')) return row?.decisionTypeCode ?? row?.typeCode ?? row?.code ?? row?.value ?? row?.id ?? null;

    return null;
  }

  private getDatasourcePreferredLabel(ds: string, row: any): string | null {
    const k = this.normDs(ds);
    if (!row) return null;

    if (k.startsWith('decisionstatus')) return row?.decisionStatusName ?? row?.statusName ?? row?.name ?? null;
    if (k.startsWith('decisiontype')) return row?.decisionTypeName ?? row?.typeName ?? row?.name ?? null;

    return null;
  }

  private getDecisionDetailsDataForProcedure(procedureNo: number): any {
    try {
      const picked = this.findItemForSectionAndProcedure('Decision Details', procedureNo);
      return picked?.data ?? {};
    } catch {
      return {};
    }
  }

  private pickFirstValue(obj: any, keys: string[]): any {
    if (!obj) return null;

    for (const k of keys) {
      const v = (obj as any)?.[k];
      if (v === null || v === undefined) continue;
      if (typeof v === 'string' && v.trim() === '') continue;
      return v;
    }

    // case-insensitive fallback
    const lower = new Map((Object.keys(obj) ?? []).map(x => [String(x).toLowerCase(), x]));
    for (const k of keys) {
      const real = lower.get(String(k).toLowerCase());
      if (!real) continue;
      const v = (obj as any)?.[real];
      if (v === null || v === undefined) continue;
      if (typeof v === 'string' && v.trim() === '') continue;
      return v;
    }

    return null;
  }

  private buildDecisionLine(procedureNo: number, statusText: string, details: any): string {
    const lineNo =
      this.pickFirstValue(details, [
        'decisionNumber',
        'decisionLineNo',
        'decisionLine',
        'lineNumber',
        'lineNo'
      ]) ?? procedureNo;

    const fromRaw =
      this.pickFirstValue(details, ['fromDate', 'effectiveFrom', 'startDate']) ??
      this.authData?.[`procedure${procedureNo}_fromDate`];

    const toRaw =
      this.pickFirstValue(details, ['toDate', 'effectiveTo', 'endDate']) ??
      this.authData?.[`procedure${procedureNo}_toDate`];

    const from = this.formatDateShort(fromRaw);
    const to = this.formatDateShort(toRaw);

    const unitsRaw =
      this.pickFirstValue(details, [
        'approved',
        'approvedUnits',
        'unitsApproved',
        'authorized',
        'authorizedUnits',
        'decisionUnits',
        'requested',
        'requestedUnits',
        'recommendedUnits'
      ]) ??
      this.authData?.[`procedure${procedureNo}_recommendedUnits`];

    const unitTypeRaw =
      this.pickFirstValue(details, ['unitType', 'unitsType', 'unit']) ??
      this.authData?.[`procedure${procedureNo}_unitType`];

    const units = this.asDisplayString(unitsRaw).trim();
    const unitType = this.asDisplayString(unitTypeRaw).trim();

    const parts: string[] = [];
    parts.push(`Decision # ${this.asDisplayString(lineNo) || procedureNo}`);
    parts.push(`Decision: ${statusText || 'Pended'}`);

    if (from !== 'N/A' || to !== 'N/A') {
      if (from !== 'N/A' && to !== 'N/A') parts.push(`Dates: ${from} - ${to}`);
      else if (from !== 'N/A') parts.push(`From: ${from}`);
      else parts.push(`To: ${to}`);
    }

    if (units) parts.push(`Units: ${units}${unitType ? ' ' + unitType : ''}`);

    return parts.join(' \u2022 ');
  }


  private updateTabStatuses(): void {
    this.tabs = (this.tabs ?? []).map(t => {
      const s = this.getDecisionStatusForProcedure(t.procedureNo);
      const statusText = (s?.statusText ?? 'Pended') || 'Pended';
      const statusCode = (s?.statusCode ?? statusText) || statusText;

      const details = this.getDecisionDetailsDataForProcedure(t.procedureNo);
      const subtitle = this.buildDecisionLine(t.procedureNo, statusText, details);

      return {
        ...t,
        statusText,
        statusCode,
        statusClass: this.statusToClass(statusCode || statusText),
        subtitle
      };
    });
  }


}
