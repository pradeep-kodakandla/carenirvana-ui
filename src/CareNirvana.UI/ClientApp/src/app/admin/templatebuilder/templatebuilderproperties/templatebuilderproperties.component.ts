import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CrudService } from 'src/app/service/crud.service';
import { debounceTime, Subject } from 'rxjs';
import { COMMA, ENTER } from '@angular/cdk/keycodes';
import { AuthService } from 'src/app/service/auth.service';
import { UiSmartDropdownComponent, UiSmartOption } from 'src/app/shared/ui/uismartdropdown/uismartdropdown.component';
import { of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';

// ─── Shared model interfaces (keep in sync with templatebuilder.component.ts) ─────

interface TemplateField {
  label: string;
  displayName?: string;
  type: string;
  id: string;
  options?: string[];
  required?: boolean;
  requiredMsg?: string;
  buttonText?: string;
  datasource?: string;
  selectedOptions?: string[];
  defaultValue?: string;
  order?: number;
  layout?: string;
  fields?: TemplateField[];
  authStatus?: string[];
  isEnabled?: boolean;
  dateOnly?: boolean;
  level?: string[];
  showWhen?: 'always' | 'fieldEquals' | 'fieldNotEquals' | 'fieldhasvalue';
  referenceFieldId?: string | null;
  visibilityValue?: string | number | null;
  requiredWhen?: 'always' | 'whenVisible' | 'never';
  apiEndpoint?: string | null;
  enableAuditTrail?: boolean;
  includeInExport?: boolean;
  fieldPermission?: 'all' | 'careManagers' | 'admins';
  lookup?: LookupConfig;
}

interface LookupFillMap {
  targetFieldId: string;
  sourcePath: string;
}

interface LookupConfig {
  enabled?: boolean;
  entity?: string;
  datasource?: string;
  minChars?: number;
  debounceMs?: number;
  displayTemplate?: string;
  valueField?: string;
  fill?: LookupFillMap[];
}

interface DropdownOption {
  id: string;
  value?: string;
}

interface CaseLevelOption {
  id: string;
  label: string;
}

export interface FieldCondition {
  id: number;
  showWhen: 'always' | 'fieldEquals' | 'fieldNotEquals' | 'fieldhasvalue';
  referenceFieldId: string | null;
  value: string | number | null;
  operatorWithPrev?: 'AND' | 'OR';
}

interface TemplateSectionModel {
  sectionName: string;
  order: number;
  fields: TemplateField[];
  subsections?: { [key: string]: TemplateSectionModel };
  showWhen?: 'always' | 'fieldEquals' | 'fieldNotEquals' | 'fieldhasvalue';
  referenceFieldId?: string | null;
  visibilityValue?: string | number | null;
  conditions?: FieldCondition[];
}

@Component({
  selector: 'app-templatebuilderproperties',
  templateUrl: './templatebuilderproperties.component.html',
  styleUrl: './templatebuilderproperties.component.css'
})
export class TemplatebuilderpropertiesComponent implements OnChanges {

  @Input() selectedField: any = null;
  @Input() selectedSection: TemplateSectionModel | null = null;
  @Input() masterTemplate: { sections?: TemplateSectionModel[] } = {};
  @Input() module: string = 'UM';

  // FIX: sectionUpdated is now properly used; routing through fieldUpdated is correct for subsections.
  @Output() fieldUpdated = new EventEmitter<TemplateField | TemplateSectionModel>();
  @Output() sectionUpdated = new EventEmitter<TemplateSectionModel>();

  // ─── Tab state ───────────────────────────────────────────────────────────────────

  activeTab: 'basic' | 'conditional' | 'advanced' = 'basic';

  setActiveTab(tab: 'basic' | 'conditional' | 'advanced'): void {
    this.activeTab = tab;
  }

  // ─── Dropdown options ────────────────────────────────────────────────────────────

  conditionOperatorOptions = [
    { label: 'AND', value: 'AND' as const },
    { label: 'OR',  value: 'OR'  as const }
  ];

  /** FIX: added multicheck, radio, checkbox to match new field types in builder. */
  fieldTypeOptions: UiSmartOption<string>[] = [
    { label: 'Text',           value: 'text'          },
    { label: 'Search',         value: 'search'        },
    { label: 'Number',         value: 'number'        },
    { label: 'Date / Time',    value: 'datetime-local'},
    { label: 'Text Area',      value: 'textarea'      },
    { label: 'Drop Down',      value: 'select'        },
    { label: 'Multi-Select',   value: 'multicheck'    },
    { label: 'Radio Group',    value: 'radio'         },
    { label: 'Checkbox',       value: 'checkbox'      },
    { label: 'Button',         value: 'button'        }
  ];

  showWhenOptions: UiSmartOption<'always' | 'fieldEquals' | 'fieldNotEquals' | 'fieldhasvalue'>[] = [
    { label: 'Always',               value: 'always'          },
    { label: 'Field equals value',   value: 'fieldEquals'     },
    { label: 'Field not equal value',value: 'fieldNotEquals'  },
    { label: 'Field has any value',  value: 'fieldhasvalue'   }
  ];

  fieldPermissionOptions: UiSmartOption<'all' | 'careManagers' | 'admins'>[] = [
    { label: 'All Users',      value: 'all'          },
    { label: 'Care Managers',  value: 'careManagers' },
    { label: 'Admins Only',    value: 'admins'       }
  ];

  lookupEntityOptions: UiSmartOption<string>[] = [
    { label: 'ICD',        value: 'icd'       },
    { label: 'Member',     value: 'member'    },
    { label: 'Provider',   value: 'provider'  },
    { label: 'Medication', value: 'medication'},
    { label: 'Procedure',  value: 'procedure' }
  ];

  referenceFieldOptions: UiSmartOption<string>[] = [];

  // ─── State ───────────────────────────────────────────────────────────────────────

  conditions: FieldCondition[] = [];
  searchText: string = '';
  allCodes: { code: string; label: string }[] = [];
  filteredCodes: { code: string; label: string }[] = [];
  readonly separatorKeysCodes = [ENTER, COMMA];
  dropdownOptions: DropdownOption[] = [];
  statusOptions: string[] = [];
  caseLevelWarning: string = '';
  caseLevelOptions: CaseLevelOption[] = [];

  private previousDatasource: string | null = null;
  private optionUpdateSubject = new Subject<void>();
  private caseLevelsLoaded = false;
  private lastSelectionKey: string | null = null;
  private lastRefByCondId = new Map<number, string | null>();
  private referenceFieldMap = new Map<string, TemplateField>();
  conditionSelectOptions: Record<number, UiSmartOption<string>[]> = {};

  constructor(private crudService: CrudService, private authService: AuthService) {
    this.optionUpdateSubject.pipe(debounceTime(500)).subscribe(() => this.emitUpdate());
  }

  debouncedEmitUpdate() { this.optionUpdateSubject.next(); }

  // ─── Lifecycle ───────────────────────────────────────────────────────────────────

  ngOnChanges(changes: SimpleChanges) {
    const masterChanged = 'masterTemplate' in changes;
    const selectionChanged = this.getSelectionKey() !== this.lastSelectionKey;

    // FIX: gate API calls to run only when selectedField actually changes,
    // not on every input change (e.g. masterTemplate updates).
    if (changes['selectedField']?.currentValue) {
      this.loadStatusOptions();
      this.ensureLookupDefaults();

      if (!this.selectedField?.authStatus) {
        this.selectedField!.authStatus = [];
      }

      if (this.selectedField && this.selectedField.isEnabled === undefined) {
        this.selectedField.isEnabled = true;
      }

      const currentDatasource = this.selectedField?.datasource ?? '';
      if (currentDatasource && currentDatasource !== this.previousDatasource) {
        this.previousDatasource = currentDatasource;
        this.onDatasourceChange();
      }

      if (this.selectedField?.id === 'icd10Code' || this.selectedField?.id === 'serviceCode') {
        this.loadCodesForField();
      }
    }

    // FIX: load case levels only when module changes (guarded by caseLevelsLoaded)
    if (changes['module'] || !this.caseLevelsLoaded) {
      this.loadCaseLevelOptions();
    }

    if (masterChanged || selectionChanged) {
      this.buildReferenceFieldOptions();
    }

    if (selectionChanged) {
      this.lastSelectionKey = this.getSelectionKey();
      this.initConditionsFromTarget();
      this.cacheConditionRefIds();
      this.hydrateConditionValueOptions();
    }

    if (changes['selectedField']?.currentValue) {
      this.ensureAtLeastOneCondition();
      this.selectAllCaseLevelsIfNeeded();
    }
  }

  // ─── Emit helpers ────────────────────────────────────────────────────────────────

  emitUpdate() {
    if (this.selectedField) this.fieldUpdated.emit({ ...this.selectedField });
  }

  emitSectionUpdate() {
    if (this.selectedSection) this.sectionUpdated.emit({ ...this.selectedSection });
  }

  // ─── Auth / case status ──────────────────────────────────────────────────────────

  toggleAuthStatus(status: string, event: any) {
    if (!this.selectedField) return;
    if (!this.selectedField.authStatus) this.selectedField.authStatus = [];

    if (event.target.checked) {
      if (!this.selectedField.authStatus.includes(status)) this.selectedField.authStatus.push(status);
    } else {
      this.selectedField.authStatus = this.selectedField.authStatus.filter((s: any) => s !== status);
    }
    this.emitUpdate();
  }

  loadStatusOptions(): void {
    const inputStatus = this.module === 'UM' ? 'authstatus' : 'casestatus';
    this.crudService.getData(this.module, inputStatus).subscribe({
      next: (data: any[]) => {
        this.statusOptions = (data ?? [])
          .map(x => (x?.authStatus ?? x?.caseStatus ?? x))
          .filter((v: any) => typeof v === 'string' && v.trim().length > 0);
      },
      error: () => { this.statusOptions = []; }
    });
  }

  // ─── Datasource / dropdown ───────────────────────────────────────────────────────

  onDatasourceChange() {
    const ds = this.selectedField?.datasource;
    if (!ds) return;

    const expectedKey = ds.toLowerCase();
    const mapOptions = (data: any[]) => {
      const rows = Array.isArray(data) ? data : [];
      this.dropdownOptions = rows.map(item => {
        const actualKey = Object.keys(item || {}).find(k => k.toLowerCase() === expectedKey);
        return { id: item?.id, value: actualKey ? item[actualKey] : 'Unknown' };
      });
      if (this.selectedField?.defaultValue && !this.dropdownOptions.some(opt => opt.id === this.selectedField!.defaultValue)) {
        this.selectedField!.defaultValue = undefined;
      }
      this.emitUpdate();
    };

    const getSafe = (moduleName: string) =>
      this.crudService.getData(moduleName, ds).pipe(
        map(res => (Array.isArray(res) ? res : [])),
        catchError(() => of([] as any[]))
      );

    getSafe(this.module).pipe(
      switchMap(rows => rows.length ? of(rows) : getSafe('Admin')),
      switchMap(rows => rows.length ? of(rows) : getSafe('Provider'))
    ).subscribe(rows => mapOptions(rows));
  }

  checkAndTriggerDatasourceChange() {
    const currentDatasource = this.selectedField?.datasource ?? '';
    if (currentDatasource && currentDatasource !== this.previousDatasource) {
      this.previousDatasource = currentDatasource;
      this.onDatasourceChange();
    }
  }

  isAllSelected(): boolean {
    return !!this.selectedField?.selectedOptions &&
      this.selectedField.selectedOptions.length === this.dropdownOptions.length;
  }

  isIndeterminate(): boolean {
    return !!this.selectedField?.selectedOptions &&
      this.selectedField.selectedOptions.length > 0 &&
      this.selectedField.selectedOptions.length < this.dropdownOptions.length;
  }

  toggleSelectAll() {
    if (!this.selectedField) return;
    this.selectedField.selectedOptions = this.isAllSelected() ? [] : this.dropdownOptions.map(opt => opt.id);
    this.emitUpdate();
  }

  setDefault(optionId: string) {
    if (this.selectedField) { this.selectedField.defaultValue = optionId; this.emitUpdate(); }
  }

  clearDefaultSelection() {
    if (this.selectedField) { this.selectedField.defaultValue = undefined; this.emitUpdate(); }
  }

  addOption() {
    if (this.selectedField) {
      if (!this.selectedField.options) this.selectedField.options = [];
      this.selectedField.options.push('');
      this.emitUpdate();
    }
  }

  removeOption(index: number) {
    if (this.selectedField?.options) { this.selectedField.options.splice(index, 1); this.emitUpdate(); }
  }

  onCheckboxChange(optionId: string, event: any) {
    if (!this.selectedField) return;
    if (!this.selectedField.selectedOptions) this.selectedField.selectedOptions = [];

    if (event.target.checked) {
      if (!this.selectedField.selectedOptions.includes(optionId)) this.selectedField.selectedOptions.push(optionId);
    } else {
      this.selectedField.selectedOptions = this.selectedField.selectedOptions.filter((id: any) => id !== optionId);
    }
    this.emitUpdate();
  }

  // ─── Case level ──────────────────────────────────────────────────────────────────

  private loadCaseLevelOptions(): void {
    if (this.module !== 'AG') { this.caseLevelOptions = []; this.caseLevelsLoaded = false; return; }
    if (this.caseLevelsLoaded) return;

    this.crudService.getData(this.module, 'caselevel').subscribe({
      next: (data: any[]) => {
        this.caseLevelOptions = (data ?? [])
          .map((x: any) => ({
            id: String(x?.id ?? x?.caseLevelId ?? x?.levelId ?? ''),
            label: String(x?.caseLevel ?? x?.levelName ?? x?.name ?? x?.description ?? x?.id ?? '')
          }))
          .filter(o => o.id && o.label);
        this.caseLevelsLoaded = true;
        this.selectAllCaseLevelsIfNeeded();
      },
      error: () => { this.caseLevelOptions = []; this.caseLevelsLoaded = false; }
    });
  }

  private normalizeSelectedLevelsToString(): void {
    if (!this.selectedField) return;
    const current = Array.isArray(this.selectedField.level) ? this.selectedField.level : [];
    this.selectedField.level = current.map((x: any) => String(x));
  }

  /** FIX: added null guard for selectedField. */
  private selectAllCaseLevelsIfNeeded(): void {
    if (this.module !== 'AG') return;
    if (!this.caseLevelOptions.length) return;
    if (!this.selectedField) return; // FIX: null guard

    this.normalizeSelectedLevelsToString();
    const current = this.selectedField.level ?? [];
    if (current.length === 0) {
      this.selectedField.level = this.caseLevelOptions.map(o => o.id);
      this.emitUpdate();
    }
  }

  toggleCaseLevel(opt: CaseLevelOption, event: any): void {
    if (!this.selectedField) return;
    this.normalizeSelectedLevelsToString();

    const id = String(opt.id);
    const checked = !!event?.target?.checked;
    const levels = this.selectedField.level ?? [];
    const has = levels.includes(id);

    if (!checked) {
      if (levels.length === 1 && has) {
        this.caseLevelWarning = 'At least one level is required.';
        event.target.checked = true;
        setTimeout(() => (this.caseLevelWarning = ''), 2000);
        return;
      }
      this.selectedField.level = levels.filter((x: any) => x !== id);
    } else {
      if (!has) this.selectedField.level = [...levels, id];
    }

    this.caseLevelWarning = '';
    this.emitUpdate();
  }

  onRequiredChanged(): void {
    if (this.module === 'AG') this.ensureAtLeastOneCaseLevelSelected();
    this.emitUpdate();
  }

  private ensureAtLeastOneCaseLevelSelected(): void {
    if (this.module !== 'AG' || !this.selectedField?.required) return;
    if (!Array.isArray(this.selectedField.level)) this.selectedField.level = [];

    if (this.selectedField.level.length === 0 && this.caseLevelOptions.length > 0) {
      // FIX: was assigning the CaseLevelOption object; now correctly assigns the id string
      this.selectedField.level = [this.caseLevelOptions[0].id];
      this.emitUpdate();
    }
  }

  // ─── ICD / service code helpers ──────────────────────────────────────────────────

  loadCodesForField(): void {
    if (!this.selectedField) return;
    const type = this.selectedField.id === 'icd10Code' ? 'ICD' : 'CPT';
    this.authService.getAllCodesets(type).subscribe((data: any[]) => {
      this.allCodes = data.filter(d => d.type === type).map(d => ({ code: d.code, label: `${d.code} - ${d.codeDesc || ''}` }));
      this.filteredCodes = [...this.allCodes];
    });
  }

  filterCodes(): void {
    const q = this.searchText.toLowerCase();
    this.filteredCodes = this.allCodes.filter(item =>
      item.label.toLowerCase().includes(q) && !this.selectedField?.selectedOptions?.includes(item.code)
    );
  }

  selectCode(option: { code: string; label: string }): void {
    if (!this.selectedField) return;
    if (!this.selectedField.selectedOptions) this.selectedField.selectedOptions = [];
    if (!this.selectedField.selectedOptions.includes(option.code)) {
      this.selectedField.selectedOptions.push(option.code);
      this.emitUpdate();
    }
    this.searchText = '';
    this.filteredCodes = [];
  }

  addCodeFromText(): void {
    if (!this.selectedField) return;
    const code = this.searchText.trim().toUpperCase();
    if (!this.selectedField.selectedOptions) this.selectedField.selectedOptions = [];
    if (code && !this.selectedField.selectedOptions.includes(code)) {
      this.selectedField.selectedOptions.push(code);
      this.emitUpdate();
    }
    this.searchText = '';
    this.filteredCodes = [];
  }

  removeCode(code: string): void {
    if (!this.selectedField?.selectedOptions) return;
    this.selectedField.selectedOptions = this.selectedField.selectedOptions.filter((c: any) => c !== code);
    this.emitUpdate();
  }

  // ─── Conditions ──────────────────────────────────────────────────────────────────

  private getConditionalTarget(): any {
    return this.selectedField ?? this.selectedSection;
  }

  private initConditionsFromTarget(): void {
    const target = this.getConditionalTarget();
    if (!target) { this.conditions = []; return; }

    if (Array.isArray(target.conditions) && target.conditions.length) {
      this.conditions = target.conditions.map((c: FieldCondition, index: number) => ({
        id: index + 1,
        showWhen: c.showWhen ?? 'always',
        referenceFieldId: c.referenceFieldId ?? null,
        value: c.value ?? null,
        operatorWithPrev: c.operatorWithPrev
      }));
      if (this.conditions[0]) this.conditions[0].operatorWithPrev = undefined;
      return;
    }

    this.conditions = [{
      id: 1,
      showWhen: target.showWhen ?? 'always',
      referenceFieldId: target.referenceFieldId ?? null,
      value: target.visibilityValue ?? null,
      operatorWithPrev: undefined
    }];
  }

  private syncConditionsToTarget(): void {
    const target = this.getConditionalTarget();
    if (!target) return;

    const normalized: FieldCondition[] = (this.conditions ?? []).map((c, idx) => {
      const refId = this.toStrOrNull(this.ddValue(c.referenceFieldId));
      let val: any = c.value;
      const ref = this.getReferenceField(refId);
      if (ref?.type === 'select') {
        const vv = this.ddValue(val);
        val = (vv === null || vv === undefined) ? null : String(vv);
      }
      return {
        id: idx + 1,
        showWhen: (this.ddValue(c.showWhen) ?? 'always') as any,
        referenceFieldId: refId,
        value: val,
        operatorWithPrev: c.operatorWithPrev
      } as FieldCondition;
    });

    if (normalized[0]) normalized[0].operatorWithPrev = undefined;

    this.conditions = normalized;
    this.cacheConditionRefIds();
    (target as any).conditions = normalized;

    const first = normalized[0];
    if (first) {
      (target as any).showWhen = first.showWhen;
      (target as any).referenceFieldId = first.referenceFieldId;
      (target as any).visibilityValue = first.value;
    }

    if (this.selectedField) this.emitUpdate();
    else this.emitSectionUpdate();
  }

  private ensureAtLeastOneCondition(): void {
    if (!this.conditions || this.conditions.length === 0) {
      this.conditions = [{
        id: 1,
        showWhen: (this.selectedField?.showWhen as any) || 'always',
        referenceFieldId: this.selectedField?.referenceFieldId ?? null,
        value: this.selectedField?.visibilityValue ?? null,
        operatorWithPrev: undefined
      }];
    }
  }

  addCondition(afterIndex: number): void {
    const newId = (this.conditions[this.conditions.length - 1]?.id || 0) + 1;
    this.conditions.splice(afterIndex + 1, 0, {
      id: newId, showWhen: 'fieldEquals', referenceFieldId: null, value: null, operatorWithPrev: 'AND'
    });
    this.onConditionChanged();
  }

  removeCondition(index: number): void {
    if (this.conditions.length === 1) {
      this.conditions[0] = { ...this.conditions[0], operatorWithPrev: undefined, showWhen: 'always', referenceFieldId: null, value: null };
    } else {
      this.conditions.splice(index, 1);
      if (this.conditions.length && this.conditions[0].operatorWithPrev) this.conditions[0].operatorWithPrev = undefined;
    }
    this.onConditionChanged();
  }

  onConditionChanged(): void { this.syncConditionsToTarget(); }

  onConditionValueChanged(cond: FieldCondition, ev: any): void {
    const v = this.ddValue(ev);
    cond.value = (v === null || v === undefined) ? null : String(v);
    this.onConditionChanged();
  }

  onReferenceFieldChanged(cond: FieldCondition, ev: any): void {
    const nextRefId = this.toStrOrNull(this.ddValue(ev));
    const prevRefId = this.lastRefByCondId.get(cond.id) ?? this.toStrOrNull(this.ddValue(cond.referenceFieldId));

    cond.referenceFieldId = nextRefId;
    this.lastRefByCondId.set(cond.id, nextRefId);

    if (prevRefId !== nextRefId) {
      cond.value = null;
      this.conditionSelectOptions[cond.id] = [];
    }

    const ref = this.getReferenceField(nextRefId);
    if (ref?.type === 'select' && ref.datasource && (!ref.options || ref.options.length === 0)) {
      const expectedKey = ref.datasource.toLowerCase();
      this.crudService.getData(this.module, ref.datasource).subscribe({
        next: (data: any[]) => {
          this.conditionSelectOptions[cond.id] = (data ?? []).map(item => {
            const actualKey = Object.keys(item || {}).find(k => k.toLowerCase() === expectedKey);
            const label = actualKey ? item[actualKey] : (item?.text ?? item?.name ?? item?.id ?? 'Unknown');
            const value = item?.id ?? item?.value ?? item?.code ?? label;
            return { label: String(label ?? ''), value: String(value ?? '') } as UiSmartOption<string>;
          });
        },
        error: () => { this.conditionSelectOptions[cond.id] = []; }
      });
    } else {
      this.conditionSelectOptions[cond.id] = [];
    }

    this.onConditionChanged();
  }

  // ─── Reference field helpers ──────────────────────────────────────────────────────

  private buildReferenceFieldOptions(): void {
    const excludeId = this.selectedField?.id;
    const options: UiSmartOption<string>[] = [];
    this.referenceFieldMap.clear();

    const fieldName = (x: TemplateField) => (x.displayName || x.label || x.id);

    const push = (field: TemplateField, sectionPath: string) => {
      if (!field.id || (excludeId && field.id === excludeId) || field.type === 'button') return;
      this.referenceFieldMap.set(field.id, field);
      options.push({ value: field.id, label: `${sectionPath} • ${fieldName(field)}` });
    };

    const walkSection = (section: TemplateSectionModel, parentPath: string) => {
      const sectionPath = parentPath ? `${parentPath} / ${section.sectionName}` : section.sectionName;
      (section.fields || []).forEach(f => {
        if (f.layout === 'row' && Array.isArray(f.fields) && f.fields.length) {
          f.fields.forEach(sf => push(sf, sectionPath));
        } else {
          push(f, sectionPath);
        }
      });
      const subs: any = (section as any).subsections;
      if (Array.isArray(subs)) subs.forEach((s: any) => s && walkSection(s, sectionPath));
      else if (subs && typeof subs === 'object') Object.values(subs).forEach((s: any) => s && walkSection(s as TemplateSectionModel, sectionPath));
    };

    const sections = this.masterTemplate?.sections;
    if (Array.isArray(sections)) sections.forEach(sec => sec && walkSection(sec, ''));

    const unique = new Map<string, UiSmartOption<string>>();
    options.forEach(o => { if (!unique.has(o.value)) unique.set(o.value, o); });
    this.referenceFieldOptions = Array.from(unique.values()).sort((a, b) => a.label.localeCompare(b.label));
  }

  getReferenceField(referenceFieldId: string | null): TemplateField | undefined {
    if (!referenceFieldId) return undefined;
    return this.referenceFieldMap.get(referenceFieldId);
  }

  getConditionValueKind(cond: FieldCondition): 'select' | 'datetime' | 'date' | 'number' | 'text' {
    const ref = this.getReferenceField(cond.referenceFieldId);
    if (!ref) return 'text';
    if (ref.type === 'select' || ref.type === 'multicheck' || ref.type === 'radio') return 'select';
    if (ref.type === 'datetime-local') return ref.dateOnly ? 'date' : 'datetime';
    if (ref.type === 'number') return 'number';
    return 'text';
  }

  getConditionValueOptions(cond: FieldCondition): UiSmartOption<string>[] {
    const ref = this.getReferenceField(cond.referenceFieldId);
    if (!ref) return [];
    if (Array.isArray(ref.options) && ref.options.length) return ref.options.map(o => ({ label: o, value: o }));
    return this.conditionSelectOptions[cond.id] ?? [];
  }

  private cacheConditionRefIds(): void {
    this.lastRefByCondId.clear();
    (this.conditions ?? []).forEach(c => {
      const refId = this.toStrOrNull(this.ddValue(c.referenceFieldId));
      c.referenceFieldId = refId;
      this.lastRefByCondId.set(c.id, refId);
    });
  }

  private hydrateConditionValueOptions(): void {
    for (const cond of this.conditions ?? []) {
      const refId = this.toStrOrNull(this.ddValue(cond.referenceFieldId));
      cond.referenceFieldId = refId;
      const ref = this.getReferenceField(refId);
      if (!ref) continue;

      if (ref.type === 'select' && cond.value !== null && cond.value !== undefined) {
        cond.value = String(this.ddValue(cond.value));
      }

      if (ref.type === 'select' && ref.datasource && (!ref.options || !ref.options.length)) {
        if (Array.isArray(this.conditionSelectOptions[cond.id]) && this.conditionSelectOptions[cond.id].length) continue;
        const expectedKey = ref.datasource.toLowerCase();
        this.crudService.getData(this.module, ref.datasource).subscribe({
          next: (data: any[]) => {
            this.conditionSelectOptions[cond.id] = (data ?? []).map(item => {
              const actualKey = Object.keys(item || {}).find(k => k.toLowerCase() === expectedKey);
              const label = actualKey ? item[actualKey] : (item?.text ?? item?.name ?? item?.id ?? 'Unknown');
              const value = item?.id ?? item?.value ?? item?.code ?? label;
              return { label: String(label ?? ''), value: String(value ?? '') } as UiSmartOption<string>;
            });
          },
          error: () => { this.conditionSelectOptions[cond.id] = []; }
        });
      }
    }
  }

  private getSelectionKey(): string {
    if (this.selectedField?.id) return `field:${this.selectedField.id}`;
    if (this.selectedSection?.sectionName) return `section:${this.selectedSection.sectionName}`;
    return '';
  }

  private ddValue(ev: any): any {
    if (ev && typeof ev === 'object' && 'value' in ev) return (ev as any).value;
    return ev;
  }

  private toStrOrNull(v: any): string | null {
    if (v === null || v === undefined || v === '') return null;
    return String(v);
  }

  // ─── Date helpers ─────────────────────────────────────────────────────────────────

  onDefaultDateTimeChanged(utc: Date | null): void {
    if (!utc) { this.selectedField.defaultValue = ''; this.emitUpdate(); return; }
    const pad = (n: number) => String(n).padStart(2, '0');
    const d = utc;
    this.selectedField.defaultValue =
      `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()} ` +
      `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    this.emitUpdate();
  }

  // ─── Lookup field helpers ────────────────────────────────────────────────────────

  private ensureLookupDefaults(): void {
    if (!this.selectedField || this.selectedField.type !== 'search') return;
    if (!this.selectedField.lookup) {
      this.selectedField.lookup = { enabled: false, entity: 'member', datasource: '', minChars: 2, debounceMs: 250, displayTemplate: '', valueField: '', fill: [] };
    }
    if (!Array.isArray(this.selectedField.lookup.fill)) this.selectedField.lookup.fill = [];
  }

  addLookupFillRow(): void {
    this.ensureLookupDefaults();
    this.selectedField.lookup.fill.push({ targetFieldId: '', sourcePath: '' });
    this.emitUpdate();
  }

  removeLookupFillRow(i: number): void {
    this.selectedField.lookup.fill.splice(i, 1);
    this.emitUpdate();
  }

  toCamelCase(str: string): string {
    if (!str) return '';
    if (/^[a-z]+([A-Z][a-z]*)*$/.test(str)) return str;
    return str.toLowerCase().replace(/(?:^|[\s\-_])(\w)/g, (match, letter, index) =>
      index === 0 ? letter.toLowerCase() : letter.toUpperCase()
    );
  }

  // FIX: removed unused `normalizeField` method
  // FIX: removed dead `level` component-level property
  // FIX: removed dead `'allFields' in changes` check from ngOnChanges
}
