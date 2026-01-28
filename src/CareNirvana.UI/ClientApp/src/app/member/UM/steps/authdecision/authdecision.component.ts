import { Component, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { forkJoin, of, Subject } from 'rxjs';
import { catchError, finalize, takeUntil } from 'rxjs/operators';

import { AuthDetailApiService, DecisionSectionName } from 'src/app/service/authdetailapi.service';
import { DatasourceLookupService } from 'src/app/service/crud.service';
import { UiSmartOption } from 'src/app/shared/ui/uismartdropdown/uismartdropdown.component';
import { WizardToastService } from 'src/app/member/UM/components/authwizardshell/wizard-toast.service';
import { AuthunsavedchangesawareService } from 'src/app/member/UM/services/authunsavedchangesaware.service';

type DecisionTab = {
  id: number;              // UI tab id
  procedureNo: number;     // 1..N

  /** Service/procedure code shown in the tab */
  procedureCode: string;

  /** Backward compatibility fields (old tab template) */
  name?: string;
  subtitle?: string;

  /** Status for styling */
  statusText: string;
  statusCode: string;
  statusClass: string;

  /** New 3-line tab layout */
  line1: string;   // Decision # + Code
  line2?: string;  // Dates
  line3: string;   // Status
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
export class AuthdecisionComponent implements OnDestroy, AuthunsavedchangesawareService {
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
  /** Created timestamp of the auth record (from API envelope, not inside dataJson). */
  private authCreatedOn: string | null = null;
  private itemsBySection: Partial<Record<DecisionSectionName, any[]>> = {};
  private dropdownCache = new Map<string, SmartOpt[]>();

  /**
   * Cached UI value for the "Pended" option in Decision Status dropdown.
   * We discover this from dropdown options so we don't have to guess whether Pended is 0/1/etc.
   */
  private pendedDecisionStatusValue: any = null;

  /** Extract a service/procedure code string from common backend shapes (object or primitive). */
  private extractServiceCodeString(v: any): string {
    if (v === null || v === undefined) return '';
    if (typeof v === 'string' || typeof v === 'number') return String(v).trim();
    if (typeof v !== 'object') return String(v).trim();
    // common shapes: {code:"A0080"}, {procedureCode:{code}}, {serviceCode:{code}}
    const obj: any = v;
    const cand =
      obj?.code ??
      obj?.procedureCode?.code ??
      obj?.serviceCode?.code ??
      obj?.value ??
      obj?.id ??
      '';
    return String(cand ?? '').trim();
  }

  /** Find the Decision Status field datasource name from the decision template (best effort). */
  private getDecisionStatusDatasourceFromTemplate(): string | null {
    try {
      const merged = this.extractDecisionSectionsFromTemplate();
      for (const sec of (merged ?? [])) {
        const fields: any[] = sec?.fields ?? sec?.Fields ?? [];
        const hit = (fields ?? []).find((f: any) => String(f?.id ?? f?.fieldId ?? '').trim().toLowerCase() === 'decisionstatus');
        if (hit) {
          const ds = String(hit?.datasource ?? hit?.Datasource ?? '').trim();
          return ds || null;
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  /** Prefetch Decision Status options early so left tabs can show labels (not ids like 1/2/3). */
  private prefetchDecisionStatusForTabs(done: () => void): void {
    const ds = this.getDecisionStatusDatasourceFromTemplate();
    if (!ds) {
      done();
      return;
    }

    if (this.dropdownCache.has(ds)) {
      // If already cached, also try to lock pended value
      const cached = (this.dropdownCache.get(ds) ?? []) as any[];
      const p = this.findPendedStatusOption(cached as any);
      if (p) this.pendedDecisionStatusValue = (p as any).value;
      done();
      return;
    }

    this.dsLookup
      .getOptionsWithFallback(
        ds,
        (r: any) => this.mapDatasourceRowToOption(ds, r) as any,
        ['UM', 'Admin', 'Provider']
      )
      .pipe(catchError(() => of([])), takeUntil(this.destroy$))
      .subscribe((opts) => {
        const safe = (opts ?? []) as any[];
        this.dropdownCache.set(ds, safe as any);
        const pended = this.findPendedStatusOption(safe as any);
        if (pended) this.pendedDecisionStatusValue = (pended as any).value;
        done();
      });
  }

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
    private toastSvc: WizardToastService,
    private router: Router,
    private route: ActivatedRoute
  ) { }
  public openMdReview(): void {
    // Make MD Review visible in the stepper (via query param) and navigate to MD Review step.
    this.router.navigate(['../mdReview'], {
      relativeTo: this.route,
      queryParams: { showMdReview: 1 },
      queryParamsHandling: 'merge'
    });
  }



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
          // Capture envelope metadata (not part of dataJson)
          this.authCreatedOn = res?.auth?.createdOn ?? res?.auth?.createdDate ?? res?.auth?.CreatedOn ?? null;

          const rawSections = res?.tmpl?.sections ?? res?.tmpl?.Sections ?? [];
          this.templateSections = Array.isArray(rawSections) ? rawSections : [];
          console.log('AuthDecisionComponent.reload: templateSections fragments=', this.templateSections?.length);
          // Build reactive form controls
          //this.buildFormForSections(this.templateSections, procedureNo);

          // prefetch options for select fields (datasource/static)
          //  this.prefetchDropdownOptions(this.templateSections);

          this.itemsBySection = res?.items ?? {};

          // IMPORTANT: Prefetch Decision Status dropdown so left tabs can show labels (not ids like 1/2/3)
          this.prefetchDecisionStatusForTabs(() => {
            this.buildTabsFromAuthData();
            this.updateTabStatuses();
            if (!this.tabs.length) {
              this.errorMsg = 'No decision rows found. Please save Auth Details to initialize Decision tabs.';
              return;
            }
            console.log('AuthDecisionComponent.reload: tabs=', this.tabs);
            this.selectedTabId = this.tabs[0].id;
            this.buildActiveState(this.tabs[0]);
          });
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

  private toDateTimeLocalString(value: any): string | null {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    // datetime-local expects: YYYY-MM-DDTHH:mm
    return d.toISOString().slice(0, 16);
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

  private isPendedStatus(v: any): boolean {
    const s = this.asDisplayString(v).trim().toLowerCase();
    if (!s) return true;

    // If we discovered a concrete "Pended" dropdown value, treat it as pended.
    if (this.pendedDecisionStatusValue !== null && this.pendedDecisionStatusValue !== undefined) {
      const pv = this.asDisplayString(this.pendedDecisionStatusValue).trim().toLowerCase();
      if (pv && s === pv) return true;
    }

    // Try mapping ids/codes to labels via datasource cache.
    const looked = this.lookupDecisionStatusLabel(s);
    const label = looked?.label ? looked.label.toLowerCase() : '';
    if (label.startsWith('pend')) return true;

    // Fallback: common encodings
    return s === '0' || s.startsWith('pend') || s === 'pended' || s === 'pen';
  }

  /** Existing Decision Details data for a procedure (items win; fallback to authData.decisionDetails). */
  private getExistingDecisionDetails(procedureNo: number): any {
    const picked = this.findItemForSectionAndProcedure('Decision Details', procedureNo);
    const d = picked?.data ?? {};
    return d ?? {};
  }

  /**
   * Apply timestamp rules for Decision Details:
   * - createdDateTime: default to authCreatedOn if null
   * - updatedDateTime: set to now on every save
   * - decisionDateTime: set when status transitions from Pended -> non-Pended (or changes between non-Pended states)
   */
  private applyDecisionTimestamps(procedureNo: number, payload: any): void {
    if (!payload) return;

    const existing = this.getExistingDecisionDetails(procedureNo);
    const nowIso = new Date().toISOString();

    // createdDateTime default
    if (!payload.createdDateTime) {
      const procCreated = this.authData?.[`procedure${procedureNo}_createdDateTime`] ?? null;
      payload.createdDateTime = existing?.createdDateTime ?? procCreated ?? this.authCreatedOn ?? nowIso;
    }

    // always update updatedDateTime on save
    payload.updatedDateTime = nowIso;

    // determine status transitions
    const newStatus =
      payload?.decisionStatus ??
      payload?.decisionStatusId ??
      payload?.decisionStatusCode ??
      payload?.status;

    const oldStatus =
      existing?.decisionStatus ??
      existing?.decisionStatusId ??
      existing?.decisionStatusCode ??
      existing?.status;

    const newIsPended = this.isPendedStatus(newStatus);
    const oldIsPended = this.isPendedStatus(oldStatus);

    // if user keeps it pended, keep decisionDateTime null
    if (newIsPended) {
      payload.decisionDateTime = null;
      return;
    }

    const oldDecisionDt = existing?.decisionDateTime ?? null;
    const newDecisionDt = payload?.decisionDateTime ?? null;

    const statusChanged = this.asDisplayString(newStatus).trim() !== this.asDisplayString(oldStatus).trim();

    // set decisionDateTime when leaving pended OR when status changes between non-pended values
    if ((oldIsPended && !newIsPended) || (!oldIsPended && !newIsPended && statusChanged)) {
      payload.decisionDateTime = nowIso;
    } else {
      // keep existing if present
      payload.decisionDateTime = newDecisionDt || oldDecisionDt;
    }
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

      // Prefer the actual Decision Status (id/code). decisionStatusCode is usually the *reason* dropdown.
      let raw =
        data?.decisionStatus ??
        data?.decisionStatusId ??
        data?.status ??
        data?.decisionStatusCode ??
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



  private computeTabStatus(procedureNo: number): { label: string; statusClass: string } {
    const status = this.getDecisionStatusForProcedure(procedureNo);
    const txt = String(status?.statusText ?? '').trim();
    const code = String(status?.statusCode ?? '').trim();

    // Treat empty or "pended" statuses as Pended.
    if (this.isPendedStatus(code) || this.isPendedStatus(txt)) {
      return { label: 'Pended', statusClass: this.statusToClass('Pended') };
    }

    // Normalize common display labels
    const low = txt.toLowerCase();
    if (low.startsWith('approv')) return { label: 'Approved', statusClass: this.statusToClass('Approved') };
    if (low.startsWith('deny')) return { label: 'Denied', statusClass: this.statusToClass('Denied') };

    // Fallback: use resolved label/code
    return { label: txt || code || 'Pended', statusClass: this.statusToClass(txt || code || 'Pended') };
  }


  private updateTabStatuses(): void {
    this.tabs = (this.tabs ?? []).map(t => {
      const procNo = t.procedureNo;

      // Data sources for dates/code
      const dd = this.getExistingDecisionDetails(procNo) ?? {};
      const code = this.asDisplayString(dd?.serviceCode ?? dd?.procedureCode ?? this.authData?.[`procedure${procNo}_procedureCode`]).trim();
      const decisionNo = this.asDisplayString(dd?.decisionNumber).trim() || String(procNo);

      const fromDate = this.formatDateShort(dd?.fromDate ?? this.authData?.[`procedure${procNo}_fromDate`]);
      const toDate = this.formatDateShort(dd?.toDate ?? this.authData?.[`procedure${procNo}_toDate`]);
      const line2 = (fromDate !== 'N/A' || toDate !== 'N/A')
        ? `From: ${fromDate !== 'N/A' ? fromDate : '-'}  To: ${toDate !== 'N/A' ? toDate : '-'}`
        : '';

      const status = this.computeTabStatus(procNo);

      const line1 = `Decision #${decisionNo}${code ? ` | Code: ${code}` : ''}`;
      const line3 = status.label;

      return {
        ...t,
        procedureCode: code || t.procedureCode,
        statusText: status.label,
        statusCode: status.label,
        statusClass: status.statusClass,
        line1,
        line2,
        line3,
        // Backward compatibility (in case old template still uses name/subtitle)
        name: line1,
        subtitle: line2
      };
    });
  }



  private buildTabsFromAuthData(): void {
    const set = new Set<number>();

    // 1) Prefer Decision Details items (seeded after AuthDetails save)
    const ddList = (this.itemsBySection?.['Decision Details'] ?? []) as any[];
    for (const x of (ddList ?? [])) {
      const rawData: any = (x as any)?.data ?? (x as any)?.jsonData ?? (x as any)?.payload ?? (x as any)?.itemData ?? null;
      const parsedData: any = this.safeParseJson(rawData) ?? rawData ?? null;

      const p = Number(
        (x as any)?.procedureNo ??
        (x as any)?.procedureIndex ??
        (x as any)?.serviceIndex ??
        (x as any)?.serviceNo ??
        parsedData?.procedureNo ??
        parsedData?.procedureIndex ??
        parsedData?.serviceIndex ??
        parsedData?.serviceNo
      );

      if (Number.isFinite(p) && p > 0) set.add(p);
    }

    // 2) Backward compatible fallback: derive procedureNos from authData procedureN_* keys
    if (!set.size) {
      const keys = Object.keys(this.authData ?? {});
      for (const k of keys) {
        const m = /^procedure(\d+)_/i.exec(k);
        if (m) set.add(Number(m[1]));
      }
    }

    const nums = Array.from(set)
      .filter((n) => Number.isFinite(n) && n > 0)
      .sort((a, b) => a - b);
    const procedureNos = nums.length ? nums : [];

    this.tabs = procedureNos.map((n, idx) => {
      const dd = this.getExistingDecisionDetails(n) ?? {};
      const code = this.asDisplayString(dd?.serviceCode ?? dd?.procedureCode ?? this.authData?.[`procedure${n}_procedureCode`]).trim();
      const decisionNo = this.asDisplayString(dd?.decisionNumber).trim() || String(n);

      const fromDate = this.formatDateShort(dd?.fromDate ?? this.authData?.[`procedure${n}_fromDate`]);
      const toDate = this.formatDateShort(dd?.toDate ?? this.authData?.[`procedure${n}_toDate`]);
      const line2 = (fromDate !== 'N/A' || toDate !== 'N/A')
        ? `From: ${fromDate !== 'N/A' ? fromDate : '-'}  To: ${toDate !== 'N/A' ? toDate : '-'}`
        : '';

      const status = this.computeTabStatus(n);
      const line1 = `Decision #${decisionNo}${code ? ` | Code: ${code}` : ''}`;

      return {
        id: idx + 1,
        procedureNo: n,
        procedureCode: code,
        statusText: status.label,
        statusCode: status.label,
        statusClass: status.statusClass,
        line1,
        line2,
        line3: status.label,
        // Backward compatibility
        name: line1,
        subtitle: line2
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

    // IMPORTANT: ensure validators only apply to visible+enabled controls
    this.syncVisibility();

    if (this.form.invalid) {
      this.markVisibleControlsTouched();
      this.errorMsg = 'Please fill the required fields before saving.';
      return;
    }

    const userId = Number(sessionStorage.getItem('loggedInUserid') || 0);
    const authDetailId = this.authDetailId;
    const procNo = this.activeState.tab.procedureNo;

    const calls: any[] = [];

    for (const sec of this.activeState.sections) {
      const payload = this.buildSectionPayload(procNo, sec);

      // Timestamp rules apply only to Decision Details
      if (sec.sectionName === 'Decision Details') {
        this.applyDecisionTimestamps(procNo, payload);
      }

      const existingId = this.activeState.itemIdsBySection?.[sec.sectionName];
      if (existingId) {
        calls.push(
          this.api.updateItem(authDetailId, sec.sectionName, existingId, { data: payload } as any, userId)
        );
      } else {
        calls.push(
          this.api.createItem(authDetailId, sec.sectionName, { data: payload } as any, userId)
        );
      }
    }

    this.saving = true;
    this.errorMsg = '';

    forkJoin(calls)
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
          // refresh only items, keep template + auth data
          this.refreshItemsOnly();
        }
      });
  }

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
        // No cross-step fallback here: Decision Details are seeded after AuthDetails save.

        const normalized = String(field.type ?? '').toLowerCase() === 'select'
          ? (this.extractPrimitive(v) ?? v)
          : v;

        const t = String(field.type ?? '').toLowerCase();
        if (t === 'datetime-local') {
          field.value = this.toDateTimeLocalString(normalized) ?? this.defaultValueForType(field.type);
        } else {
          field.value = normalized ?? this.defaultValueForType(field.type);
        }
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

    // Decision Status -> Decision Status Code dependency
    this.wireDecisionStatusCodeDependency();

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

  private findItemForSectionAndProcedure(sectionName: DecisionSectionName, procedureNo: number): { itemId: string | null; data: any } {
    const list = (this.itemsBySection?.[sectionName] ?? []) as any[];
    if (!Array.isArray(list) || !list.length) return { itemId: null, data: {} };

    const match = list.find((x) => {
      // Some APIs store procedureNo at the top-level; others store it inside the section's `data` json.
      const rawData: any = (x as any)?.data ?? (x as any)?.jsonData ?? (x as any)?.payload ?? (x as any)?.itemData ?? null;
      const parsedData: any = this.safeParseJson(rawData) ?? rawData ?? null;

      const p = Number(
        (x as any)?.procedureNo ??
        (x as any)?.procedureIndex ??
        (x as any)?.serviceIndex ??
        (x as any)?.serviceNo ??
        parsedData?.procedureNo ??
        parsedData?.procedureIndex ??
        parsedData?.serviceIndex ??
        parsedData?.serviceNo
      );

      return p === procedureNo;
    });

    const picked = match ?? (procedureNo === 1 ? list[0] : null);
    if (!picked) return { itemId: null, data: {} };

    const itemId = String((picked as any)?.itemId ?? (picked as any)?.id ?? (picked as any)?.decisionItemId ?? '');
    const raw = (picked as any)?.data ?? (picked as any)?.jsonData ?? (picked as any)?.payload ?? (picked as any)?.itemData ?? {};
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
      this.ensureDecisionStatusDefaultIfNeeded(f);
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
          this.ensureDecisionStatusDefaultIfNeeded(f);
        }
        continue;
      }

      this.dsLookup.getOptionsWithFallback(
        ds,
        (r: any) => this.mapDatasourceRowToOption(ds, r) as any,
        ['UM', 'Admin', 'Provider']
      )
        .subscribe((opts) => {
          const safe = (opts ?? []) as any[];

          this.dropdownCache.set(ds, safe);

          for (const f of fields) {
            const finalOpts = this.filterBySelectedOptions(f, safe);
            this.optionsByControlName[f.controlName] = finalOpts;
            this.reconcileSelectValue(f);
            this.ensureDecisionStatusDefaultIfNeeded(f);
          }
        });

    }
  }

  private isDecisionStatusField(field: DecisionFieldVm): boolean {
    return String(field?.id ?? '').trim().toLowerCase() === 'decisionstatus';
  }

  private findPendedStatusOption(options: UiSmartOption[]): UiSmartOption | null {
    for (const o of (options ?? [])) {
      const lbl = String((o as any)?.label ?? (o as any)?.text ?? '').trim().toLowerCase();
      if (lbl.startsWith('pend')) return o;
      const raw: any = (o as any)?.raw;
      const rawLbl = String(raw?.name ?? raw?.label ?? raw?.text ?? raw?.decisionStatusName ?? '').trim().toLowerCase();
      if (rawLbl.startsWith('pend')) return o;
    }
    return null;
  }

  /**
   * Requirement: Decision Status dropdown should display "Pended" by default on first load.
   * We set the control to the option whose label is "Pended" (or starts with "Pend").
   * This avoids hardcoding ids (0/1/etc.).
   */
  private ensureDecisionStatusDefaultIfNeeded(field: DecisionFieldVm): void {
    if (!this.activeState || !this.form) return;
    if (!this.isDecisionStatusField(field)) return;

    const ctrl = this.form.get(field.controlName);
    if (!ctrl) return;

    const current = this.extractPrimitive(this.unwrapValue(ctrl.value)) ?? this.unwrapValue(ctrl.value);
    const hasValue = String(current ?? '').trim() !== '';
    if (hasValue) return;

    const opts = this.optionsByControlName[field.controlName] ?? [];
    const pended = this.findPendedStatusOption(opts);
    if (!pended) return;

    this.pendedDecisionStatusValue = (pended as any).value;
    ctrl.setValue((pended as any).value, { emitEvent: false });
    field.value = (pended as any).value;
  }

  /**
   * Filter Decision Status Code options based on selected Decision Status.
   * Common pattern: Approved status shows approval reason codes; Denied status shows denial reason codes.
   */
  private wireDecisionStatusCodeDependency(): void {
    if (!this.activeState || !this.form) return;

    const ddSection = this.activeState.sections.find(s => s.sectionName === 'Decision Details');
    if (!ddSection) return;

    const statusField = ddSection.fields.find(f => String(f.id).toLowerCase() === 'decisionstatus');
    const statusCodeField = ddSection.fields.find(f => String(f.id).toLowerCase() === 'decisionstatuscode');
    if (!statusField || !statusCodeField) return;

    const statusCtrl = this.form.get(statusField.controlName);
    const codeCtrl = this.form.get(statusCodeField.controlName);
    if (!statusCtrl || !codeCtrl) return;

    // Optional Decision DateTime control: update it when status changes (UX requirement)
    const decisionDtField = ddSection.fields.find(f => String(f.id).toLowerCase() === 'decisiondatetime');
    const decisionDtCtrl = decisionDtField ? this.form.get(decisionDtField.controlName) : null;

    const getFullOpts = (): SmartOpt[] => {
      const ds = String((statusCodeField as any).datasource ?? '').trim();
      if (ds) return (this.dropdownCache.get(ds) ?? []) as SmartOpt[];
      return (this.optionsByControlName[statusCodeField.controlName] ?? []) as SmartOpt[];
    };

    const applyFilter = () => {
      const rawStatus = this.extractPrimitive(this.unwrapValue(statusCtrl.value)) ?? this.unwrapValue(statusCtrl.value);
      const statusKey = String(rawStatus ?? '').trim();
      this.syncApprovedDeniedToRequested(ddSection, statusField, statusKey);
      const full = getFullOpts();

      // Pended => clear statusCode
      if (this.isPendedStatus(statusKey)) {
        this.optionsByControlName[statusCodeField.controlName] = [];
        if (codeCtrl.value) codeCtrl.setValue(null, { emitEvent: false });

        // If status is pended, decisionDateTime should not be set
        if (decisionDtCtrl && decisionDtCtrl.value) {
          decisionDtCtrl.setValue(null, { emitEvent: false });
        }
        return;
      }

      // Non-pended status: if decisionDateTime is empty, set it immediately for display.
      if (decisionDtCtrl) {
        const cur = String(decisionDtCtrl.value ?? '').trim();
        if (!cur) {
          const nowIso = new Date().toISOString();
          decisionDtCtrl.setValue(this.toDateTimeLocalString(nowIso), { emitEvent: false });
        }
      }

      // Filter by matching status id/code on the option's raw object (best-effort)
      const filtered = (full ?? []).filter((o: any) => {
        const raw: any = o?.raw ?? o;
        const cand =
          raw?.decisionStatus ??
          raw?.decisionStatusId ??
          raw?.statusId ??
          raw?.status ??
          raw?.parentId ??
          raw?.groupId ??
          null;
        if (cand === null || cand === undefined || String(cand).trim() === '') return true; // keep if no mapping
        return String(cand).trim() === statusKey;
      });

      const finalOpts = filtered.length ? filtered : full;
      this.optionsByControlName[statusCodeField.controlName] = [...finalOpts];

      // If current selection is not in allowed list, clear it
      const current = this.extractPrimitive(this.unwrapValue(codeCtrl.value)) ?? this.unwrapValue(codeCtrl.value);
      const currentKey = String(current ?? '').trim();
      if (currentKey) {
        const ok = finalOpts.some((o: any) => String((o as any)?.value ?? this.extractPrimitive((o as any)?.raw) ?? '').trim() === currentKey);
        if (!ok) codeCtrl.setValue(null, { emitEvent: false });
      }
    };

    // Apply once on load and on status change
    applyFilter();
    statusCtrl.valueChanges
      .pipe(takeUntil(this.tabDestroy$), takeUntil(this.destroy$))
      .subscribe(() => applyFilter());
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

    const skip = new Set([
      'id',
      'value',
      'code',
      'activeFlag',
      'createdBy',
      'createdOn',
      'updatedBy',
      'updatedOn',
      'deletedBy',
      'deletedOn'
    ]);

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


  /** Map raw datasource values (often 1/2/3 codes) to friendly Decision Status labels. */
  private decisionStatusLabelFromValue(v: any): string | null {
    const s = String(v ?? '').trim().toLowerCase();
    if (!s) return null;

    const n = Number(s);
    if (!Number.isNaN(n)) {
      if (n === 0 || n === 1) return 'Pended';
      if (n === 2) return 'Approved';
      if (n === 3) return 'Denied';
      return null;
    }

    if (s === 'p' || s.startsWith('pend')) return 'Pended';
    if (s === 'a' || s.startsWith('appr')) return 'Approved';
    if (s === 'd' || s.startsWith('den')) return 'Denied';

    return null;
  }


  /** True if datasource refers to Decision Status (NOT Decision Status Code). */
  private isDecisionStatusDatasource(ds: string): boolean {
    const k = this.normDs(ds);
    return k.includes('decisionstatus') && !k.includes('decisionstatuscode');
  }

  /** True if datasource refers to Decision Status Code. */
  private isDecisionStatusCodeDatasource(ds: string): boolean {
    const k = this.normDs(ds);
    return k.includes('decisionstatuscode');
  }

  /** Add decision-specific overrides here if needed */
  private getDatasourcePreferredValue(ds: string, row: any): any {
    const k = this.normDs(ds);
    if (!row) return null;

    // Decision Status Code => use code when available (often string)
    if (k.includes('decisionstatuscode')) {
      return row?.decisionStatusCode ?? row?.statusCode ?? row?.code ?? row?.value ?? row?.id ?? null;
    }

    // Decision Status => prefer id when available
    if (this.isDecisionStatusDatasource(ds)) {
      return row?.decisionStatusId ?? row?.statusId ?? row?.id ?? row?.value ?? row?.code ?? null;
    }

    // Decision Type often uses code as value
    if (k.includes('decisiontype')) {
      return row?.decisionTypeCode ?? row?.typeCode ?? row?.code ?? row?.value ?? row?.id ?? null;
    }

    return null;
  }

  private getDatasourcePreferredLabel(ds: string, row: any): string {
    if (!row) return '';

    // Decision Status specific names
    if (this.isDecisionStatusDatasource(ds)) {
      const candidate =
        row.decisionStatusName ??
        row.statusName ??
        row.name ??
        row.label ??
        row.text ??
        this.pickDisplayField(row);

      return String(candidate ?? '').trim();
    }

    if (this.isDecisionStatusCodeDatasource(ds)) {
      const candidate =
        row.decisionStatusReasonName ??   // example: adjust to your API
        row.decisionStatusCodeName ??
        row.reasonDescription ??
        row.description ??
        row.label ??
        row.text ??
        row.name ??
        this.pickDisplayField(row);

      return String(candidate ?? '').trim();
    }



    // Generic: any descriptive field or pickDisplayField
    const candidate =
      row.label ??
      row.text ??
      row.name ??
      row.description ??
      this.pickDisplayField(row);

    return String(candidate ?? '').trim();
  }


  /** Build a dropdown option from a datasource row, handling primitive rows like [1,2,3]. */
  private mapDatasourceRowToOption(ds: string, r: any): UiSmartOption | null {
    if (r == null) return null;

    // Primitive rows (e.g. [1,2,3])
    if (typeof r === 'string' || typeof r === 'number') {
      const value = r;
      let label: string | null = null;

      if (this.isDecisionStatusDatasource(ds)) {
        label = this.decisionStatusLabelFromValue(value);
      } else if (this.isDecisionStatusCodeDatasource(ds)) {
        label = this.decisionStatusCodeLabelFromValue(value);
      }

      const finalLabel = (label ?? String(value)).trim();
      return { value, label: finalLabel, text: finalLabel, raw: r } as any;
    }

    // object rows (unchanged, but now use DecisionStatusCode branch in getDatasourcePreferredLabel)
    const value = this.getDatasourcePreferredValue(ds, r) ?? r?.value ?? r?.code ?? r?.id;
    const special = this.getDatasourcePreferredLabel(ds, r);
    let label =
      special ??
      r?.label ??
      r?.text ??
      r?.name ??
      r?.description ??
      r?.displayName ??
      r?.title ??
      this.pickDisplayField(r) ??
      null;

    if ((!label || String(label).trim() === '' || String(label) === String(value)) &&
      this.isDecisionStatusDatasource(ds)) {
      const hard =
        this.decisionStatusLabelFromValue(value) ??
        this.decisionStatusLabelFromValue(r?.decisionStatusId ?? r?.statusId ?? r?.id ?? r?.code ?? r?.value);
      if (hard) label = hard;
    }

    if (label == null) label = String(value ?? '');
    const finalLabel = String(label).trim();
    return { value, label: finalLabel, text: finalLabel, raw: r } as any;
  }


  authHasUnsavedChanges(): boolean {
    return this.form?.dirty ?? false;
  }

  // Alias for CanDeactivate guards that expect a different method name
  hasPendingChanges(): boolean {
    return this.authHasUnsavedChanges();
  }

  // Alias for older naming
  hasUnsavedChanges(): boolean {
    return this.authHasUnsavedChanges();
  }


  private decisionStatusCodeLabelFromValue(v: any): string | null {
    const s = String(v ?? '').trim().toLowerCase();
    if (!s) return null;

    const n = Number(s);
    if (!Number.isNaN(n)) {
      if (n === 1) return 'Clinical criteria not met';
      if (n === 2) return 'Benefit exclusion';
      if (n === 3) return 'Administrative denial';
      // extend with your real codes ↖
      return null;
    }

    // optional alpha codes (if you have them)
    if (s === 'c1') return 'Clinical criteria not met';
    if (s === 'b1') return 'Benefit exclusion';
    if (s === 'a1') return 'Administrative denial';

    return null;
  }

  /**
 * If user selects Approved => Appr = Req and Denied = 0
 * If user selects Denied   => Appr = 0   and Denied = Req
 */
  private syncApprovedDeniedToRequested(ddSection: DecisionSectionVm, statusField: DecisionFieldVm, statusKey: string): void {
    if (!this.form || !ddSection) return;

    const statusText = this.getDecisionStatusText(statusField, statusKey).toLowerCase();
    const isApproved = statusText.startsWith('approv');
    const isDenied = statusText.startsWith('deny');

    if (!isApproved && !isDenied) return;

    // Best-effort field discovery (ids can vary by template)
    const reqField =
      this.findFieldByIdCandidates(ddSection, [
        'req',
        'requested',
        'requestedunits',
        'requestedunit',
        'requestedqty',
        'requestedquantity',
        'requestqty',
        'requestquantity',
        'qtyrequested',
        'unitsrequested'
      ], ['requested', 'req']);

    const apprField =
      this.findFieldByIdCandidates(ddSection, [
        'appr',
        'approved',
        'approvedunits',
        'approvedunit',
        'approvedqty',
        'approvedquantity',
        'apprtoreq',
        'appr_to_req',
        'approvedtoreq',
        'approved_to_req'
      ], ['appr', 'approved']);

    const deniedField =
      this.findFieldByIdCandidates(ddSection, [
        'denied',
        'deniedunits',
        'deniedunit',
        'deniedqty',
        'deniedquantity',
        'deniedtoreq',
        'denied_to_req'
      ], ['denied']);

    if (!reqField || !apprField || !deniedField) return;

    const reqCtrl = this.form.get(reqField.controlName);
    if (!reqCtrl) return;

    const reqVal = this.coerceNumber(reqCtrl.value);

    if (isApproved) {
      this.safeSetFieldValue(apprField, reqVal);
      this.safeSetFieldValue(deniedField, 0);
    } else if (isDenied) {
      this.safeSetFieldValue(apprField, 0);
      this.safeSetFieldValue(deniedField, reqVal);
    }
  }

  private getDecisionStatusText(statusField: DecisionFieldVm, statusKey: string): string {
    // Prefer datasource cache mapping (handles id/code -> label)
    const looked = this.lookupDecisionStatusLabel(String(statusKey ?? '').trim());
    if (looked?.label) return String(looked.label);

    // Fallback: try status field options if present
    const opts = (this.optionsByControlName?.[statusField.controlName] ?? []) as any[];
    const match = opts.find(o => String((o as any)?.value ?? '').trim() === String(statusKey ?? '').trim());
    if (match?.label) return String(match.label);

    // Last resort
    return this.asDisplayString(statusKey);
  }

  private findFieldByIdCandidates(section: DecisionSectionVm, idCandidates: string[], displayNeedles: string[]): DecisionFieldVm | null {
    const idSet = new Set((idCandidates ?? []).map(x => String(x ?? '').toLowerCase().trim()).filter(Boolean));

    // 1) exact-ish id match
    const byId = (section.fields ?? []).find(f => idSet.has(String(f?.id ?? '').toLowerCase().trim()));
    if (byId) return byId;

    // 2) displayName contains needles
    const needles = (displayNeedles ?? []).map(x => String(x ?? '').toLowerCase().trim()).filter(Boolean);
    const byDisplay = (section.fields ?? []).find(f => {
      const dn = String(f?.displayName ?? '').toLowerCase();
      return needles.some(n => dn.includes(n));
    });

    return byDisplay ?? null;
  }

  private coerceNumber(v: any): number {
    if (v === null || v === undefined) return 0;
    if (typeof v === 'number' && Number.isFinite(v)) return v;

    // Handle strings like "10", "10.5"
    const n = Number(String(v).replace(/,/g, '').trim());
    return Number.isFinite(n) ? n : 0;
  }

  private safeSetFieldValue(field: DecisionFieldVm, value: any): void {
    if (!this.form || !field) return;
    const ctrl = this.form.get(field.controlName);
    if (!ctrl) return;

    ctrl.setValue(value, { emitEvent: false });
    // keep vm value in sync too (used in some renders / payload builders)
    field.value = value;
  }


}
