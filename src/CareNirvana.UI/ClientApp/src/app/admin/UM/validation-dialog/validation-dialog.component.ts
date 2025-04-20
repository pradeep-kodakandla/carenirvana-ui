import { Component, Inject, OnInit, ViewChild, ElementRef } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { ValidationExpressionsService } from 'src/app/service/validation-expressions.service';
import { FormControl } from '@angular/forms';
import { of, Observable } from 'rxjs';
import { map, startWith, debounceTime } from 'rxjs/operators';
import { v4 as uuidv4 } from 'uuid';
import { MatTableDataSource } from '@angular/material/table';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';

interface ValidationRule {
  id: string;
  errorMessage: string;
  expression: string;
  dependsOn: string[];
  enabled: boolean;
  isError: boolean;
}

@Component({
  selector: 'app-validation-dialog',
  templateUrl: './validation-dialog.component.html',
  styleUrls: ['./validation-dialog.component.css']
})
export class ValidationDialogComponent implements OnInit {
  autoCompleteControl = new FormControl('');
  allAliases: string[] = [];
  filteredOptions$: Observable<string[]> = of([]);
  showAutocomplete = true;

  newRuleText: string = '';
  generateError: boolean = false;

  displayedColumns: string[] = ['enabled', 'isError', 'errorMessage', 'expression', 'actions'];
  dataSource!: MatTableDataSource<ValidationRule>;
  showTabs = false;
  isFocused = false;

  presets = [
    {
      label: 'Date is After Another Date',
      value: '{A} > {B}',
      dependsOn: ['{A}', '{B}'],
      message: '{A} must be after {B}.',
      tempConstant: ''
    },
    {
      label: 'Date Within Range',
      value: '{A} >= {B} && {A} <= {C}',
      dependsOn: ['{A}', '{B}', '{C}'],
      message: '{A} must be between {B} and {C}.',
      tempConstant: ''
    },
    {
      label: 'Field Required if Another is Set',
      value: '{B} ? !!{A} : true',
      dependsOn: ['{A}', '{B}'],
      message: '{A} is required when {B} is set.',
      tempConstant: ''
    },
    {
      label: 'Number Not Greater Than 1000',
      value: '{A} <= {CONST}',
      dependsOn: ['{A}', '{CONST}'],
      message: '{A} must not be greater than {CONST}.',
      tempConstant: ''
    },
    {
      label: 'Number Not Less Than 0',
      value: '{A} >= {CONST}',
      dependsOn: ['{A}', '{CONST}'],
      message: '{A} must not be less than {CONST}.',
      tempConstant: ''
    },
    {
      label: 'Field A Greater Than Field B',
      value: '{A} > {B}',
      dependsOn: ['{A}', '{B}'],
      message: '{A} must be greater than {B}.',
      tempConstant: ''
    },
    {
      label: 'IF Field A > Field B THEN Set Field C ELSE Set Field C',
      value: '{A} > {B} ? ({C} = {CONST1}) : ({C} = {CONST2})',
      dependsOn: ['{A}', '{B}', '{C}', '{CONST1}', '{CONST2}'],
      message: 'If {A} > {B}, then {C} must be {CONST1}, else {C} must be {CONST2}.',
      tempConstant: '',
      tempConstant2: ''
    }
  ];

  builder = {
    mode: 'simple', // simple or conditional
    leftField: '',
    operator: '',
    rightField: '',
    rightConstant: '',
    logical: '',
    leftField2: '',
    operator2: '',
    rightField2: '',
    rightConstant2: '',
    thenField: '',
    thenValue: '',
    thenConstant: '',
    elseField: '',
    elseValue: '',
    elseConstant: '',
    preset: '',
    presetFieldA: '',
    presetFieldB: '',
    presetFieldC: '',
    presetConstant: '',
    presetConstant2: ''
  };

  testResult: string | null = null;
  allFields: { id: string; label: string }[] = [];

  @ViewChild('inputElement', { static: true }) inputElement!: ElementRef<HTMLInputElement>;
  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: { templateId: number; validations: ValidationRule[]; templateJson: any },
    public dialogRef: MatDialogRef<ValidationDialogComponent>,
    private expressionService: ValidationExpressionsService
  ) { }

  ngOnInit(): void {
    this.loadFieldsAndAliases();
    this.setupAutocomplete();
    this.dataSource = new MatTableDataSource(this.data.validations);
  }

  ngAfterViewInit() {
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;
  }

  applyFilter(event: Event) {
    const filterValue = (event.target as HTMLInputElement).value.trim().toLowerCase();
    this.dataSource.filter = filterValue;
  }

  removeValidation(index: number) {
    this.data.validations.splice(index, 1);
    this.dataSource.data = this.data.validations;
  }

  private loadFieldsAndAliases() {
    const fields = (this.data.templateJson?.sections || []).flatMap((section: any) => section.fields || []);
    this.allFields = fields.map((f: any) => ({
      id: f.id || 'unknown_' + Math.random().toString(36).substr(2, 9),
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
        const word = this.getCurrentFragment(value);
        this.showAutocomplete = word.length > 0;
        return this.allAliases.filter(alias =>
          alias.toLowerCase().includes(word.toLowerCase())
        );
      })
    );
  }

  getCurrentFragment(value: string): string {
    const input = value ?? '';
    const cursorPos = this.inputElement.nativeElement.selectionStart ?? input.length;
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
    const words = before.split(/(\s+)/);
    for (let i = words.length - 1; i >= 0; i--) {
      if (words[i].trim().length > 0) {
        words[i] = selected;
        break;
      }
    }

    const newText = words.join('') + after;
    this.autoCompleteControl.setValue(newText);
    this.newRuleText = newText;

    setTimeout(() => {
      const newCursor = words.join('').length;
      inputEl.setSelectionRange(newCursor, newCursor);
      inputEl.focus();
    });

    this.showAutocomplete = false;
  }

  onInputFocus() {
    if ((this.autoCompleteControl.value ?? '').length > 0) {
      this.showAutocomplete = true;
    }
  }

  onInputBlur() {
    setTimeout(() => this.showAutocomplete = false, 200);
  }

  onRightValueChange(isSecondCondition: boolean = false): void {
    if (isSecondCondition) {
      if (this.builder.rightField2 === 'constant' && !this.builder.operator2) {
        this.builder.operator2 = '<='; // Default to <= for constants
      }
    } else {
      if (this.builder.rightField === 'constant' && !this.builder.operator) {
        this.builder.operator = '<='; // Default to <= for constants
      }
    }
  }

  onPresetFieldAChange(event: Event) {
    const target = event.target as HTMLSelectElement;
    this.builder.presetFieldA = target.value;
  }

  onPresetFieldBChange(event: Event) {
    const target = event.target as HTMLSelectElement;
    this.builder.presetFieldB = target.value;
  }

  onPresetFieldCChange(event: Event) {
    const target = event.target as HTMLSelectElement;
    this.builder.presetFieldC = target.value;
  }

  save() {
    console.log('Saving validations:', this.data.validations);
    this.dialogRef.close(this.data.validations);
  }

  close() {
    this.dialogRef.close();
  }

  addValidation() {
    this.data.validations.push({
      id: uuidv4(),
      errorMessage: '',
      expression: '',
      dependsOn: [],
      enabled: true,
      isError: true
    });
    this.dataSource.data = [...this.data.validations];
  }

  onDependsOnChange(value: string, rule: ValidationRule) {
    rule.dependsOn = value.split(',').map(v => v.trim()).filter(v => v.length > 0);
  }

  addGeneratedValidation(): void {
    if (!this.newRuleText.trim()) {
      this.generateError = true;
      return;
    }
    const rule = this.expressionService.generateExpressionFromText(this.data.templateJson, this.newRuleText);
    if (rule.enabled) {
      rule.id = uuidv4();
      //this.data.validations.push(rule);
      this.data.validations.unshift(rule); // Add to top
      this.dataSource.data = [...this.data.validations]; // Refresh dataSource
      this.newRuleText = '';
      this.generateError = false;
    } else {
      this.generateError = true;
    }
  }

  applyPreset(presetKey: string, fieldA: string, fieldB: string, fieldC?: string, constant?: string, constant2?: string, preset?: any): void {

    //const preset = this.presets.find(p => p.label === presetKey);
    if (!preset || !fieldA || (preset.dependsOn.includes('{CONST}') && !constant) || (preset.dependsOn.includes('{CONST2}') && !constant2)) return;

    let expr = preset.value.replace('{A}', fieldA);
    let msg = preset.message.replace('{A}', this.getFieldLabel(fieldA));
    let depends: string[] = preset.dependsOn
      .map((dep: string) => {
        if (dep === '{A}') return fieldA;
        if (dep === '{B}' && fieldB) return fieldB;
        if (dep === '{C}' && fieldC) return fieldC;
        if (dep === '{CONST}' || dep === '{CONST2}') return null; // Exclude constants
        return null;
      })
      .filter((dep: string): dep is string => typeof dep === 'string' && dep.length > 0);

    if (fieldB) {
      expr = expr.replace('{B}', fieldB);
      msg = msg.replace('{B}', this.getFieldLabel(fieldB));
    }
    if (fieldC) {
      expr = expr.replace('{C}', fieldC);
      msg = msg.replace('{C}', this.getFieldLabel(fieldC));
    }
    if (constant && preset.dependsOn.includes('{CONST}')) {
      expr = expr.replace('{CONST}', `'${constant}'`);
      msg = msg.replace('{CONST}', constant);
    }
    if (constant2 && preset.dependsOn.includes('{CONST2}')) {
      expr = expr.replace('{CONST2}', `'${constant2}'`);
      msg = msg.replace('{CONST2}', constant2);
    }

    this.data.validations.unshift({
      id: uuidv4(),
      expression: expr,
      dependsOn: [...new Set(depends)],
      errorMessage: msg,
      enabled: true,
      isError: true
    });

    this.dataSource.sort = null;
    this.dataSource.data = [...this.data.validations];
    setTimeout(() => this.dataSource.sort = this.sort);

    // Reset preset fields
    this.builder.presetFieldA = '';
    this.builder.presetFieldB = '';
    this.builder.presetFieldC = '';
    //this.builder.presetConstant = '';
    //this.builder.presetConstant2 = '';
    preset.tempConstant = '';
    preset.tempConstant2 = '';

  }

  getFieldLabel(id: string): string {
    return this.allFields.find(f => f.id === id)?.label || id;
  }

  isValidPreset(preset: any): boolean {
    return (
      !!this.builder.presetFieldA &&
      (!preset.dependsOn.includes('{B}') || !!this.builder.presetFieldB) &&
      (!preset.dependsOn.includes('{C}') || !!this.builder.presetFieldC) &&
      (!preset.dependsOn.includes('{CONST}') || preset.tempConstant?.toString().trim() !== '') &&
      (!preset.dependsOn.includes('{CONST2}') || preset.tempConstant2?.toString().trim() !== '')
    );
  }

  isValidStructuredRule(): boolean {
    const { mode, leftField, operator, rightField, rightConstant, logical, leftField2, operator2, rightField2, rightConstant2, thenField, thenValue, thenConstant, elseField, elseValue, elseConstant } = this.builder;

    // For NULL and NOTNULL, rightField and rightConstant are not required
    if (!leftField || !operator) return false;
    if (operator !== '== null' && operator !== '!= null' && !rightField && !rightConstant) return false;
    if (rightField === 'constant' && rightConstant === '') return false;

    if (mode === 'conditional') {
      if (logical && (!leftField2 || !operator2)) return false;
      if (logical && operator2 !== '== null' && operator2 !== '!= null' && (!rightField2 && !rightConstant2)) return false;
      if (logical && rightField2 === 'constant' && rightConstant2 === '') return false;
      if (thenField && (!thenValue && !thenConstant)) return false;
      if (thenField && thenValue === 'constant' && thenConstant === '') return false;
      if (elseField && (!elseValue && !elseConstant)) return false;
      if (elseField && elseValue === 'constant' && elseConstant === '') return false;
    }
    return true;
  }

  addStructuredValidation(): void {
    const { mode, leftField, operator, rightField, rightConstant, logical, leftField2, operator2, rightField2, rightConstant2, thenField, thenValue, thenConstant, elseField, elseValue, elseConstant } = this.builder;
    if (!this.isValidStructuredRule()) return;

    let condition: string;
    let dependsOn = [leftField];
    let rightValue: string;
    let expression: string;
    let errorMessage: string;

    // Handle NULL and NOTNULL operators
    if (operator === '== null' || operator === '!= null') {
      condition = `${leftField} ${operator}`;
      rightValue = operator === '== null' ? 'null' : 'not null';
    } else {
      rightValue = rightField === 'constant' ? (isNaN(Number(rightConstant)) ? `'${rightConstant}'` : rightConstant) : rightField;
      condition = `${leftField} ${operator} ${rightValue}`;
      if (rightField !== 'constant' && rightField !== 'now') dependsOn.push(rightField);
    }

    if (mode === 'simple') {
      expression = condition;
      errorMessage =
        operator === '== null' ? `${this.getFieldLabel(leftField)} must be null.` :
          operator === '!= null' ? `${this.getFieldLabel(leftField)} must not be null.` :
            operator === '<=' ? `${this.getFieldLabel(leftField)} must not be greater than ${rightValue}.` :
              operator === '>=' ? `${this.getFieldLabel(leftField)} must not be less than ${rightValue}.` :
                `${this.getFieldLabel(leftField)} must be ${operator} ${this.getFieldLabel(rightValue) || rightValue}.`;
    } else {
      if (logical && leftField2 && operator2) {
        let condition2: string;
        if (operator2 === '== null' || operator2 === '!= null') {
          condition2 = `${leftField2} ${operator2}`;
          dependsOn.push(leftField2);
        } else {
          const rightValue2 = rightField2 === 'constant' ? (isNaN(Number(rightConstant2)) ? `'${rightConstant2}'` : rightConstant2) : rightField2;
          condition2 = `${leftField2} ${operator2} ${rightValue2}`;
          dependsOn.push(leftField2);
          if (rightField2 !== 'constant' && rightField2 !== 'now') dependsOn.push(rightField2);
        }
        condition = `(${condition}) ${logical} (${condition2})`;
      }

      if (thenField && (thenValue || thenConstant)) {
        const thenVal = thenValue === 'constant' ? (isNaN(Number(thenConstant)) ? `'${thenConstant}'` : thenConstant) : thenValue;
        if (elseField && (elseValue || elseConstant)) {
          const elseVal = elseValue === 'constant' ? (isNaN(Number(elseConstant)) ? `'${elseConstant}'` : elseConstant) : elseValue;
          expression = `${condition} ? (${thenField} = ${thenVal}) : (${elseField} = ${elseVal})`;
          errorMessage = `If ${condition}, then ${this.getFieldLabel(thenField)} must be ${thenVal === 'now' ? 'current date' : this.getFieldLabel(thenVal) || thenVal}, else ${this.getFieldLabel(elseField)} must be ${elseVal === 'now' ? 'current date' : this.getFieldLabel(elseVal) || elseVal}.`;
          dependsOn.push(thenField, elseField);
          if (thenValue !== 'constant' && thenValue !== 'now') dependsOn.push(thenValue);
          if (elseValue !== 'constant' && elseValue !== 'now') dependsOn.push(elseValue);
        } else {
          expression = `${condition} ? (${thenField} = ${thenVal}) : true`;
          errorMessage = `If ${condition}, then ${this.getFieldLabel(thenField)} must be ${thenVal === 'now' ? 'current date' : this.getFieldLabel(thenVal) || thenVal}.`;
          dependsOn.push(thenField);
          if (thenValue !== 'constant' && thenValue !== 'now') dependsOn.push(thenValue);
        }
      } else {
        expression = condition;
        errorMessage =
          operator === '== null' ? `${this.getFieldLabel(leftField)} must be null.` :
            operator === '!= null' ? `${this.getFieldLabel(leftField)} must not be null.` :
              operator === '<=' ? `${this.getFieldLabel(leftField)} must not be greater than ${rightValue}.` :
                operator === '>=' ? `${this.getFieldLabel(leftField)} must not be less than ${rightValue}.` :
                  `Validation failed: ${condition}`;
      }
    }

    this.data.validations.unshift({
      id: uuidv4(),
      expression,
      errorMessage,
      dependsOn: [...new Set(dependsOn.filter(f => f !== 'now'))],
      enabled: true,
      isError: true
    });

    this.dataSource.sort = null; // Reset sort temporarily
    this.dataSource.data = [...this.data.validations];
    setTimeout(() => this.dataSource.sort = this.sort); // Restore sort

    this.testResult = null;
    this.resetBuilder();
  }

  testStructuredRule(): void {
    const { mode, leftField, operator, rightField, rightConstant, logical, leftField2, operator2, rightField2, rightConstant2, thenField, thenValue, thenConstant, elseField, elseValue, elseConstant } = this.builder;
    if (!this.isValidStructuredRule()) {
      this.testResult = 'Complete all fields to test.';
      return;
    }

    const mock: any = {
      [leftField]: operator === '== null' ? null : operator === '!= null' ? 'someValue' : operator === '>=' ? -1 : operator === '>' ? new Date('2024-01-01') : 1500,
      [rightField]: rightField === 'constant' ? rightConstant : new Date('2024-01-02'),
      [leftField2]: operator2 === '== null' ? null : operator2 === '!= null' ? 'someValue' : new Date('2024-01-03'),
      [rightField2]: rightField2 === 'constant' ? rightConstant2 : new Date('2024-01-04'),
      [thenField]: null,
      [elseField]: null
    };
    if (thenValue && thenValue !== 'now' && thenValue !== 'constant') mock[thenValue] = 'TestValue';
    if (elseValue && elseValue !== 'now' && elseValue !== 'constant') mock[elseValue] = 'TestValue2';

    try {
      let condition: string;
      if (operator === '== null' || operator === '!= null') {
        condition = `mock['${leftField}'] ${operator}`;
      } else {
        condition = rightField === 'constant'
          ? `mock['${leftField}'] ${operator} ${isNaN(Number(rightConstant)) ? `'${rightConstant}'` : rightConstant}`
          : `new Date(mock['${leftField}']) ${operator} new Date(mock['${rightField}'])`;
      }

      if (mode === 'conditional' && logical && leftField2 && operator2) {
        let exp2: string;
        if (operator2 === '== null' || operator2 === '!= null') {
          exp2 = `mock['${leftField2}'] ${operator2}`;
        } else {
          exp2 = rightField2 === 'constant'
            ? `mock['${leftField2}'] ${operator2} ${isNaN(Number(rightConstant2)) ? `'${rightConstant2}'` : rightConstant2}`
            : `new Date(mock['${leftField2}']) ${operator2} new Date(mock['${rightField2}'])`;
        }
        condition = `(${condition}) ${logical} (${exp2})`;
      }

      let result: boolean;
      if (mode === 'simple') {
        result = eval(condition);
      } else if (thenField && (thenValue || thenConstant)) {
        const conditionResult = eval(condition);
        if (conditionResult) {
          const thenVal = thenValue === 'constant' ? (isNaN(Number(thenConstant)) ? `'${thenConstant}'` : thenConstant) : thenValue === 'now' ? new Date() : mock[thenValue];
          mock[thenField] = thenVal;
          result = mock[thenField] !== null;
        } else if (elseField && (elseValue || elseConstant)) {
          const elseVal = elseValue === 'constant' ? (isNaN(Number(elseConstant)) ? `'${elseConstant}'` : elseConstant) : elseValue === 'now' ? new Date() : mock[elseValue];
          mock[elseField] = elseVal;
          result = mock[elseField] !== null;
        } else {
          result = true;
        }
      } else {
        result = eval(condition);
      }

      this.testResult = result ? '✅ Rule Passed' : '❌ Rule Failed';
    } catch {
      this.testResult = '⚠️ Error evaluating expression';
    }
  }

  private resetBuilder() {
    this.builder = {
      mode: 'simple',
      leftField: '',
      operator: '',
      rightField: '',
      rightConstant: '',
      logical: '',
      leftField2: '',
      operator2: '',
      rightField2: '',
      rightConstant2: '',
      thenField: '',
      thenValue: '',
      thenConstant: '',
      elseField: '',
      elseValue: '',
      elseConstant: '',
      preset: '',
      presetFieldA: '',
      presetFieldB: '',
      presetFieldC: '',
      presetConstant: '',
      presetConstant2: ''
    };
  }

  onFocus() {
    this.isFocused = true;
  }

  onBlur() {
    this.isFocused = false;
  }

}
