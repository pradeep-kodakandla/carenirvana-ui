import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CrudService } from 'src/app/service/crud.service';
import { debounceTime, Subject } from 'rxjs';
import { COMMA, ENTER } from '@angular/cdk/keycodes';
import { AuthService } from 'src/app/service/auth.service';
import { UiSmartDropdownComponent, UiSmartOption } from 'src/app/shared/ui/uismartdropdown/uismartdropdown.component';
import { of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';

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
  // For layout containers:
  layout?: string;                 // e.g. 'row'
  fields?: TemplateField[];        // sub-fields if this is a row container
  authStatus?: string[];
  isEnabled?: boolean;
  dateOnly?: boolean;
  level?: string[];
  showWhen?: 'always' | 'fieldEquals' | 'fieldNotEquals' | 'fieldhasvalue';
  referenceFieldId?: string | null;
  visibilityValue?: string | number | null;
  requiredWhen?: 'always' | 'whenVisible' | 'never';

  // === Advanced tab ===
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
  entity?: string;        // icd | provider | member | medication | procedure | ...
  datasource?: string;    // API datasource name
  minChars?: number;
  debounceMs?: number;
  displayTemplate?: string;
  valueField?: string;
  fill?: LookupFillMap[];
}

interface DropdownOption {
  id: string;
  value?: string; // Default field to hold dynamic data
}

interface CaseLevelOption {
  id: string;   // store as string for consistent includes()
  label: string;
}

export interface FieldCondition {
  id: number;
  showWhen: 'always' | 'fieldEquals' | 'fieldNotEquals' | 'fieldhasvalue';
  referenceFieldId: string | null;
  value: string | number | null;
  operatorWithPrev?: 'AND' | 'OR'; // only meaningful for index > 0
}

interface TemplateSectionModel {
  sectionName: string;
  order: number;
  fields: TemplateField[];
  subsections?: { [key: string]: TemplateSectionModel };
  // same conditional props as field
  showWhen?: 'always' | 'fieldEquals' | 'fieldNotEquals' | 'fieldhasvalue';
  referenceFieldId?: string | null;
  visibilityValue?: string | number | null;

  // optional: if you already store array conditions like fields do
  conditions?: FieldCondition[];
}

@Component({
  selector: 'app-templatebuilderproperties',
  templateUrl: './templatebuilderproperties.component.html',
  styleUrl: './templatebuilderproperties.component.css'
})
export class TemplatebuilderpropertiesComponent implements OnChanges {

  @Input() selectedField: any;// TemplateField | null = null;
  @Input() selectedSection: TemplateSectionModel | null = null;
  @Input() masterTemplate: { sections?: TemplateSectionModel[] } = {};
  @Output() fieldUpdated = new EventEmitter<TemplateField | TemplateSectionModel>();
  @Output() sectionUpdated = new EventEmitter<TemplateSectionModel>();
  @Input() module: string = 'UM';

  conditionOperatorOptions = [
    { label: 'AND', value: 'AND' as const },
    { label: 'OR', value: 'OR' as const }
  ];

  // Local list of conditions for the selected field
  conditions: FieldCondition[] = [];

  fieldTypeOptions: UiSmartOption<string>[] = [
    { label: 'Text', value: 'text' },
    { label: 'Search', value: 'search' },
    { label: 'Number', value: 'number' },
    { label: 'DateTime', value: 'datetime-local' },
    { label: 'Select', value: 'select' },
    { label: 'Textarea', value: 'textarea' },
    { label: 'Button', value: 'button' }
  ];

  // ShowWhen dropdown options
  showWhenOptions: UiSmartOption<'always' | 'fieldEquals' | 'fieldNotEquals' | 'fieldhasvalue'>[] = [
    { label: 'Always', value: 'always' },
    { label: 'Field equals value', value: 'fieldEquals' },
    { label: 'Field not equal value', value: 'fieldNotEquals' },
    { label: 'Field has any value', value: 'fieldhasvalue' }
  ];

  // Permissions dropdown options
  fieldPermissionOptions: UiSmartOption<'all' | 'careManagers' | 'admins'>[] = [
    { label: 'All Users', value: 'all' },
    { label: 'Care Managers', value: 'careManagers' },
    { label: 'Admins Only', value: 'admins' }
  ];

  // Reference field dropdown options (built from allFields)
  referenceFieldOptions: UiSmartOption<string>[] = [];

  searchText: string = '';
  allCodes: { code: string; label: string }[] = [];
  filteredCodes: { code: string; label: string }[] = [];

  readonly separatorKeysCodes = [ENTER, COMMA];

  dropdownOptions: DropdownOption[] = [];
  private previousDatasource: string | null = null; // Prevents continuous API calls
  statusOptions: string[] = [];// ['Open', 'Close', 'Cancelled', 'Close and Adjusted', 'Reopen', 'Withdrawn'];
  private optionUpdateSubject = new Subject<void>();
  defaultTimeZone?: string;

  caseLevelWarning: string = '';
  caseLevelOptions: CaseLevelOption[] = [];

  constructor(private crudService: CrudService, private authService: AuthService) {
    this.optionUpdateSubject.pipe(debounceTime(500)).subscribe(() => {
      this.emitUpdate();
    });
  }

  // Use this function instead of emitUpdate() directly in the options input field
  debouncedEmitUpdate() {
    this.optionUpdateSubject.next();
  }

  private normalizeField(field: TemplateField): TemplateField {
    return {
      // Default values here
      showWhen: field.showWhen ?? 'always',
      requiredWhen: field.requiredWhen ?? 'always',

      ...field
    };
  }

  ngOnChanges(changes: SimpleChanges) {

    const selectedFieldChanged = !!changes['selectedField']?.currentValue;
    const masterChanged = 'masterTemplate' in changes;
    const allFieldsChanged = 'allFields' in changes;

    this.loadStatusOptions();
    this.loadCaseLevelOptions();
    this.ensureLookupDefaults();

    const currentKey = this.getSelectionKey();
    const selectionChanged = currentKey !== this.lastSelectionKey;

    // Rebuild ReferenceField dropdown whenever the template changes OR the actual selection changes
    if (masterChanged || selectionChanged) {
      this.buildReferenceFieldOptions();
    }

    // Only initialize conditions when user selects a different field/section/subsection
    if (selectionChanged) {
      this.lastSelectionKey = currentKey;
      this.initConditionsFromTarget();
      this.cacheConditionRefIds();
      this.hydrateConditionValueOptions();
    }

    if (changes['selectedField']?.currentValue) {
      this.ensureAtLeastOneCondition();
      if (!this.selectedField?.authStatus) {
        this.selectedField!.authStatus = []; // Ensure it's an array
      }

      // Default isEnabled to true if missing
      if (this.selectedField) {
        if (this.selectedField.isEnabled === undefined) {
          this.selectedField.isEnabled = true;
        }
      }

      // Only call API if the datasource has changed
      const currentDatasource = this.selectedField?.datasource ?? ''; // Ensure a valid string
      if (currentDatasource !== '' && currentDatasource !== this.previousDatasource) {

        this.previousDatasource = currentDatasource; // Store current value safely
        this.onDatasourceChange();
      }

    }

    // ICD/Service code helpers
    if (changes['selectedField']?.currentValue) {
      if (this.selectedField?.id === 'icd10Code' || this.selectedField?.id === 'serviceCode') {

        this.loadCodesForField();
      }
    }

    this.selectAllCaseLevelsIfNeeded();
  }

  emitUpdate() {
    if (this.selectedField) {
      this.fieldUpdated.emit({ ...this.selectedField });
    }
  }

  toggleAuthStatus(status: string, event: any) {
    if (!this.selectedField) return;

    if (!this.selectedField.authStatus) {
      this.selectedField.authStatus = [];
    }

    if (event.target.checked) {
      this.selectedField.authStatus.push(status);
    } else {
      this.selectedField.authStatus = this.selectedField.authStatus.filter((s: any) => s !== status);
    }

    this.emitUpdate();
  }

  //onDatasourceChange() {
  //  if (!this.selectedField?.datasource) {
  //    return;
  //  }

  //  const expectedKey = this.selectedField.datasource.toLowerCase(); // Convert datasource key to lowercase

  //  this.crudService.getData(this.module, this.selectedField.datasource).subscribe(
  //    (data: any[]) => {
  //      this.dropdownOptions = data.map(item => {
  //        // Find the actual key in the API response (ignoring case)
  //        const actualKey = Object.keys(item).find(key => key.toLowerCase() === expectedKey);

  //        // If found, use the actual key; otherwise, default to "Unknown"
  //        const value = actualKey ? item[actualKey] : 'Unknown';

  //        return { id: item.id, value };
  //      });

  //      //  Remove Auto-Selection of Default Value
  //      if (this.selectedField!.defaultValue && !this.dropdownOptions.some(opt => opt.id === this.selectedField!.defaultValue)) {
  //        this.selectedField!.defaultValue = undefined; // ✅ Corrected
  //      }

  //      this.emitUpdate();
  //    },
  //    (error) => {
  //      console.error("Error fetching datasource:", error);
  //    }
  //  );
  //}

  onDatasourceChange() {
    const ds = this.selectedField?.datasource;
    if (!ds) return;

    const expectedKey = ds.toLowerCase();

    const mapOptions = (data: any[]) => {
      const rows = Array.isArray(data) ? data : [];

      this.dropdownOptions = rows.map(item => {
        const actualKey = Object.keys(item || {}).find(k => k.toLowerCase() === expectedKey);
        const value = actualKey ? item[actualKey] : 'Unknown';
        return { id: item?.id, value };
      });

      // Remove auto-selection if defaultValue is no longer valid
      if (
        this.selectedField?.defaultValue &&
        !this.dropdownOptions.some(opt => opt.id === this.selectedField!.defaultValue)
      ) {
        this.selectedField!.defaultValue = undefined;
      }

      this.emitUpdate();
    };

    const getSafe = (moduleName: string) =>
      this.crudService.getData(moduleName, ds).pipe(
        map(res => (Array.isArray(res) ? res : [])),
        catchError(err => {
          console.error(`Error fetching datasource for module '${moduleName}':`, err);
          return of([] as any[]);
        })
      );

    // 1) current module -> 2) Admin -> 3) Provider
    getSafe(this.module).pipe(
      switchMap(rows => (rows.length ? of(rows) : getSafe('Admin'))),
      switchMap(rows => (rows.length ? of(rows) : getSafe('Provider')))
    ).subscribe(rows => {
      mapOptions(rows);
    });
  }

  emitSectionUpdate() {
    if (this.selectedSection) {
      this.sectionUpdated.emit({ ...this.selectedSection });
    }
  }

  toCamelCase(str: string): string {
    if (!str) return ''; // Handle empty string case

    // If the string is already in camelCase, return it
    if (/^[a-z]+([A-Z][a-z]*)*$/.test(str)) {
      return str;
    }

    return str
      .toLowerCase() // Ensure all lowercase first
      .replace(/(?:^|[\s-_])(\w)/g, (match, letter, index) =>
        index === 0 ? letter.toLowerCase() : letter.toUpperCase() // First letter remains lowercase
      );
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

  onOptionsChange(selected: string[]) {
    if (this.selectedField) {
      this.selectedField.selectedOptions = selected.filter(val => val !== 'SELECT_ALL');
      this.emitUpdate();
    }
  }

  toggleSelectAll() {
    if (!this.selectedField) return;

    if (this.isAllSelected()) {
      this.selectedField.selectedOptions = [];
    } else {
      this.selectedField.selectedOptions = this.dropdownOptions.map(opt => opt.id);
    }
    this.emitUpdate();
  }

  setDefault(optionId: string) {
    if (this.selectedField) {
      this.selectedField.defaultValue = optionId;
      this.emitUpdate();
    }
  }

  addOption() {
    if (this.selectedField) {
      if (!this.selectedField.options) {
        this.selectedField.options = [];
      }
      this.selectedField.options.push('');
      this.emitUpdate();
    }
  }

  removeOption(index: number) {
    if (this.selectedField?.options) {
      this.selectedField.options.splice(index, 1);
      this.emitUpdate();
    }
  }

  onCheckboxChange(optionId: string, event: any) {
    if (!this.selectedField) return;

    if (!this.selectedField.selectedOptions) {
      this.selectedField.selectedOptions = [];
    }

    if (event.target.checked) {
      if (!this.selectedField.selectedOptions.includes(optionId)) {
        this.selectedField.selectedOptions.push(optionId);
      }
    } else {
      this.selectedField.selectedOptions = this.selectedField.selectedOptions.filter((id: any) => id !== optionId);
    }

    this.emitUpdate();
  }

  checkAndTriggerDatasourceChange() {
    const currentDatasource = this.selectedField?.datasource ?? ''; // Ensure a valid string

    if (currentDatasource !== '' && currentDatasource !== this.previousDatasource) {
      this.previousDatasource = currentDatasource;
      this.onDatasourceChange();
    }
  }

  clearDefaultSelection() {
    if (this.selectedField) {
      this.selectedField.defaultValue = undefined; // Reset the default selection
      this.emitUpdate();
    }
  }

  /**********ICD Code logic************** */
  loadCodesForField(): void {
    if (!this.selectedField) return;

    const type = this.selectedField.id === 'icd10Code' ? 'ICD' : 'CPT';
    this.authService.getAllCodesets(type).subscribe((data: any[]) => {
      this.allCodes = data
        .filter(d => d.type === type)
        .map(d => ({
          code: d.code,
          label: `${d.code} - ${d.codeDesc || ''}`
        }));

      this.filteredCodes = [...this.allCodes];
    });
  }

  filterCodes(): void {
    const q = this.searchText.toLowerCase();

    this.filteredCodes = this.allCodes.filter(item =>
      item.label.toLowerCase().includes(q) &&
      !this.selectedField?.selectedOptions?.includes(item.code)
    );
  }

  selectCode(option: { code: string; label: string }): void {
    if (!this.selectedField) return;

    if (!this.selectedField.selectedOptions) {
      this.selectedField.selectedOptions = [];
    }

    if (!this.selectedField.selectedOptions.includes(option.code)) {
      this.selectedField.selectedOptions.push(option.code); // ✅ Save only code
      this.emitUpdate();
    }

    this.searchText = '';
    this.filteredCodes = [];
  }

  addCodeFromText(): void {
    if (!this.selectedField) return;

    const code = this.searchText.trim().toUpperCase();
    if (!this.selectedField.selectedOptions) {
      this.selectedField.selectedOptions = [];
    }

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

  activeTab: 'basic' | 'conditional' | 'advanced' = 'basic';

  setActiveTab(tab: 'basic' | 'conditional' | 'advanced'): void {
    this.activeTab = tab;
  }

  // Optional – if you want a list of other fields for "Reference Field"
  @Input() allFields: any[] = []; // populate from parent if needed

  private initConditionsFromField(): void {
    if (!this.selectedField) {
      this.conditions = [];
      return;
    }

    // If the field already has conditions (future-proof)
    if ((this.selectedField as any).conditions?.length) {
      this.conditions = (this.selectedField as any).conditions.map((c: FieldCondition, index: number) => ({
        id: index + 1,
        showWhen: c.showWhen ?? 'always',
        referenceFieldId: c.referenceFieldId ?? null,
        value: c.value ?? null,
        operatorWithPrev: c.operatorWithPrev
      }));
      return;
    }

    // Backward-compatible: build first condition from existing single properties
    this.conditions = [
      {
        id: 1,
        showWhen: this.selectedField.showWhen || 'always',
        referenceFieldId: this.selectedField.referenceFieldId ?? null,
        value: this.selectedField.visibilityValue ?? null
      }
    ];
  }

  private syncConditionsToField(): void {
    if (!this.selectedField) return;

    // Persist as array for future use
    (this.selectedField as any).conditions = this.conditions;

    // For backward compatibility: map the FIRST condition back to the flat properties
    const first = this.conditions[0];
    if (first) {
      this.selectedField.showWhen = first.showWhen;
      this.selectedField.referenceFieldId = first.referenceFieldId;
      this.selectedField.visibilityValue = first.value;
    }

    // Trigger your existing update
    this.emitUpdate();
  }

  addCondition(afterIndex: number): void {
    const newId = (this.conditions[this.conditions.length - 1]?.id || 0) + 1;

    const operator: 'AND' | 'OR' = 'AND'; // default, user can change

    const newCondition: FieldCondition = {
      id: newId,
      showWhen: 'fieldEquals',
      referenceFieldId: null,
      value: null,
      operatorWithPrev: operator
    };

    // Insert after the given index
    this.conditions.splice(afterIndex + 1, 0, newCondition);
    this.onConditionChanged();
  }

  removeCondition(index: number): void {
    if (this.conditions.length === 1) {
      // Instead of removing last one, just reset it
      this.conditions[0] = {
        ...this.conditions[0],
        operatorWithPrev: undefined,
        showWhen: 'always',
        referenceFieldId: null,
        value: null
      };
    } else {
      this.conditions.splice(index, 1);

      // Ensure first item has no operator
      if (this.conditions.length && this.conditions[0].operatorWithPrev) {
        this.conditions[0].operatorWithPrev = undefined;
      }
    }

    this.onConditionChanged();
  }

  // When any piece of a condition changes (showWhen, ref, value, operator)
  onConditionChanged(): void {
    this.syncConditionsToTarget();
  }

  private ensureAtLeastOneCondition(): void {
    if (!this.conditions || this.conditions.length === 0) {
      this.conditions = [
        {
          id: 1,
          showWhen: (this.selectedField?.showWhen as any) || 'always',
          referenceFieldId: this.selectedField?.referenceFieldId ?? null,
          value: this.selectedField?.visibilityValue ?? null,
          operatorWithPrev: undefined
        }
      ];
    }
  }



  private buildReferenceFieldOptions(): void {
    const excludeId = this.selectedField?.id;
    const options: UiSmartOption<string>[] = [];

    this.referenceFieldMap.clear();

    const fieldName = (x: TemplateField) => (x.displayName || x.label || x.id);

    const push = (field: TemplateField, sectionPath: string) => {
      if (!field.id) return;
      if (excludeId && field.id === excludeId) return;
      if (field.type === 'button') return;

      this.referenceFieldMap.set(field.id, field);

      options.push({
        value: field.id,
        label: `${sectionPath} • ${fieldName(field)}`
      });
    };

    const walkSection = (section: TemplateSectionModel, parentPath: string) => {
      const sectionPath = parentPath ? `${parentPath} / ${section.sectionName}` : section.sectionName;

      (section.fields || []).forEach(f => {
        // row container => map subfields
        if (f.layout === 'row' && Array.isArray(f.fields) && f.fields.length) {
          f.fields.forEach(sf => push(sf, sectionPath));
          return;
        }
        push(f, sectionPath);
      });

      const subs: any = (section as any).subsections;
      if (Array.isArray(subs)) subs.forEach((s: TemplateSectionModel) => s && walkSection(s, sectionPath));
      else if (subs && typeof subs === 'object') Object.values(subs).forEach((s: any) => s && walkSection(s as TemplateSectionModel, sectionPath));
    };

    const sections = this.masterTemplate?.sections;
    if (Array.isArray(sections)) sections.forEach(sec => sec && walkSection(sec, ''));

    const unique = new Map<string, UiSmartOption<string>>();
    options.forEach(o => { if (!unique.has(o.value)) unique.set(o.value, o); });

    this.referenceFieldOptions = Array.from(unique.values()).sort((a, b) => a.label.localeCompare(b.label));
  }


  // Map referenceFieldId -> actual TemplateField (so we can read its type/options/datasource)
  private referenceFieldMap = new Map<string, TemplateField>();

  // If a reference field is "select" + datasource-based, cache its options per condition row
  conditionSelectOptions: Record<number, UiSmartOption<string>[]> = {};

  // Prevent re-initializing conditions while editing the same selection (parent often passes new object references)
  private lastSelectionKey: string | null = null;

  // Track previous referenceFieldId per condition row (prevents clearing value on initial bind)
  private lastRefByCondId = new Map<number, string | null>();

  // Get the selected reference field object for a condition

  private ddValue(ev: any): any {
    // ui-smart-dropdown may emit primitive OR {label,value}
    if (ev && typeof ev === 'object' && 'value' in ev) return (ev as any).value;
    return ev;
  }

  private toStrOrNull(v: any): string | null {
    if (v === null || v === undefined || v === '') return null;
    return String(v);
  }

  private getSelectionKey(): string {
    if (this.selectedField?.id) return `field:${this.selectedField.id}`;
    // subsection selection is passed as selectedSection from parent
    if (this.selectedSection?.sectionName) return `section:${this.selectedSection.sectionName}`;
    return '';
  }

  private cacheConditionRefIds(): void {
    this.lastRefByCondId.clear();
    (this.conditions ?? []).forEach(c => {
      // normalize any object emitted into a string id
      const refId = this.toStrOrNull(this.ddValue(c.referenceFieldId));
      c.referenceFieldId = refId;
      this.lastRefByCondId.set(c.id, refId);
    });
  }

  // Pre-load datasource-backed select options for existing conditions (so Value dropdown can open while editing)
  private hydrateConditionValueOptions(): void {
    for (const cond of this.conditions ?? []) {
      const refId = this.toStrOrNull(this.ddValue(cond.referenceFieldId));
      cond.referenceFieldId = refId;

      const ref = this.getReferenceField(refId);
      if (!ref) continue;

      if (ref.type === 'select') {
        // normalize saved value to string so ui-smart-dropdown matches option.value
        if (cond.value !== null && cond.value !== undefined) cond.value = String(this.ddValue(cond.value));
      }

      if (ref.type === 'select' && ref.datasource && (!ref.options || ref.options.length === 0)) {
        // already loaded
        if (Array.isArray(this.conditionSelectOptions[cond.id]) && this.conditionSelectOptions[cond.id].length) continue;

        const expectedKey = ref.datasource.toLowerCase();
        this.crudService.getData(this.module, ref.datasource).subscribe({
          next: (data: any[]) => {
            const opts = (data ?? []).map(item => {
              const actualKey = Object.keys(item || {}).find(k => k.toLowerCase() === expectedKey);
              const label = actualKey
                ? item[actualKey]
                : (item?.text ?? item?.name ?? item?.description ?? item?.value ?? item?.id ?? 'Unknown');

              const value = item?.id ?? item?.value ?? item?.code ?? item?.key ?? label;

              return { label: String(label ?? ''), value: String(value ?? '') } as UiSmartOption<string>;
            });

            this.conditionSelectOptions[cond.id] = opts;
          },
          error: () => {
            this.conditionSelectOptions[cond.id] = [];
          }
        });
      }
    }
  }

  getReferenceField(referenceFieldId: string | null): TemplateField | undefined {
    if (!referenceFieldId) return undefined;
    return this.referenceFieldMap.get(referenceFieldId);
  }

  // Decide which UI control to show for Value
  getConditionValueKind(cond: FieldCondition): 'select' | 'datetime' | 'date' | 'number' | 'text' {
    const ref = this.getReferenceField(cond.referenceFieldId);
    if (!ref) return 'text';

    if (ref.type === 'select') return 'select';
    if (ref.type === 'datetime-local') return ref.dateOnly ? 'date' : 'datetime';
    if (ref.type === 'number') return 'number';

    return 'text';
  }

  // Options for Value dropdown (when reference field is select)
  getConditionValueOptions(cond: FieldCondition): UiSmartOption<string>[] {
    const ref = this.getReferenceField(cond.referenceFieldId);
    if (!ref) return [];

    // Static options on the field itself
    if (Array.isArray(ref.options) && ref.options.length) {
      return ref.options.map(o => ({ label: o, value: o }));
    }

    // Datasource-based select (loaded on demand)
    return this.conditionSelectOptions[cond.id] ?? [];
  }

  // When Reference Field changes: clear value, and if select+datasource, load options

  // When Value changes for a select reference field: normalize dropdown output into a primitive and sync
  onConditionValueChanged(cond: FieldCondition, ev: any): void {
    const v = this.ddValue(ev);
    cond.value = (v === null || v === undefined) ? null : String(v);
    this.onConditionChanged();
  }

  onReferenceFieldChanged(cond: FieldCondition, ev: any): void {
    const nextRefId = this.toStrOrNull(this.ddValue(ev));
    const prevRefId = this.lastRefByCondId.get(cond.id) ?? this.toStrOrNull(this.ddValue(cond.referenceFieldId));

    // Set normalized reference id on the model
    cond.referenceFieldId = nextRefId;
    this.lastRefByCondId.set(cond.id, nextRefId);

    const userChangedRef = prevRefId !== nextRefId;

    // Clear current value only when user actually changes the reference field
    if (userChangedRef) {
      cond.value = null;
      this.conditionSelectOptions[cond.id] = [];
    }

    const ref = this.getReferenceField(nextRefId);

    // If select field uses datasource and doesn't have static options, fetch dropdown options
    if (ref?.type === 'select' && ref.datasource && (!ref.options || ref.options.length === 0)) {
      const expectedKey = ref.datasource.toLowerCase();

      this.crudService.getData(this.module, ref.datasource).subscribe({
        next: (data: any[]) => {
          const opts = (data ?? []).map(item => {
            const actualKey = Object.keys(item || {}).find(k => k.toLowerCase() === expectedKey);
            const label = actualKey
              ? item[actualKey]
              : (item?.text ?? item?.name ?? item?.description ?? item?.value ?? item?.id ?? 'Unknown');

            const value = item?.id ?? item?.value ?? item?.code ?? item?.key ?? label;

            return { label: String(label ?? ''), value: String(value ?? '') } as UiSmartOption<string>;
          });

          this.conditionSelectOptions[cond.id] = opts;
        },
        error: () => {
          this.conditionSelectOptions[cond.id] = [];
        }
      });
    } else {
      // reset cached options for this row when not datasource-based
      this.conditionSelectOptions[cond.id] = [];
    }

    this.onConditionChanged();
  }

  loadStatusOptions(): void {
    const inputStatus = this.module == 'UM' ? 'authstatus' : 'casestatus';
    this.crudService.getData(this.module, inputStatus).subscribe({
      next: (data: any[]) => {
        // if API returns [{ name: 'Open' }, ...] or [{ value: 'Open' }, ...]
        this.statusOptions = (data ?? [])
          .map(x => (x?.authStatus ?? x?.caseStatus ?? x))
          .filter((v: any) => typeof v === 'string' && v.trim().length > 0);
      },
      error: (err) => {
        console.error('Failed to load auth status options', err);
        this.statusOptions = [];
      }
    });
  }

  private getConditionalTarget(): any {
    // if a subsection is selected, pass that object into selectedSection from parent
    return this.selectedField ?? this.selectedSection;
  }

  private initConditionsFromTarget(): void {
    const target = this.getConditionalTarget();
    if (!target) { this.conditions = []; return; }

    // preferred: array-based conditions (works for field/section/subsection)
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

    // fallback: flat props (showWhen/referenceFieldId/visibilityValue)
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

    // Normalize + clone conditions so we never persist dropdown option objects
    const normalized: FieldCondition[] = (this.conditions ?? []).map((c, idx) => {
      const refId = this.toStrOrNull(this.ddValue(c.referenceFieldId));
      let val: any = c.value;

      // If the reference field is a select, store value as string (matches options)
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

    // Keep UI model in sync with normalized values too
    this.conditions = normalized;
    this.cacheConditionRefIds();

    // Persist as array for field/section/subsection
    (target as any).conditions = normalized;

    // Backward compatibility: map FIRST condition back to flat props
    const first = normalized[0];
    if (first) {
      (target as any).showWhen = first.showWhen;
      (target as any).referenceFieldId = first.referenceFieldId;
      (target as any).visibilityValue = first.value;
    }

    // emit correct event
    if (this.selectedField) this.emitUpdate();
    else this.emitSectionUpdate();
  }

  onDefaultDateTimeChanged(utc: Date | null): void {
    if (!utc) {
      this.selectedField.defaultValue = '';
      this.emitUpdate();
      return;
    }

    const d = utc;
    const pad = (n: number) => String(n).padStart(2, '0');

    // NOTE: this formats in the browser's local timezone.
    // If you want it formatted in selected timezone, I can adjust using Luxon.
    const s =
      `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()} ` +
      `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

    this.selectedField.defaultValue = s;
    this.emitUpdate();
  }


  level?: string[];
  private caseLevelsLoaded = false;

  private loadCaseLevelOptions(): void {
    if (this.module !== 'AG') {
      this.caseLevelOptions = [];
      this.caseLevelsLoaded = false;
      return;
    }
    if (this.caseLevelsLoaded) return;

    this.crudService.getData(this.module, 'caselevel').subscribe({
      next: (data: any[]) => {
        this.caseLevelOptions = (data ?? [])
          .map((x: any) => ({
            id: String(x?.id ?? x?.caseLevelId ?? x?.levelId ?? ''),
            label: String(
              x?.caseLevel ?? x?.levelName ?? x?.name ?? x?.description ?? x?.id ?? ''
            )
          }))
          .filter(o => o.id && o.label);

        this.caseLevelsLoaded = true;

        // ✅ default select all ONLY if field has none (don’t override edit selections)
        this.selectAllCaseLevelsIfNeeded();
      },
      error: (err) => {
        console.error('Failed to load case levels', err);
        this.caseLevelOptions = [];
        this.caseLevelsLoaded = false;
      }
    });
  }

  private normalizeSelectedLevelsToString(): void {
    if (!this.selectedField) return;
    const current = Array.isArray(this.selectedField.level) ? this.selectedField.level : [];
    this.selectedField.level = current.map((x: any) => String(x));
  }

  private selectAllCaseLevelsIfNeeded(): void {
    if (this.module !== 'AG') return;
    if (!this.caseLevelOptions.length) return;

    this.normalizeSelectedLevelsToString();

    const current = this.selectedField.level ?? [];
    if (current.length === 0) {
      this.selectedField.level = this.caseLevelOptions.map(o => o.id); // ✅ default select all
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
      // prevent unselecting the last one
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

  //private selectAllCaseLevelsIfNeeded(): void {
  //  if (this.module !== 'AG') return;
  //  if (!this.selectedField?.required) return;
  //  if (!this.caseLevelOptions.length) return;

  //  const allIds = this.caseLevelOptions.map(o => String(o.id));

  //  if (!Array.isArray(this.selectedField.level)) {
  //    this.selectedField.level = [];
  //  } else {
  //    this.selectedField.level = this.selectedField.level.map((x: any) => String(x));
  //  }

  //  // default select all ONLY when nothing is selected yet
  //  if (this.selectedField.level.length === 0) {
  //    this.selectedField.level = [...allIds];
  //    this.emitUpdate();
  //  }
  //}

  // tries to find the best "id" field from API row
  private getAnyId(item: any): any {
    if (!item) return '';
    return (
      item.id ??
      item.levelId ??
      item.caseLevelId ??
      item.caselevelId ??
      (() => {
        const k =
          Object.keys(item).find(x => x.toLowerCase() === 'id') ??
          Object.keys(item).find(x => x.toLowerCase().endsWith('id'));
        return k ? item[k] : '';
      })()
    );
  }

  onRequiredChanged(): void {
    // if AG required -> force at least one level
    if (this.module === 'AG') {
      this.ensureAtLeastOneCaseLevelSelected();
    }
    this.emitUpdate();
  }

  private ensureAtLeastOneCaseLevelSelected(): void {
    if (this.module !== 'AG') return;
    if (!this.selectedField?.required) return;

    if (!Array.isArray(this.selectedField.level)) {
      this.selectedField.level = [];
    }

    if (this.selectedField.level.length === 0 && this.caseLevelOptions.length > 0) {
      this.selectedField.level = [this.caseLevelOptions[0]];
      this.emitUpdate();
    }
  }

  /******************Lookup Fields ****************/
  private ensureLookupDefaults(): void {
    if (!this.selectedField || this.selectedField.type !== 'search') return;

    if (!this.selectedField.lookup) {
      this.selectedField.lookup = {
        enabled: false,
        entity: 'member',
        datasource: '',
        minChars: 2,
        debounceMs: 250,
        displayTemplate: '',
        valueField: '',
        fill: []
      };
    }

    if (!Array.isArray(this.selectedField.lookup.fill)) {
      this.selectedField.lookup.fill = [];
    }
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

  lookupEntityOptions: UiSmartOption<string>[] = [
    { label: 'ICD', value: 'icd' },
    { label: 'Member', value: 'member' },
    { label: 'Provider', value: 'provider' },
    { label: 'Medication', value: 'medication' },
    { label: 'Procedure', value: 'procedure' }
  ];



}
