import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CrudService } from 'src/app/service/crud.service';
import { debounceTime, Subject } from 'rxjs';
import { COMMA, ENTER } from '@angular/cdk/keycodes';
import { AuthService } from 'src/app/service/auth.service';
import { UiSmartDropdownComponent, UiSmartOption } from 'src/app/shared/ui/uismartdropdown/uismartdropdown.component';

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

  showWhen?: 'always' | 'fieldEquals' | 'fieldNotEquals';
  referenceFieldId?: string | null;
  visibilityValue?: string | number | null;
  requiredWhen?: 'always' | 'whenVisible' | 'never';

  // === Advanced tab ===
  apiEndpoint?: string | null;
  enableAuditTrail?: boolean;
  includeInExport?: boolean;
  fieldPermission?: 'all' | 'careManagers' | 'admins';
}
interface DropdownOption {
  id: string;
  value?: string; // Default field to hold dynamic data
}

export interface FieldCondition {
  id: number;
  showWhen: 'always' | 'fieldEquals' | 'fieldNotEquals';
  referenceFieldId: string | null;
  value: string | number | null;
  operatorWithPrev?: 'AND' | 'OR'; // only meaningful for index > 0
}

interface TemplateSectionModel {
  sectionName: string;
  order: number;
  fields: TemplateField[];
  subsections?: { [key: string]: TemplateSectionModel };
}

@Component({
  selector: 'app-templatebuilderproperties',
  templateUrl: './templatebuilderproperties.component.html',
  styleUrl: './templatebuilderproperties.component.css'
})
export class TemplatebuilderpropertiesComponent implements OnChanges {

  @Input() selectedField: TemplateField | null = null;
  @Input() selectedSection: TemplateSectionModel | null = null;
  @Input() masterTemplate: { sections?: TemplateSectionModel[] } = {};
  @Output() fieldUpdated = new EventEmitter<TemplateField>();
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
    { label: 'Number', value: 'number' },
    { label: 'DateTime', value: 'datetime-local' },
    { label: 'Select', value: 'select' },
    { label: 'Textarea', value: 'textarea' },
    { label: 'Button', value: 'button' }
  ];

  // ShowWhen dropdown options
  showWhenOptions: UiSmartOption<'always' | 'fieldEquals' | 'fieldNotEquals'>[] = [
    { label: 'Always', value: 'always' },
    { label: 'Field equals value', value: 'fieldEquals' },
    { label: 'Field not equal value', value: 'fieldNotEquals' }
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
  authStatusOptions: string[] = ['Open', 'Close', 'Cancelled', 'Close and Adjusted', 'Reopen', 'Withdrawn'];
  private optionUpdateSubject = new Subject<void>();

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

    // Rebuild ReferenceField dropdown whenever the template or selection changes
    if (changes['selectedField'] || changes['masterTemplate']) {
      this.buildReferenceFieldOptions();
    }
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
      this.selectedField.authStatus = this.selectedField.authStatus.filter(s => s !== status);
    }

    this.emitUpdate();
  }

  onDatasourceChange() {
    if (!this.selectedField?.datasource) {
      return;
    }

    const expectedKey = this.selectedField.datasource.toLowerCase(); // Convert datasource key to lowercase
    console.log("Module", this.module, "Fetching datasource:", this.selectedField.datasource);
    this.crudService.getData(this.module, this.selectedField.datasource).subscribe(
      (data: any[]) => {
        this.dropdownOptions = data.map(item => {
          // Find the actual key in the API response (ignoring case)
          const actualKey = Object.keys(item).find(key => key.toLowerCase() === expectedKey);

          // If found, use the actual key; otherwise, default to "Unknown"
          const value = actualKey ? item[actualKey] : 'Unknown';

          return { id: item.id, value };
        });

        console.log("Dropdown options loaded:", this.dropdownOptions);

        //  Remove Auto-Selection of Default Value
        if (this.selectedField!.defaultValue && !this.dropdownOptions.some(opt => opt.id === this.selectedField!.defaultValue)) {
          this.selectedField!.defaultValue = undefined; // ✅ Corrected
        }

        this.emitUpdate();
      },
      (error) => {
        console.error("Error fetching datasource:", error);
      }
    );
  }

  emitSectionUpdate() {
    if (this.selectedSection) {
      this.sectionUpdated.emit(this.selectedSection);
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
      this.selectedField.selectedOptions = this.selectedField.selectedOptions.filter(id => id !== optionId);
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
    this.selectedField.selectedOptions = this.selectedField.selectedOptions.filter(c => c !== code);
    this.emitUpdate();
  }

  activeTab: 'basic' | 'conditional' | 'advanced' = 'basic';

  setActiveTab(tab: 'basic' | 'conditional' | 'advanced'): void {
    this.activeTab = tab;
  }

  // Optional – if you want a list of other fields for "Reference Field"
  @Input() allFields: any[] = []; // populate from parent if needed

  private buildReferenceFieldOptions(): void {
    const excludeId = this.selectedField?.id;
    const options: UiSmartOption<string>[] = [];

    const fieldName = (x: TemplateField) => (x.displayName || x.label || x.id);

    const push = (id: string | undefined, label: string) => {
      if (!id) return;
      if (excludeId && id === excludeId) return; // avoid self reference
      options.push({ label, value: id });
    };

    const addField = (f: TemplateField, sectionPath: string) => {
      if (f.type === 'button') return;

      // row container => add its sub-fields
      if (f.layout === 'row' && Array.isArray(f.fields) && f.fields.length) {
        f.fields.forEach(sf => push(sf.id, `${sectionPath} • ${fieldName(sf)}`));
        return;
      }

      push(f.id, `${sectionPath} • ${fieldName(f)}`);
    };

    const walkSection = (section: TemplateSectionModel, parentPath: string) => {
      const sectionPath = parentPath ? `${parentPath} / ${section.sectionName}` : section.sectionName;

      (section.fields || []).forEach(f => addField(f, sectionPath));

      // subsections could be object-map OR array
      const subs: any = (section as any).subsections;
      if (Array.isArray(subs)) {
        subs.forEach((s: TemplateSectionModel) => s && walkSection(s, sectionPath));
      } else if (subs && typeof subs === 'object') {
        Object.values(subs).forEach((s: any) => s && walkSection(s as TemplateSectionModel, sectionPath));
      }
    };

    const sections = this.masterTemplate?.sections;
    if (Array.isArray(sections)) {
      sections.forEach(sec => sec && walkSection(sec, ''));
    }

    // De-dupe + sort
    const unique = new Map<string, UiSmartOption<string>>();
    options.forEach(o => { if (!unique.has(o.value)) unique.set(o.value, o); });

    this.referenceFieldOptions = Array.from(unique.values()).sort((a, b) =>
      a.label.localeCompare(b.label)
    );
  }





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
    this.syncConditionsToField();
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

    this.syncConditionsToField();
  }

  // When any piece of a condition changes (showWhen, ref, value, operator)
  onConditionChanged(): void {
    this.syncConditionsToField();
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
}
