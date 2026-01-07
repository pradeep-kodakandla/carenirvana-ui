// src/app/rulesengine/decisiontable/decisiontablebuilder.component.ts

import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormArray, FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { DataType, DecisionTableDefinition, DtParameter, HitPolicy } from 'src/app/admin/rulesengine/models/decisiontable.model';
import { DecisionTableService } from 'src/app/admin/rulesengine/data/decisiontable.service';

type ParamFG = FormGroup<{
  id: FormControl<string>;
  kind: FormControl<'input' | 'output'>;
  key: FormControl<string>;
  label: FormControl<string>;
  dataType: FormControl<DataType>;
  inputType: FormControl<'text' | 'number' | 'date' | 'datetime' | 'select' | 'toggle'>;
  operatorsCsv: FormControl<string>;
  optionsCsv: FormControl<string>;
  isEnabled: FormControl<boolean>;
}>;

@Component({
  selector: 'appdecisiontablebuilder',
  templateUrl: './decisiontablebuilder.component.html',
  styleUrls: ['./decisiontablebuilder.component.css'],
})
export class DecisionTableBuilderComponent {
  readonly hitPolicies: HitPolicy[] = ['FIRST', 'PRIORITY', 'COLLECT', 'ALL'];
  readonly dataTypes: DataType[] = ['string', 'number', 'boolean', 'date', 'datetime', 'enum'];
  readonly inputTypes: DtParameter['inputType'][] = ['text', 'number', 'date', 'datetime', 'select', 'toggle'];

  selectedTableId: string | null = null;
  tables: DecisionTableDefinition[] = [];
  statusText = '';

  form = this.fb.group({
    id: this.fb.control<string>(''),
    name: this.fb.control<string>('Decision Table Template', { validators: [Validators.required] }),
    description: this.fb.control<string>(''),
    hitPolicy: this.fb.control<HitPolicy>('FIRST'),
    version: this.fb.control<number>(1),
    status: this.fb.control<'DRAFT' | 'PUBLISHED' | 'ARCHIVED'>('DRAFT'),
    updatedOn: this.fb.control<string>(new Date().toISOString()),
    inputs: this.fb.array<ParamFG>([]),
    outputs: this.fb.array<ParamFG>([]),
  });

  get inputsFA(): FormArray<ParamFG> {
    return this.form.get('inputs') as FormArray<ParamFG>;
  }
  get outputsFA(): FormArray<ParamFG> {
    return this.form.get('outputs') as FormArray<ParamFG>;
  }


  constructor(private fb: FormBuilder, private svc: DecisionTableService) {
    this.refreshTables();
    const first = this.tables[0];
    if (first) this.loadTable(first.id);
    else this.createNewTable();
  }

  // ---------- JSON preview ----------
  get jsonPreview(): string {
    const table = this.buildTableFromForm();
    return JSON.stringify(table, null, 2);
  }

  copyJson(): void {
    const text = this.jsonPreview;
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
      this.statusText = 'JSON copied.';
      return;
    }
    // fallback
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    this.statusText = 'JSON copied.';
  }

  downloadJson(): void {
    const blob = new Blob([this.jsonPreview], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const name = (this.form.controls.name.value || 'decisiontable').replace(/\s+/g, '');
    a.href = url;
    a.download = `${name}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ---------- Tables ----------
  refreshTables(): void {
    this.tables = this.svc.listTables().slice().sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
  }

  createNewTable(): void {
    const id = this.svc.newId('dt');
    const table: DecisionTableDefinition = {
      id,
      name: 'New Decision Table Template',
      description: '',
      hitPolicy: 'FIRST',
      version: 1,
      status: 'DRAFT',
      updatedOn: new Date().toISOString(),
      inputs: [],
      outputs: [],
      rows: [], // template builder stores no rows
    };
    this.svc.upsertTable(table);
    this.refreshTables();
    this.loadTable(id);
    this.statusText = 'Created new template.';
  }

  loadTable(id: string): void {
    const table = this.svc.getTable(id);
    if (!table) return;

    this.selectedTableId = id;

    this.resetParamArrays();

    this.form.patchValue({
      id: table.id,
      name: table.name,
      description: table.description ?? '',
      hitPolicy: table.hitPolicy,
      version: table.version ?? 1,
      status: table.status ?? 'DRAFT',
      updatedOn: table.updatedOn ?? new Date().toISOString(),
    });

    for (const p of table.inputs ?? []) this.inputsFA.push(this.buildParamFG(p));
    for (const p of table.outputs ?? []) this.outputsFA.push(this.buildParamFG(p));

    this.statusText = 'Loaded.';
  }

  saveTable(): void {
    const table = this.buildTableFromForm();
    this.svc.upsertTable(table);
    this.refreshTables();
    this.statusText = 'Saved.';
  }

  deleteCurrent(): void {
    const id = this.form.controls.id.value;
    if (!id) return;

    this.svc.deleteTable(id);
    this.refreshTables();

    const next = this.tables[0];
    if (next) this.loadTable(next.id);
    else this.createNewTable();

    this.statusText = 'Deleted.';
  }

  // ---------- Parameters ----------
  addInput(): void {
    const p: DtParameter = {
      id: this.svc.newId('in'),
      kind: 'input',
      key: `Input${this.inputsFA.length + 1}`,
      label: `Input ${this.inputsFA.length + 1}`,
      dataType: 'string',
      inputType: 'text',
      operators: ['=', '!=', 'contains', 'in', 'isEmpty', 'isNotEmpty'],
      isEnabled: true,
    };
    this.inputsFA.push(this.buildParamFG(p));
  }

  addOutput(): void {
    const p: DtParameter = {
      id: this.svc.newId('out'),
      kind: 'output',
      key: `Output${this.outputsFA.length + 1}`,
      label: `Output ${this.outputsFA.length + 1}`,
      dataType: 'string',
      inputType: 'text',
      isEnabled: true,
    };
    this.outputsFA.push(this.buildParamFG(p));
  }

  removeInput(index: number): void {
    this.inputsFA.removeAt(index);
  }

  removeOutput(index: number): void {
    this.outputsFA.removeAt(index);
  }

  onParamTypeChanged(pfg: ParamFG): void {
    const dt = pfg.controls.dataType.value;
    const it = pfg.controls.inputType.value;

    if (dt === 'enum' || it === 'select') {
      if (!pfg.controls.optionsCsv.value) pfg.controls.optionsCsv.setValue('Option1,Option2');
    } else {
      pfg.controls.optionsCsv.setValue('');
    }

    if (pfg.controls.kind.value === 'input') {
      if (!pfg.controls.operatorsCsv.value) {
        pfg.controls.operatorsCsv.setValue(this.defaultOperatorsFor(dt).join(','));
      }
    } else {
      // outputs do not use operators
      pfg.controls.operatorsCsv.setValue('');
    }
  }

  isEnumOrSelect(pfg: ParamFG): boolean {
    return pfg.controls.dataType.value === 'enum' || pfg.controls.inputType.value === 'select';
  }

  operatorsForInput(pfg: ParamFG): string[] {
    const list = this.csvToList(pfg.controls.operatorsCsv.value);
    return list.length ? list : this.defaultOperatorsFor(pfg.controls.dataType.value);
  }

  // ---------- Build helpers ----------
  private buildTableFromForm(): DecisionTableDefinition {
    const raw = this.form.getRawValue();

    const inputs = raw.inputs.map(p => this.paramFromFG(p));
    const outputs = raw.outputs.map(p => this.paramFromFG(p));

    // No rows in template builder
    return {
      id: raw.id!,
      name: raw.name!,
      description: raw.description ?? '',
      hitPolicy: raw.hitPolicy!,
      version: raw.version ?? 1,
      status: raw.status ?? 'DRAFT',
      updatedOn: new Date().toISOString(),
      inputs,
      outputs,
      rows: [],
    };
  }

  private buildParamFG(p: DtParameter): ParamFG {
    return this.fb.group({
      id: this.fb.control<string>(p.id, { nonNullable: true }),
      kind: this.fb.control<'input' | 'output'>(p.kind, { nonNullable: true }),
      key: this.fb.control<string>(p.key ?? '', { nonNullable: true, validators: [Validators.required] }),
      label: this.fb.control<string>(p.label ?? '', { nonNullable: true, validators: [Validators.required] }),
      dataType: this.fb.control<DataType>(p.dataType ?? 'string', { nonNullable: true }),
      inputType: this.fb.control<DtParameter['inputType']>(p.inputType ?? 'text', { nonNullable: true }),
      operatorsCsv: this.fb.control<string>((p.operators ?? []).join(','), { nonNullable: true }),
      optionsCsv: this.fb.control<string>((p.options ?? []).map(o => o.label).join(','), { nonNullable: true }),
      isEnabled: this.fb.control<boolean>(p.isEnabled ?? true, { nonNullable: true }),
    });
  }

  private paramFromFG(p: any): DtParameter {
    const kind = p.kind as 'input' | 'output';
    const dataType = p.dataType as DataType;
    const inputType = p.inputType as DtParameter['inputType'];

    return {
      id: p.id,
      kind,
      key: (p.key ?? '').trim(),
      label: (p.label ?? '').trim(),
      dataType,
      inputType,
      operators: kind === 'input' ? this.csvToList(p.operatorsCsv) : undefined,
      options: (dataType === 'enum' || inputType === 'select') ? this.csvToOptions(p.optionsCsv) : undefined,
      isEnabled: !!p.isEnabled,
    };
  }

  // ---------- Utils ----------
  private defaultOperatorsFor(dt: DataType): string[] {
    switch (dt) {
      case 'number': return ['=', '!=', '>', '>=', '<', '<=', 'between', 'isEmpty', 'isNotEmpty'];
      case 'boolean': return ['=', '!=', 'isEmpty', 'isNotEmpty'];
      case 'date':
      case 'datetime': return ['=', '!=', '>', '>=', '<', '<=', 'between', 'isEmpty', 'isNotEmpty'];
      case 'enum': return ['=', '!=', 'in', 'isEmpty', 'isNotEmpty'];
      default: return ['=', '!=', 'contains', 'startsWith', 'endsWith', 'in', 'isEmpty', 'isNotEmpty'];
    }
  }

  private csvToList(csv: string): string[] {
    return (csv ?? '').split(',').map(x => x.trim()).filter(Boolean);
  }

  private csvToOptions(csv: string): Array<{ label: string; value: any }> {
    const items = this.csvToList(csv ?? '');
    return items.map(x => ({ label: x, value: x }));
  }

  trackByIndex(i: number): number { return i; }
  trackByParam(index: number, fg: ParamFG): string {
    return fg.controls.id.value;
  }
  trackByTable(index: number, t: DecisionTableDefinition): string {
    return t.id;
  }

  private resetParamArrays(): void {
    this.form.setControl('inputs', this.fb.array<ParamFG>([]) as any);
    this.form.setControl('outputs', this.fb.array<ParamFG>([]) as any);
  }


  // view toggle
  viewMode: 'table' | 'json' = 'table';

  setView(mode: 'table' | 'json'): void {
    this.viewMode = mode;
  }

  // Used by template table at bottom
  get inputParams(): DtParameter[] {
    return this.form.getRawValue().inputs.map(p => this.paramFromFG(p));
  }
  get outputParams(): DtParameter[] {
    return this.form.getRawValue().outputs.map(p => this.paramFromFG(p));
  }

  // Template-safe formatting helpers (Angular templates cannot use arrow functions like x => x.label)
  operatorsText(ops: string[] | null | undefined): string {
    return (ops ?? []).filter(Boolean).join(', ');
  }

  optionsText(options: any[] | null | undefined): string {
    // supports DtOption[] {label,value}, string[], or mixed
    return (options ?? [])
      .map(o => (o?.label ?? o?.value ?? o ?? '').toString().trim())
      .filter(Boolean)
      .join(', ');
  }


}
