import { Component, OnDestroy } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { forkJoin, of, Subject } from 'rxjs';
import { catchError, finalize, takeUntil } from 'rxjs/operators';

import { AuthDetailApiService, DecisionSectionName } from 'src/app/service/authdetailapi.service';
import { DatasourceLookupService } from 'src/app/service/crud.service';
import { UiSmartOption } from 'src/app/shared/ui/uismartdropdown/uismartdropdown.component';

type DecisionTab = {
  id: number;              // UI tab id
  procedureNo: number;     // 1..N
  name: string;
  subtitle?: string;
};

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

  // runtime
  isEnabled: boolean;
  value: any; // initial value (form control holds the live value)

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
  // which itemId exists in backend per section for this procedureNo
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

  // tabs built from auth saved data (procedure1_, procedure2_, ...)
  tabs: DecisionTab[] = [];
  selectedTabId: number | null = null;

  // current tab view-model
  activeState: TabState | null = null;

  // Dynamic form (matches AuthDetails/AuthNotes pattern)
  form: FormGroup = this.fb.group({});

  // dropdown options keyed by controlName (required by ui-smart-dropdown)
  optionsByControlName: Record<string, UiSmartOption[]> = {};

  // cached base template sections (no values)
  private templateSections: any[] = [];

  // authdetail.dataJson parsed object (used to detect procedures + defaults)
  private authData: any = {};

  // decision items fetched from API: per sectionName -> array of items
  private itemsBySection: Partial<Record<DecisionSectionName, any[]>> = {};

  // dropdown cache (datasource -> options)
  private dropdownCache = new Map<string, SmartOpt[]>();

  private destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    private api: AuthDetailApiService,
    private dsLookup: DatasourceLookupService
  ) { }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // called by AuthWizardShell (same pattern as AuthNotes/AuthDocuments)
  setContext(ctx: any): void {
    const nextDetailId = Number(ctx?.authDetailId ?? 0) || null;
    const nextTemplateId = Number(ctx?.authTemplateId ?? 0) || null;

    const changed = nextDetailId !== this.authDetailId || nextTemplateId !== this.authTemplateId;
    console.log('AuthDecisionComponent.setContext', { nextDetailId, nextTemplateId, changed });
    this.authDetailId = nextDetailId;
    this.authTemplateId = nextTemplateId;

    // Reload only if context changed (prevents duplicate requests while wizard re-renders)
    if (this.authDetailId && this.authTemplateId) this.reload(this.authDetailId, this.authTemplateId);
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
          // auth data
          this.authData = this.safeParseJson(res?.auth?.dataJson) ?? res?.auth?.data ?? {};

          // template sections
          const rawSections = res?.tmpl?.sections ?? res?.tmpl?.Sections ?? [];
          this.templateSections = Array.isArray(rawSections) ? rawSections : [];
          console.log('AuthDecisionComponent.reload: templateSections', this.templateSections);
          // items
          this.itemsBySection = res?.items ?? {};

          this.buildTabsFromAuthData();
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

  // detect procedures by keys: procedure1_*, procedure2_*, ...
  private buildTabsFromAuthData(): void {
    const keys = Object.keys(this.authData ?? {});
    const set = new Set<number>();

    for (const k of keys) {
      const m = /^procedure(\d+)_/i.exec(k);
      if (m) set.add(Number(m[1]));
    }

    const nums = Array.from(set).filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);

    // fallback: if nothing found, still show 1 tab (some older data won’t have prefixed keys)
    const procedureNos = nums.length ? nums : [1];

    this.tabs = procedureNos.map((n, idx) => {
      const code = this.authData?.[`procedure${n}_procedureCode`];
      const desc = this.authData?.[`procedure${n}_procedureDescription`];
      const fromDate = this.formatDateShort(this.authData?.[`procedure${n}_fromDate`]);
      const toDate = this.formatDateShort(this.authData?.[`procedure${n}_toDate`]);
      const subtitle = [code, desc].filter(Boolean).join(' - ');
      return {
        id: idx + 1,
        procedureNo: n,
        name: `Decision ${n} : (${code || 'N/A'}) ${fromDate} - ${toDate}`,
        subtitle: subtitle || undefined
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

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.errorMsg = 'Please fill the required fields before saving.';
      return;
    }

    const userId = Number(sessionStorage.getItem('loggedInUserid') || 0);
    const authDetailId = this.authDetailId;
    const procNo = this.activeState.tab.procedureNo;

    const calls: any[] = [];

    for (const sec of this.activeState.sections) {
      const payload = this.buildSectionPayload(procNo, sec);

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
          return of(null);
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: () => {
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

  isVisible(_st: TabState, _field: DecisionFieldVm): boolean {
    return true;
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
        //    This is needed because Auth uses different keys for some fields (e.g. procedureCode vs serviceCode)
        //    and we want the decision form to be usable before the first Save.
        if (v === undefined) {
          v = this.getServicePrefillValue(procedureNo, field.id);
        }

        field.value = v ?? this.defaultValueForType(field.type);
      }
    }

    // Build reactive form controls (ui-smart-dropdown / ui-datetime-picker require FormControl)
    this.buildFormForSections(sections, procedureNo);

    // prefetch options for select fields (datasource/static)
    this.prefetchDropdownOptions(sections);

    this.activeState = {
      tab,
      sections,
      itemIdsBySection
    };
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
   * Pre-populate Decision fields from the Service (procedureN_*) data before the first save.
   * This mirrors the behavior in the legacy Decision step where decision rows are seeded from serviceDetails.
   */
  private getServicePrefillValue(procedureNo: number, fieldId: string): any {
    const fid = String(fieldId || '').trim();
    if (!fid) return undefined;

    // Common helpers
    const get = (suffix: string) => this.authData?.[`procedure${procedureNo}_${suffix}`];

    switch (fid) {
      // Always show a decision number even before save
      case 'decisionNumber':
        return String(procedureNo);

      // Decision template uses serviceCode/serviceDescription, but Auth stores these as procedureCode/procedureDescription
      case 'serviceCode':
        return get('procedureCode') ?? get('serviceReq') ?? get('serviceCode');

      case 'serviceDescription':
        return get('procedureDescription') ?? get('serviceDescription');

      // Dates come straight from the service section
      case 'fromDate':
        return get('fromDate') ?? get('effectiveDate');

      case 'toDate':
        return get('toDate');

      // Units (best-effort mapping)
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

      // These typically exist with the same suffix in the Auth service section
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


  // TemplateSectionsResponse can contain duplicates or partial objects because of jsonb_path_query.
  // We only want ONE section object per name, and only those that actually contain a non-empty fields array.
  private extractDecisionSectionsFromTemplate(): any[] {
    const wantedOrder: DecisionSectionName[] = [
      'Decision Details',
      'Member Provider Decision Info',
      'Decision Notes'
    ];
    const wanted = new Set<string>(wantedOrder as unknown as string[]);

    const byName = new Map<string, any>();
    for (const s of this.templateSections ?? []) {
      const name = String((s as any)?.sectionName ?? (s as any)?.SectionName ?? '').trim();
      if (!wanted.has(name)) continue;

      const fields = this.getSectionFields(s);
      if (!Array.isArray(fields) || fields.length === 0) continue;

      if (!byName.has(name)) byName.set(name, s);
    }

    return wantedOrder.map(n => byName.get(n)).filter(Boolean);
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

    for (const sec of sections) {
      for (const f of sec.fields) {
        f.controlName = this.makeControlName(procedureNo, sec.sectionName, f.id);

        const required = !!(f.required || f.isRequired);
        const validators = required ? [Validators.required] : [];
        const ctrl = new FormControl(f.value, validators);
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

    // Try to match by procedure/service index if backend stores it.
    const match = list.find((x) => {
      const p =
        Number((x as any)?.procedureNo ?? (x as any)?.procedureIndex ?? (x as any)?.serviceIndex ?? (x as any)?.serviceNo);
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
          const value = r?.value ?? r?.id ?? r?.code;

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

          // ui-smart-dropdown displays the `text` property; keep label for debugging/compat.
          return { value, label, text: label, raw: r } as any;
        },
        ['UM', 'Admin', 'Provider']
      )
        .subscribe((opts) => {
          const safe = (opts ?? []) as any[];

          // cache (store the full list, then filter per-field)
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
    return (options ?? []).filter(o => allowedSet.has(String((o as any)?.value)));
  }

  private reconcileSelectValue(field: DecisionFieldVm): void {
    const ctrl = this.form.get(field.controlName);
    if (!ctrl) return;

    const v = String(this.unwrapValue(ctrl.value) ?? '').trim();
    if (!v) return;

    const opts = this.optionsByControlName[field.controlName] ?? [];
    const ok = opts.some(o => String((o as any)?.value) === v);
    if (!ok) ctrl.setValue(null, { emitEvent: false });
  }

  private pickMeaningfulLabel(ds: string, row: any, value: any): string {
    const special = this.getDatasourcePreferredLabel(ds, row);
    const dsKey = ds ? this.toCamelCase(ds) : '';

    let label =
      special ??
      row?.label ??
      row?.text ??
      row?.name ??
      row?.description ??
      row?.displayName ??
      row?.title ??
      (dsKey
        ? (row?.[dsKey] ??
          row?.[dsKey.charAt(0).toUpperCase() + dsKey.slice(1)] ??
          row?.[ds])
        : null) ??
      this.pickDisplayField(row) ??
      String(value ?? '');

    // If we're still just echoing the id, try a wider sweep for a human-friendly field.
    const vstr = String(value ?? '').trim();
    if (label && vstr && String(label).trim() === vstr && row && typeof row === 'object') {
      const preferredKeys = [
        'display', 'displayText', 'displayName',
        'status', 'statusName',
        'reason', 'reasonName',
        'type', 'typeName',
        'codeDescription', 'description'
      ];

      for (const k of preferredKeys) {
        const vv = (row as any)?.[k];
        if (typeof vv === 'string' && vv.trim()) {
          label = vv;
          break;
        }
      }

      if (String(label).trim() === vstr) {
        for (const k of Object.keys(row)) {
          if (!k) continue;
          const vv = (row as any)[k];
          const kk = k.toLowerCase();
          if (typeof vv === 'string' && vv.trim() && (kk.endsWith('name') || kk.includes('desc') || kk.includes('text'))) {
            label = vv;
            break;
          }
        }
      }
    }

    return String(label ?? '').trim();
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
          // rebuild state for current tab to pick up created itemIds
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
  private getDatasourcePreferredLabel(ds: string, row: any): string | null {
    const k = this.normDs(ds);
    if (!row) return null;

    // Examples (adjust names if your datasource uses different props)
    if (k === 'decisionstatus') return row?.decisionStatusName ?? row?.statusName ?? row?.name ?? null;
    if (k === 'decisiontype') return row?.decisionTypeName ?? row?.typeName ?? row?.name ?? null;

    return null;
  }


}
