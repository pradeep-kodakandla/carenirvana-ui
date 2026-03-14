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
  styleUrls: ['./validation.component.css']
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
  headerSuccess: string | null = null;
  private successTimer: any = null;

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

  // ====== UM-specific advanced presets (configurable before adding) ======
  duplicateCheckConfig = {
    expanded: false,
    matchFields: ['treatmentType', 'procedureCode', 'beginDate', 'endDate'] as string[],
    excludeStatuses: ['3', '6'] as string[],
    dateOverlapDays: 0,
    errorMessage: 'Potential duplicate authorization found. An existing auth with matching criteria and overlapping dates was detected. Please verify before saving.'
  };

  blockCloseConfig = {
    expanded: false,
    triggerStatuses: ['2', '4'] as string[],
    blockingDecisionStatuses: ['2'] as string[],
    requireDecisionExists: true,
    errorMessage: 'Cannot close this authorization. One or more decisions are still in progress. Please finalize all decisions before closing.'
  };

  // Lookup options for status pickers
  authStatusOptions: UiSmartOption<string>[] = [
    { label: 'Open', value: '1' },
    { label: 'Close', value: '2' },
    { label: 'Cancelled', value: '3' },
    { label: 'Close and Adjusted', value: '4' },
    { label: 'Reopen', value: '5' },
    { label: 'Withdrawn', value: '6' }
  ];

  decisionStatusOptions: UiSmartOption<string>[] = [
    { label: 'Approved', value: '1' },
    { label: 'Pended', value: '2' },
    { label: 'Denied', value: '3' },
    { label: 'Void', value: '4' },
    { label: 'Partial Approval', value: '5' }
  ];

  allFields: { id: string; label: string }[] = [];
  allAliases: string[] = [];

  // ====== Dropdown option arrays for ui-smart-dropdown ======
  operatorOptions: UiSmartOption<string>[] = [
    { label: 'Greater than', value: '>' },
    { label: 'Less than', value: '<' },
    { label: 'Equal to', value: '==' },
    { label: 'Not Equal to', value: '!=' },
    { label: '>= (Not less than)', value: '>=' },
    { label: '<= (Not greater than)', value: '<=' },
    { label: 'Is NULL', value: '== null' },
    { label: 'Is NOT NULL', value: '!= null' }
  ];

  logicalOptions: UiSmartOption<string>[] = [
    { label: '--', value: '' },
    { label: 'AND', value: '&&' },
    { label: 'OR', value: '||' }
  ];

  // These are recomputed when allFields changes
  fieldOptions: UiSmartOption<string>[] = [];
  rightValueOptions: UiSmartOption<string>[] = [];

  autoCompleteControl = new FormControl('');
  filteredOptions$!: Observable<string[]>;
  showAutocomplete = false;
  newRuleText = '';
  generateError = false;
  testResult: string | null = null;

  @ViewChild('inputElement', { static: false }) inputElement!: ElementRef<HTMLInputElement>;

  // Setter-based ViewChild: re-attaches paginator/sort every time *ngIf recreates them
  @ViewChild(MatPaginator) set matPaginator(paginator: MatPaginator) {
    if (paginator) {
      this.dataSource.paginator = paginator;
    }
  }
  @ViewChild(MatSort) set matSort(sort: MatSort) {
    if (sort) {
      this.dataSource.sort = sort;
    }
  }

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
    // Paginator and sort are auto-attached via ViewChild setters
    // (required because *ngIf destroys/recreates the table DOM)
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
    this.headerSuccess = null;

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
    this.headerSuccess = null;

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
          this.originalSnapshotJson = JSON.stringify({ validationName: this.validationName, rules: this.dataSource.data });
          this.showSuccess('Validation saved successfully.');
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
            setTimeout(() => this.onValidationSelected(newId), 200);
          }
          this.showSuccess('Validation created successfully.');
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
        this.showSuccess('Validation deleted successfully.');
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
    this.headerSuccess = null;
    this.resetBuilder();
  }

  /** Show a success message that auto-clears after a delay */
  private showSuccess(message: string, durationMs = 4000): void {
    this.headerError = null;
    this.headerSuccess = message;
    if (this.successTimer) {
      clearTimeout(this.successTimer);
    }
    this.successTimer = setTimeout(() => {
      this.headerSuccess = null;
      this.successTimer = null;
    }, durationMs);
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

  // Sections whose fields should NOT appear in the validation field picker
  private excludedSections = new Set([
    'Authorization Notes',
    'Authorization Documents',
    'Decision Details',
    'Member Provider Decision Info',
    'Decision Notes'
  ]);

  private loadFieldsAndAliases() {
    const fields: any[] = [];

    const collectFields = (source: any) => {
      if (Array.isArray(source.fields)) {
        fields.push(...source.fields);
      }
      if (source.subsections && typeof source.subsections === 'object') {
        for (const key of Object.keys(source.subsections)) {
          collectFields(source.subsections[key]);
        }
      }
    };

    for (const section of (this.templateJson?.sections || [])) {
      if (this.excludedSections.has(section.sectionName)) {
        continue;
      }
      collectFields(section);
    }

    // De-duplicate by field id (same id can appear in multiple sections)
    const seen = new Set<string>();
    const uniqueFields = fields.filter((f: any) => {
      const id = f.id;
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });

    this.allFields = uniqueFields.map((f: any) => ({
      id: f.id || ('unknown_' + Math.random().toString(36).substr(2, 9)),
      label: f.displayName || f.label || f.id || 'Unnamed Field'
    }));
    this.allAliases = Array.from(new Set(uniqueFields.map((f: any) => f.displayName || f.label).filter(Boolean)));

    // Rebuild ui-smart-dropdown option arrays
    this.fieldOptions = this.allFields.map(f => ({ label: f.label, value: f.id }));
    this.rightValueOptions = [
      { label: 'Now', value: 'now' },
      { label: 'Constant', value: 'constant' },
      ...this.fieldOptions
    ];
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
      this.showTabs = false;
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
    this.showTabs = false;
  }

  testStructuredRule() {
    // keep existing functionality simple (same as dialog behavior: preview result)
    this.testResult = this.buildStructuredExpression() ? 'Looks valid.' : 'Please complete required fields.';
  }

  removeValidation(ruleId: string) {
    this.dataSource.data = this.dataSource.data.filter(r => r.id !== ruleId);
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
    this.showTabs = false;
  }

  // ====== UM Advanced Preset — Configuration Methods ======

  /** Build DUPLICATE_CHECK expression from current config */
  get duplicateCheckExpression(): string {
    const cfg = this.duplicateCheckConfig;
    const fields = cfg.matchFields.join(',');
    const excludes = cfg.excludeStatuses.join(',');
    return `DUPLICATE_CHECK(${fields}|${excludes}|${cfg.dateOverlapDays})`;
  }

  /** Build BLOCK_CLOSE expression from current config */
  get blockCloseExpression(): string {
    const cfg = this.blockCloseConfig;
    const triggers = cfg.triggerStatuses.join(',');
    const blocking = cfg.blockingDecisionStatuses.join(',');
    return `BLOCK_CLOSE(${triggers}|${blocking}|${cfg.requireDecisionExists})`;
  }

  /** Toggle a field in the duplicate check match list */
  toggleMatchField(fieldId: string): void {
    const list = this.duplicateCheckConfig.matchFields;
    const idx = list.indexOf(fieldId);
    if (idx >= 0) {
      list.splice(idx, 1);
    } else {
      list.push(fieldId);
    }
  }

  isMatchFieldSelected(fieldId: string): boolean {
    return this.duplicateCheckConfig.matchFields.includes(fieldId);
  }

  /** Toggle an auth status in the exclude list (for duplicate check) */
  toggleExcludeStatus(statusId: string): void {
    const list = this.duplicateCheckConfig.excludeStatuses;
    const idx = list.indexOf(statusId);
    if (idx >= 0) {
      list.splice(idx, 1);
    } else {
      list.push(statusId);
    }
  }

  isExcludeStatusSelected(statusId: string): boolean {
    return this.duplicateCheckConfig.excludeStatuses.includes(statusId);
  }

  /** Toggle an auth status that triggers the close prevention check */
  toggleTriggerStatus(statusId: string): void {
    const list = this.blockCloseConfig.triggerStatuses;
    const idx = list.indexOf(statusId);
    if (idx >= 0) {
      list.splice(idx, 1);
    } else {
      list.push(statusId);
    }
  }

  isTriggerStatusSelected(statusId: string): boolean {
    return this.blockCloseConfig.triggerStatuses.includes(statusId);
  }

  /** Toggle a decision status that blocks closing */
  toggleBlockingDecisionStatus(statusId: string): void {
    const list = this.blockCloseConfig.blockingDecisionStatuses;
    const idx = list.indexOf(statusId);
    if (idx >= 0) {
      list.splice(idx, 1);
    } else {
      list.push(statusId);
    }
  }

  isBlockingDecisionStatusSelected(statusId: string): boolean {
    return this.blockCloseConfig.blockingDecisionStatuses.includes(statusId);
  }

  /** Resolve a status ID to its display label */
  getAuthStatusLabel(id: string): string {
    return this.authStatusOptions.find(o => o.value === id)?.label || id;
  }

  getDecisionStatusLabel(id: string): string {
    return this.decisionStatusOptions.find(o => o.value === id)?.label || id;
  }

  /** Resolve match field IDs to comma-separated labels (for template binding) */
  getMatchFieldLabels(): string {
    return this.duplicateCheckConfig.matchFields
      .map(id => this.getFieldLabel(id))
      .join(', ');
  }

  /** Can the duplicate check rule be added? (needs at least 1 match field) */
  isDupCheckValid(): boolean {
    return this.duplicateCheckConfig.matchFields.length > 0;
  }

  /** Can the block-close rule be added? (needs trigger + blocking statuses) */
  isBlockCloseValid(): boolean {
    return this.blockCloseConfig.triggerStatuses.length > 0
        && this.blockCloseConfig.blockingDecisionStatuses.length > 0;
  }

  /** Add the configured duplicate check rule to the table */
  addDuplicateCheckRule(): void {
    const cfg = this.duplicateCheckConfig;
    const rule: ValidationRule = {
      id: uuidv4(),
      errorMessage: cfg.errorMessage,
      expression: this.duplicateCheckExpression,
      dependsOn: [...cfg.matchFields],
      enabled: true,
      isError: true
    };
    this.dataSource.data = [...this.dataSource.data, rule];
    cfg.expanded = false;
    this.showTabs = false;
  }

  /** Add the configured block-close rule to the table */
  addBlockCloseRule(): void {
    const cfg = this.blockCloseConfig;
    const rule: ValidationRule = {
      id: uuidv4(),
      errorMessage: cfg.errorMessage,
      expression: this.blockCloseExpression,
      dependsOn: ['authStatus', 'decisionDetails'],
      enabled: true,
      isError: true
    };
    this.dataSource.data = [...this.dataSource.data, rule];
    cfg.expanded = false;
    this.showTabs = false;
  }

  /**
   * Evaluates a BLOCK_CLOSE expression against the current auth data.
   * Call this from ValidationExpressionsService.evaluateRule().
   *
   * Usage:
   *   const result = this.evaluateBlockClose(authData, 'BLOCK_CLOSE(2,4|2|true)');
   *   if (!result.valid) showError(result.error);
   */
  evaluateBlockClose(authData: any, expression: string): { valid: boolean; error?: string } {
    // Parse: BLOCK_CLOSE(triggerStatuses|blockingDecisionStatuses|requireDecisionExists)
    const inner = expression.replace('BLOCK_CLOSE(', '').replace(')', '');
    const parts = inner.split('|');

    const triggerStatuses = (parts[0] || '2,4').split(',').map(s => s.trim());
    const blockingStatuses = (parts[1] || '2').split(',').map(s => s.trim());
    const requireExists = (parts[2] || 'true').trim() === 'true';

    const currentStatus = String(authData?.authStatus ?? '');

    // Only enforce when auth status is one of the trigger statuses
    if (!triggerStatuses.includes(currentStatus)) {
      return { valid: true };
    }

    const decisions: any[] = authData?.decisionDetails || [];

    // Must have at least one decision?
    if (requireExists && decisions.length === 0) {
      return {
        valid: false,
        error: 'Cannot close authorization — no decisions have been recorded. At least one decision must be finalized before closing.'
      };
    }

    // Check for any decisions in a blocking status (or null = not yet decided)
    const inProgress = decisions.filter(d => {
      const status = d?.data?.decisionStatus;
      return status == null || blockingStatuses.includes(String(status));
    });

    if (inProgress.length > 0) {
      return {
        valid: false,
        error: `Cannot close authorization — ${inProgress.length} decision(s) still in progress (Pended or not yet decided). All decisions must be finalized before closing.`
      };
    }

    return { valid: true };
  }

  /**
   * Parses a DUPLICATE_CHECK expression into structured params for the backend API call.
   * The actual API call should be made by ValidationExpressionsService.
   *
   * Usage:
   *   const params = this.parseDuplicateCheck(authData, 'DUPLICATE_CHECK(treatmentType,...|3,6|0)');
   *   // Then call: cfgService.checkDuplicate(params)
   */
  parseDuplicateCheck(authData: any, expression: string): any {
    const inner = expression.replace('DUPLICATE_CHECK(', '').replace(')', '');
    const parts = inner.split('|');

    const matchFieldIds = (parts[0] || '').split(',').map(s => s.trim());
    const excludeStatuses = (parts[1] || '3,6').split(',').map(s => s.trim());
    const dateOverlapDays = parseInt(parts[2] || '0', 10) || 0;

    // Build match criteria from current auth data
    const matchFields: Record<string, any> = {};
    for (const fieldId of matchFieldIds) {
      const value = authData?.[fieldId];
      if (value !== undefined && value !== null) {
        // For object fields (like procedure code), extract the code
        matchFields[fieldId] = typeof value === 'object' ? (value.code || value.id || value) : value;
      }
    }

    return {
      matchFields,
      excludeStatuses,
      dateOverlapDays
    };
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

  /** Add Rule is only available when user has selected a validation or entered a name */
  get canAddRule(): boolean {
    return !!this.selectedValidationId || !!(this.validationName && this.validationName.trim());
  }

  onFocus() { this.isFocused = true; }
  onBlur() { this.isFocused = false; }
}
