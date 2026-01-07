// src/app/rulesengine/decisiontable/decisiontablebinding.component.ts

import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges } from '@angular/core';
import { FormArray, FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { DecisionTableBinding, DecisionTableDefinition, FieldDictionaryItem } from 'src/app/admin/rulesengine/models/decisiontable.model';
import { DecisionTableService } from 'src/app/admin/rulesengine/data/decisiontable.service';

type BindRowFG = FormGroup<{
  parameterId: FormControl<string>;
  path: FormControl<string>;
}>;

@Component({
  selector: 'appdecisiontablebinding',
  templateUrl: './decisiontablebinding.component.html',
  styleUrls: ['./decisiontablebinding.component.css'],
})
export class DecisionTableBindingComponent implements OnChanges {
  /**
   * In your real Rule Designer:
   * - pass decisionTableId based on user selection.
   * - pass dictionary from your real data dictionary service.
   */
  @Input() decisionTableId: string = '';
  @Input() dictionary: FieldDictionaryItem[] = [];

  table: DecisionTableDefinition | null = null;

  form = this.fb.group({
    id: this.fb.control<string>(''),
    decisionTableId: this.fb.control<string>('', { validators: [Validators.required] }),
    name: this.fb.control<string>(''),
    inputBindings: this.fb.array<BindRowFG>([]),
    outputBindings: this.fb.array<BindRowFG>([]),
  });

  get inputBindingsFA(): FormArray<BindRowFG> { return this.form.controls.inputBindings; }
  get outputBindingsFA(): FormArray<BindRowFG> { return this.form.controls.outputBindings; }

  status = '';

  constructor(private fb: FormBuilder, private svc: DecisionTableService) { }

  ngOnChanges(): void {
    if (!this.decisionTableId) return;
    this.loadForTable(this.decisionTableId);
  }

  loadForTable(tableId: string): void {
    this.table = this.svc.getTable(tableId);
    if (!this.table) {
      this.status = 'Decision table not found.';
      return;
    }

    // Try to load an existing binding (latest) or create a new one
    const existing = this.svc.listBindingsForTable(tableId).slice().sort((a, b) =>
      (b.updatedOn ?? '').localeCompare(a.updatedOn ?? '')
    )[0];

    const binding: DecisionTableBinding = existing ?? {
      id: this.svc.newId('bind'),
      decisionTableId: tableId,
      name: `${this.table.name} binding`,
      inputBindings: [],
      outputBindings: [],
      updatedOn: new Date().toISOString(),
    };

    this.form.controls.id.setValue(binding.id);
    this.form.controls.decisionTableId.setValue(binding.decisionTableId);
    this.form.controls.name.setValue(binding.name ?? '');

    this.inputBindingsFA.clear();
    this.outputBindingsFA.clear();

    for (const p of this.table.inputs) {
      const found = binding.inputBindings.find(x => x.parameterId === p.id);
      this.inputBindingsFA.push(this.fb.group({
        parameterId: this.fb.control<string>(p.id, { nonNullable: true }),
        path: this.fb.control<string>(found?.sourcePath ?? '', { nonNullable: true }),
      }));
    }

    for (const p of this.table.outputs) {
      const found = binding.outputBindings.find(x => x.parameterId === p.id);
      this.outputBindingsFA.push(this.fb.group({
        parameterId: this.fb.control<string>(p.id, { nonNullable: true }),
        path: this.fb.control<string>(found?.targetPath ?? '', { nonNullable: true }),
      }));
    }

    this.status = 'Loaded binding.';
  }

  saveBinding(): void {
    if (!this.table) return;

    const raw = this.form.getRawValue();
    const binding: DecisionTableBinding = {
      id: raw.id!,
      decisionTableId: raw.decisionTableId!,
      name: raw.name ?? '',
      inputBindings: raw.inputBindings.map(r => ({
        parameterId: r.parameterId,
        sourcePath: r.path,
      })),
      outputBindings: raw.outputBindings.map(r => ({
        parameterId: r.parameterId,
        targetPath: r.path,
      })),
      updatedOn: new Date().toISOString(),
    };

    this.svc.upsertBinding(binding);
    this.status = 'Saved binding.';
  }

  // Helpers for UI
  labelForParameter(parameterId: string, kind: 'input' | 'output'): string {
    if (!this.table) return parameterId;
    const list = kind === 'input' ? this.table.inputs : this.table.outputs;
    const p = list.find(x => x.id === parameterId);
    return p ? `${p.label} (${p.key})` : parameterId;
  }

  filteredDictionary(dataType: string): FieldDictionaryItem[] {
    // Keep it simple: match type if possible, otherwise show all
    const match = this.dictionary.filter(d => d.dataType === dataType);
    return match.length ? match : this.dictionary;
  }
}
