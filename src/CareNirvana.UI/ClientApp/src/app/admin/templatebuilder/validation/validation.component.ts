import { Component, ElementRef, Input, OnInit, ViewChild } from '@angular/core';
import { FormControl } from '@angular/forms';
import { MatTableDataSource } from '@angular/material/table';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { Observable } from 'rxjs';
import { debounceTime, map } from 'rxjs/operators';
import { v4 as uuidv4 } from 'uuid';

import { ValidationExpressionsService } from 'src/app/service/validation-expressions.service';
import { CfgvalidationService, CfgValidationDto } from 'src/app/service/cfgvalidation.service';

// ui-smart-dropdown option shape (matches your component)
interface UiSmartOption<T = any> {
  label: string;
  value: T;
  disabled?: boolean;
}

interface ValidationRule {
  id: string;
  errorMessage: string;
  expression: string;
  dependsOn: string[];
  enabled: boolean;
  isError: boolean;
}

@Component({
  selector: 'app-validation',
  templateUrl: './validation.component.html',
  styleUrl: './validation.component.css'
})
export class ValidationComponent implements OnInit {

  // If your builder still needs template fields for label pickers / NL generation:
  // Pass templateJson from parent (optional).
  @Input() templateJson: any;
  isModuleLocked = false;

  // ====== Module + Validation (CfgValidation CRUD) ======
  moduleOptions: UiSmartOption<number>[] = [
    { label: 'CM', value: 1 },
    { label: 'UM', value: 2 },
    { label: 'AG', value: 3 },
    { label: 'Admin', value: 4 }
  ];

  selectedModuleId: number | null = 1;

  validations: CfgValidationDto[] = [];
  validationOptions: UiSmartOption<number>[] = [];
  selectedValidationId: number | null = null;

  validationName = '';                // REQUIRED
  saving = false;
  deleting = false;
  headerError: string | null = null;

  private originalSnapshotJson: string | null = null; // for "Cancel" (revert)

  // ====== Rule Builder (moved from dialog) ======
  displayedColumns: string[] = ['enabled', 'isError', 'errorMessage', 'expression', 'actions'];
  dataSource = new MatTableDataSource<ValidationRule>([]);
  showTabs = false;

  isFocused = false;

  builder: any = {
    mode: 'simple',
    leftField: '',
    operator: '>',
    rightField: '',
    rightConstant: '',
    logical: '',
    leftField2: '',
    operator2: '>',
    rightField2: '',
    rightConstant2: '',
    thenField: '',
    thenValue: '',
    thenConstant: '',
    elseField: '',
    elseValue: '',
    elseConstant: '',
    presetFieldA: '',
    presetFieldB: '',
    presetFieldC: '',
    presetConstant: '',
    presetConstant2: ''
  };

  presets: any[] = [
    { label: 'Date is After Another Date', value: '{A} > {B}', dependsOn: ['{A}', '{B}'], message: '{A} must be after {B}.', tempConstant: '' },
    { label: 'Field is Required', value: '{A} != null', dependsOn: ['{A}'], message: '{A} is required.', tempConstant: '' },
    { label: 'Numeric Range', value: '{A} >= {CONST} && {A} <= {CONST2}', dependsOn: ['{A}', '{CONST}', '{CONST2}'], message: '{A} must be between {CONST} and {CONST2}.', tempConstant: '', tempConstant2: '' },
  ];

  allFields: { id: string; label: string }[] = [];
  allAliases: string[] = [];

  autoCompleteControl = new FormControl('');
  filteredOptions$!: Observable<string[]>;
  showAutocomplete = false;
  newRuleText = '';
  generateError = false;
  testResult: string | null = null;

  @ViewChild('inputElement', { static: false }) inputElement!: ElementRef<HTMLInputElement>;
  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;

  constructor(
    private cfgService: CfgvalidationService,
    private expressionService: ValidationExpressionsService
  ) { }

  ngOnInit(): void {
    this.loadFieldsAndAliases();
    this.setupAutocomplete();

    // initial load
    if (this.selectedModuleId) {
      this.loadTemplateJsonForModule(this.selectedModuleId);
      this.loadValidations(this.selectedModuleId);
    }
  }

  ngAfterViewInit() {
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;
  }

  // =========================
  // Module / Validation CRUD
  // =========================

  private loadTemplateJsonForModule(moduleId: number) {
    this.cfgService.getPrimaryTemplateJson(moduleId).subscribe({
      next: (json) => {
        // API returns object (because backend returns application/json)
        this.templateJson = json;

        // refresh everything that depends on templateJson
        this.loadFieldsAndAliases();
        this.setupAutocomplete();

        // if you want to preserve current rule table, do nothing else here
        // if you want to reset rule builder on module change, do that in onModuleChanged
      },
      error: () => {
        this.templateJson = null;
        this.allFields = [];
        this.allAliases = [];
        this.setupAutocomplete();
      }
    });
  }

  public setValidationContext(type: 'AUTH' | 'CASE'): void {
    const moduleId = type === 'AUTH' ? 2 : 3;
    this.setModuleAndLock(moduleId, true);
  }

  /** Force module selection and optionally lock the dropdown */
  public setModuleAndLock(moduleId: number, lock: boolean): void {
    this.isModuleLocked = lock;

    // IMPORTANT: call your existing flow so it loads templateJson + validations
    // If selectedModuleId already equals moduleId, still load once.
    if (this.selectedModuleId !== moduleId) {
      this.selectedModuleId = moduleId;
      this.onModuleChanged(moduleId);
    } else {
      // If already selected, refresh data to be safe
      this.onModuleChanged(moduleId);
    }
  }

  onModuleChanged(moduleId: number | null) {
    //this.selectedModuleId = moduleId;
    //this.clearEditor(true);
    //if (moduleId) {
    //  this.loadTemplateJsonForModule(moduleId);
    //  this.loadValidations(moduleId);
    //}
    if (this.isModuleLocked && moduleId !== this.selectedModuleId) {
      return;
    }

    this.selectedModuleId = moduleId;
  }

  private loadValidations(moduleId: number) {
    this.cfgService.getAll(moduleId).subscribe({
      next: (rows) => {
        this.validations = rows ?? [];
        this.validationOptions = (this.validations || [])
          .filter(v => !!v.validationId)
          .map(v => ({ label: v.validationName, value: v.validationId as number }));
      },
      error: () => {
        this.validations = [];
        this.validationOptions = [];
      }
    });
  }

  onValidationSelected(validationId: number | null) {
    this.selectedValidationId = validationId;
    this.headerError = null;

    if (!validationId) {
      this.clearEditor(false);
      return;
    }

    const selected = this.validations.find(v => v.validationId === validationId);
    if (!selected) {
      this.clearEditor(false);
      return;
    }

    this.validationName = selected.validationName || '';
    this.loadRulesFromJson(selected.validationJson);
    this.originalSnapshotJson = JSON.stringify({
      validationName: this.validationName,
      rules: this.dataSource.data
    });
  }

  newValidation() {
    this.selectedValidationId = null;
    this.validationName = '';
    this.originalSnapshotJson = null;
    this.dataSource.data = [];
    this.showTabs = false;
    this.testResult = null;
    this.headerError = null;

    // reset builder state
    this.resetBuilder();
  }

  saveValidation() {
    this.headerError = null;

    if (!this.selectedModuleId) {
      this.headerError = 'Module is required.';
      return;
    }
    if (!this.validationName || !this.validationName.trim()) {
      this.headerError = 'Validation Name is required.';
      return;
    }

    const payload: CfgValidationDto = {
      validationId: this.selectedValidationId,
      moduleId: this.selectedModuleId,
      validationName: this.validationName.trim(),
      validationJson: JSON.stringify(this.dataSource.data ?? []),
      activeFlag: true
    };

    this.saving = true;

    if (this.selectedValidationId) {
      this.cfgService.update(this.selectedValidationId, payload).subscribe({
        next: () => {
          this.saving = false;
          this.loadValidations(this.selectedModuleId!);
          // refresh snapshot
          this.originalSnapshotJson = JSON.stringify({ validationName: this.validationName, rules: this.dataSource.data });
        },
        error: () => {
          this.saving = false;
          this.headerError = 'Unable to save changes. Please try again.';
        }
      });
    } else {
      this.cfgService.insert(payload).subscribe({
        next: (res) => {
          this.saving = false;
          const newId = res?.validationId ?? null;
          this.loadValidations(this.selectedModuleId!);
          if (newId) {
            this.selectedValidationId = newId;
            // after list reload, keep selection stable (best effort)
            setTimeout(() => this.onValidationSelected(newId), 200);
          }
        },
        error: () => {
          this.saving = false;
          this.headerError = 'Unable to create validation. Please try again.';
        }
      });
    }
  }

  deleteValidation() {
    if (!this.selectedValidationId) return;
    this.deleting = true;

    this.cfgService.delete(this.selectedValidationId).subscribe({
      next: () => {
        this.deleting = false;
        const moduleId = this.selectedModuleId;
        this.clearEditor(true);
        if (moduleId) this.loadValidations(moduleId);
      },
      error: () => {
        this.deleting = false;
        this.headerError = 'Unable to delete validation. Please try again.';
      }
    });
  }

  cancelChanges() {
    if (!this.originalSnapshotJson) {
      // nothing selected; just clear
      this.clearEditor(false);
      return;
    }

    try {
      const snap = JSON.parse(this.originalSnapshotJson);
      this.validationName = snap.validationName ?? this.validationName;
      this.dataSource.data = snap.rules ?? [];
    } catch {
      // ignore
    }
  }

  private clearEditor(clearSelection: boolean) {
    if (clearSelection) {
      this.selectedValidationId = null;
      this.originalSnapshotJson = null;
    }
    this.validationName = '';
    this.dataSource.data = [];
    this.showTabs = false;
    this.testResult = null;
    this.headerError = null;
    this.resetBuilder();
  }

  private loadRulesFromJson(json: string) {
    try {
      const parsed = JSON.parse(json || '[]');
      const rules = Array.isArray(parsed) ? parsed : (parsed?.rules ?? []);
      const normalized: ValidationRule[] = (rules || []).map((r: any) => ({
        id: r.id || uuidv4(),
        errorMessage: r.errorMessage ?? '',
        expression: r.expression ?? '',
        dependsOn: Array.isArray(r.dependsOn) ? r.dependsOn : [],
        enabled: r.enabled ?? true,
        isError: r.isError ?? true
      }));
      this.dataSource.data = normalized;
    } catch {
      this.dataSource.data = [];
    }
  }

  // =========================
  // Existing functionality (moved from dialog)
  // =========================

  applyFilter(event: Event) {
    const filterValue = (event.target as HTMLInputElement).value.trim().toLowerCase();
    this.dataSource.filter = filterValue;
  }

  private loadFieldsAndAliases() {
    const fields = (this.templateJson?.sections || []).flatMap((section: any) => section.fields || []);
    this.allFields = fields.map((f: any) => ({
      id: f.id || ('unknown_' + Math.random().toString(36).substr(2, 9)),
      label: f.displayName || f.label || f.id || 'Unnamed Field'
    }));
    this.allAliases = Array.from(new Set(fields.map((f: any) => f.displayName || f.label).filter(Boolean)));
  }

  private setupAutocomplete() {
    this.filteredOptions$ = this.autoCompleteControl.valueChanges.pipe(
      debounceTime(200),
      map((value: string | null) => value ?? ''),
      map(value => {
        this.newRuleText = value;

        const fragment = this.getCurrentFragment(value);
        const lower = (fragment || '').toLowerCase();
        if (!lower || lower.length < 1) return [];

        const candidates = [
          ...this.allAliases,
          'must be', 'is required', 'greater than', 'less than',
          'equal to', 'not equal to', 'after', 'before', 'between'
        ];

        return candidates
          .filter(o => o.toLowerCase().includes(lower))
          .slice(0, 25);
      })
    );
  }

  onInputFocus() {
    this.showAutocomplete = true;
  }

  onInputBlur() {
    // small delay so click selection works
    setTimeout(() => this.showAutocomplete = false, 150);
  }

  getCurrentFragment(value: string): string {
    const input = value ?? '';
    const cursorPos = this.inputElement?.nativeElement?.selectionStart ?? input.length;
    const beforeCursor = input.substring(0, cursorPos);
    const match = beforeCursor.match(/[\w\s]*?(\w+)$/);
    return match ? match[1] : '';
  }

  onOptionSelected(selected: string): void {
    const inputEl = this.inputElement.nativeElement;
    const fullText = this.autoCompleteControl.value || '';
    const cursor = inputEl.selectionStart ?? fullText.length;

    const before = fullText.substring(0, cursor);
    const after = fullText.substring(cursor);

    const fragment = this.getCurrentFragment(fullText);
    const replacedBefore = fragment
      ? before.replace(new RegExp(fragment + '$'), selected)
      : before + selected;

    const updated = replacedBefore + after;
    this.autoCompleteControl.setValue(updated);

    setTimeout(() => {
      inputEl.focus();
      const newPos = replacedBefore.length;
      inputEl.setSelectionRange(newPos, newPos);
    });
  }

  addGeneratedValidation() {
    this.generateError = false;

    try {
      const rule = this.expressionService.generateExpressionFromText(this.templateJson, this.newRuleText);
      if (!rule?.expression) {
        this.generateError = true;
        return;
      }

      const newRule: ValidationRule = {
        id: uuidv4(),
        errorMessage: rule.errorMessage || 'Validation failed.',
        expression: rule.expression,
        dependsOn: rule.dependsOn || [],
        enabled: true,
        isError: true
      };

      this.dataSource.data = [...this.dataSource.data, newRule];
      this.autoCompleteControl.setValue('');
      this.newRuleText = '';
    } catch {
      this.generateError = true;
    }
  }

  addStructuredValidation() {
    const expr = this.buildStructuredExpression();
    if (!expr) return;

    const newRule: ValidationRule = {
      id: uuidv4(),
      errorMessage: 'Validation failed.',
      expression: expr,
      dependsOn: [],
      enabled: true,
      isError: true
    };

    this.dataSource.data = [...this.dataSource.data, newRule];
    this.resetBuilder();
  }

  testStructuredRule() {
    // keep existing functionality simple (same as dialog behavior: preview result)
    this.testResult = this.buildStructuredExpression() ? 'Looks valid.' : 'Please complete required fields.';
  }

  removeValidation(index: number) {
    const copy = [...this.dataSource.data];
    copy.splice(index, 1);
    this.dataSource.data = copy;
  }

  getFieldLabel(fieldId: string): string {
    return this.allFields.find(f => f.id === fieldId)?.label || fieldId || '';
  }

  onRightValueChange(isSecond = false) {
    if (!isSecond) this.builder.rightConstant = '';
    else this.builder.rightConstant2 = '';
  }

  onPresetFieldAChange(ev: any) { this.builder.presetFieldA = ev.target.value; }
  onPresetFieldBChange(ev: any) { this.builder.presetFieldB = ev.target.value; }
  onPresetFieldCChange(ev: any) { this.builder.presetFieldC = ev.target.value; }

  isValidPreset(preset: any): boolean {
    return (
      !!this.builder.presetFieldA &&
      (!preset.dependsOn.includes('{B}') || !!this.builder.presetFieldB) &&
      (!preset.dependsOn.includes('{C}') || !!this.builder.presetFieldC) &&
      (!preset.dependsOn.includes('{CONST}') || (preset.tempConstant?.toString().trim() !== '')) &&
      (!preset.dependsOn.includes('{CONST2}') || (preset.tempConstant2?.toString().trim() !== ''))
    );
  }

  applyPreset(label: string, fieldA: string, fieldB: string, fieldC: string, constant: any, constant2: any, preset: any) {
    let expr = preset.value as string;

    expr = expr.replace('{A}', fieldA);
    expr = expr.replace('{B}', fieldB || '');
    expr = expr.replace('{C}', fieldC || '');
    expr = expr.replace('{CONST}', (constant ?? '').toString());
    expr = expr.replace('{CONST2}', (constant2 ?? '').toString());

    const newRule: ValidationRule = {
      id: uuidv4(),
      errorMessage: preset.message
        .replace('{A}', this.getFieldLabel(fieldA))
        .replace('{B}', this.getFieldLabel(fieldB))
        .replace('{C}', this.getFieldLabel(fieldC))
        .replace('{CONST}', (constant ?? '').toString())
        .replace('{CONST2}', (constant2 ?? '').toString()),
      expression: expr,
      dependsOn: [],
      enabled: true,
      isError: true
    };

    this.dataSource.data = [...this.dataSource.data, newRule];

    // reset preset temps
    preset.tempConstant = '';
    preset.tempConstant2 = '';
  }

  isValidStructuredRule(): boolean {
    const b = this.builder;

    if (!b.leftField || !b.operator) return false;

    // NULL checks don't require right side
    if (b.operator !== '== null' && b.operator !== '!= null') {
      if (!b.rightField && !b.rightConstant) return false;
      if (b.rightField === 'constant' && (b.rightConstant === '' || b.rightConstant === null || b.rightConstant === undefined)) return false;
    }

    if (b.mode === 'conditional' && b.logical) {
      if (!b.leftField2 || !b.operator2) return false;
      if (b.operator2 !== '== null' && b.operator2 !== '!= null') {
        if (!b.rightField2 && !b.rightConstant2) return false;
        if (b.rightField2 === 'constant' && (b.rightConstant2 === '' || b.rightConstant2 === null || b.rightConstant2 === undefined)) return false;
      }
    }

    // If THEN clause is being used, ensure it’s valid
    if (b.mode === 'conditional') {
      // THEN only after first condition is valid
      if (b.thenField && !(b.thenValue || b.thenConstant)) return false;
      if (b.thenValue === 'constant' && !b.thenConstant) return false;
      if (b.elseField && !(b.elseValue || b.elseConstant)) return false;
      if (b.elseValue === 'constant' && !b.elseConstant) return false;
    }

    return true;
  }

  buildStructuredExpression(): string {
    if (!this.isValidStructuredRule()) return '';

    const b = this.builder;

    const rightText = () => {
      if (b.operator === '== null' || b.operator === '!= null') return '';
      if (b.rightField === 'constant') return b.rightConstant;
      return b.rightField;
    };

    const rightText2 = () => {
      if (b.operator2 === '== null' || b.operator2 === '!= null') return '';
      if (b.rightField2 === 'constant') return b.rightConstant2;
      return b.rightField2;
    };

    if (b.mode === 'simple') {
      if (b.operator === '== null' || b.operator === '!= null') {
        return `${b.leftField} ${b.operator}`;
      }
      return `${b.leftField} ${b.operator} ${rightText()}`;
    }

    // conditional
    let cond1 = (b.operator === '== null' || b.operator === '!= null')
      ? `${b.leftField} ${b.operator}`
      : `${b.leftField} ${b.operator} ${rightText()}`;

    let cond2 = '';
    if (b.logical) {
      cond2 = (b.operator2 === '== null' || b.operator2 === '!= null')
        ? `${b.leftField2} ${b.operator2}`
        : `${b.leftField2} ${b.operator2} ${rightText2()}`;
    }

    let thenClause = '';
    if (b.thenField && (b.thenValue || b.thenConstant)) {
      const val = b.thenValue === 'constant' ? b.thenConstant : b.thenValue;
      thenClause = ` THEN ${b.thenField} = ${val}`;
    }

    let elseClause = '';
    if (b.elseField && (b.elseValue || b.elseConstant)) {
      const val = b.elseValue === 'constant' ? b.elseConstant : b.elseValue;
      elseClause = ` ELSE ${b.elseField} = ${val}`;
    }

    const middle = b.logical ? ` ${b.logical} ${cond2}` : '';
    return `IF ${cond1}${middle}${thenClause}${elseClause}`;
  }

  private resetBuilder() {
    this.builder = {
      mode: 'simple',
      leftField: '',
      operator: '>',
      rightField: '',
      rightConstant: '',
      logical: '',
      leftField2: '',
      operator2: '>',
      rightField2: '',
      rightConstant2: '',
      thenField: '',
      thenValue: '',
      thenConstant: '',
      elseField: '',
      elseValue: '',
      elseConstant: '',
      presetFieldA: '',
      presetFieldB: '',
      presetFieldC: '',
      presetConstant: '',
      presetConstant2: ''
    };
  }

  onFocus() { this.isFocused = true; }
  onBlur() { this.isFocused = false; }
}
