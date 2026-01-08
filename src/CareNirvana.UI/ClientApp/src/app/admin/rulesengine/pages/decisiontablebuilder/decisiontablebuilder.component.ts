import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { map } from 'rxjs/operators';

import { RulesengineService, DecisionTableListItem } from 'src/app/service/rulesengine.service';

type DtColumnKind = 'condition' | 'calculation' | 'result';
type DataType = 'string' | 'number' | 'boolean' | 'date' | 'datetime' | 'enum';
type InputType = 'text' | 'number' | 'date' | 'datetime' | 'select' | 'toggle';
type HitPolicy = 'FIRST' | 'PRIORITY' | 'COLLECT' | 'ALL';

interface DtColumn {
  id: string;
  kind: DtColumnKind;
  key: string;
  label: string;
  dataType: DataType;
  inputType: InputType;
  isEnabled: boolean;
}

interface DtRow {
  id: string;
  enabled: boolean;
  cells: Record<string, string>;
}

interface DecisionTableDefinition {
  id: string;
  name: string;
  description: string;
  hitPolicy: HitPolicy;
  version: number;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  updatedOn: string;
  columns: DtColumn[];
  rows: DtRow[];
}

@Component({
  selector: 'app-decisiontablebuilder',
  templateUrl: './decisiontablebuilder.component.html',
  styleUrls: ['./decisiontablebuilder.component.css']
})
export class DecisionTableBuilderComponent implements OnInit {
  readonly hitPolicies: HitPolicy[] = ['FIRST', 'PRIORITY', 'COLLECT', 'ALL'];

  viewMode: 'table' | 'json' = 'table';
  selectedTableId: string | null = null;
  tables: DecisionTableListItem[] = [];
  statusText = '';

  // table state
  columns: DtColumn[] = [];
  rows: DtRow[] = [];

  // menus
  showAddMenu = false;
  showRowMenu = false;
  showColMenu = false;
  private rowMenuIndex: number | null = null;
  private colMenuKind: DtColumnKind | null = null;
  private colMenuIndex: number | null = null;

  form = this.fb.group({
    id: this.fb.control<string>(''),
    name: this.fb.control<string>('Decision Table Template', { validators: [Validators.required] }),
    description: this.fb.control<string>(''),
    hitPolicy: this.fb.control<HitPolicy>('FIRST'),
    version: this.fb.control<number>(1),
    status: this.fb.control<'DRAFT' | 'PUBLISHED' | 'ARCHIVED'>('DRAFT'),
    updatedOn: this.fb.control<string>(new Date().toISOString())
  });

  constructor(private fb: FormBuilder, private svc: RulesengineService) { }

  ngOnInit(): void {
    this.refreshTables(true);
  }

  // ------------ derived columns ------------
  get conditionCols(): DtColumn[] { return this.columns.filter(c => c.kind === 'condition'); }
  get calculationCols(): DtColumn[] { return this.columns.filter(c => c.kind === 'calculation'); }
  get resultCols(): DtColumn[] { return this.columns.filter(c => c.kind === 'result'); }

  // grid template: rowhead + condition cols + (+ spacer) + calc cols + result cols
  get gridTemplateColumns(): string {
    const c = this.conditionCols.length;
    const k = this.calculationCols.length;
    const r = this.resultCols.length;

    // 84px rowhead, each column 260px, plus one 52px spacer column after conditions (for +)
    const cols: string[] = ['120px'];
    for (let i = 0; i < c; i++) cols.push('260px');
    cols.push('52px');
    for (let i = 0; i < k; i++) cols.push('260px');
    for (let i = 0; i < r; i++) cols.push('260px');
    return cols.join(' ');
  }

  // spans for group header row
  get condGroupSpan(): string {
    const start = 2;
    const end = 2 + this.conditionCols.length;
    return `${start} / ${Math.max(end, start + 1)}`;
  }
  get calcGroupSpan(): string {
    const start = 3 + this.conditionCols.length; // + spacer col
    const end = start + this.calculationCols.length;
    return `${start} / ${Math.max(end, start + 1)}`;
  }
  get resGroupSpan(): string {
    const start = 3 + this.conditionCols.length + this.calculationCols.length; // + spacer col
    const end = start + this.resultCols.length;
    return `${start} / ${Math.max(end, start + 1)}`;
  }

  // ------------ JSON preview ------------
  get jsonPreview(): string {
    return JSON.stringify(this.buildPayload(), null, 2);
  }

  toggleJson(): void {
    this.viewMode = this.viewMode === 'table' ? 'json' : 'table';
  }

  // ------------ API load/save ------------
  refreshTables(loadFirst: boolean): void {
    this.svc.listTables().subscribe({
      next: (rows) => {
        this.tables = rows ?? [];
        if (loadFirst) {
          const first = this.tables[0];
          if (first) this.loadTable(first.id);
          else this.createNewTable();
        }
      },
      error: (err: any) => {
        console.error(err);
        if (loadFirst) this.createNewTable();
      }
    });
  }

  createNewTable(): void {
    const id = this.svc.newId('dt');

    const payload: DecisionTableDefinition = {
      id,
      name: 'New Decision Table',
      description: '',
      hitPolicy: 'FIRST',
      version: 1,
      status: 'DRAFT',
      updatedOn: new Date().toISOString(),
      columns: [
        { id: this.svc.newId('c'), kind: 'condition', key: 'condition1', label: 'Condition', dataType: 'string', inputType: 'text', isEnabled: true },
        { id: this.svc.newId('r'), kind: 'result', key: 'result1', label: 'Result', dataType: 'string', inputType: 'text', isEnabled: true },
      ],
      rows: [
        { id: this.svc.newId('row'), enabled: true, cells: {} }
      ]
    };

    this.svc.createTable(payload).subscribe({
      next: (newId) => {
        this.statusText = 'Created.';
        this.refreshTables(false);
        this.loadTable(newId || id);
      },
      error: (err: any) => {
        console.error(err);
        this.statusText = 'Create failed.';
      }
    });
  }

  loadTable(id: string): void {
    if (!id) return;

    this.svc.getTableJson(id).subscribe({
      next: (payload: any) => {
        this.selectedTableId = id;

        const p = payload as DecisionTableDefinition;

        this.form.patchValue({
          id: p.id ?? id,
          name: p.name ?? '',
          description: p.description ?? '',
          hitPolicy: p.hitPolicy ?? 'FIRST',
          version: p.version ?? 1,
          status: (p.status ?? 'DRAFT'),
          updatedOn: p.updatedOn ?? new Date().toISOString()
        });

        this.columns = Array.isArray(p.columns) ? p.columns : [];
        this.rows = Array.isArray(p.rows) ? p.rows : [];

        if (this.rows.length === 0) this.rows = [{ id: this.svc.newId('row'), enabled: true, cells: {} }];

        this.statusText = 'Loaded.';
      },
      error: (err: any) => {
        console.error(err);
        this.statusText = 'Load failed.';
      }
    });
  }

  saveTable(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const payload = this.buildPayload();
    const id = payload.id;

    const exists = this.tables.some(t => t.id === id);

    const call$ = exists
      ? this.svc.updateTable(id, payload)
      : this.svc.createTable(payload).pipe(map(() => void 0));

    call$.subscribe({
      next: () => {
        this.statusText = 'Saved.';
        this.refreshTables(false);
      },
      error: (err: any) => {
        console.error(err);
        this.statusText = 'Save failed.';
      }
    });
  }

  deleteCurrent(): void {
    const id = this.form.controls.id.value;
    if (!id) return;

    this.svc.deleteTable(id).subscribe({
      next: () => {
        this.statusText = 'Deleted.';
        this.refreshTables(false);

        const next = this.tables.filter(t => t.id !== id)[0];
        if (next) this.loadTable(next.id);
        else this.createNewTable();
      },
      error: (err: any) => {
        console.error(err);
        this.statusText = 'Delete failed.';
      }
    });
  }

  private buildPayload(): DecisionTableDefinition {
    const v = this.form.getRawValue();
    return {
      id: v.id || (this.selectedTableId ?? this.svc.newId('dt')),
      name: (v.name ?? '').trim(),
      description: (v.description ?? '').trim(),
      hitPolicy: v.hitPolicy ?? 'FIRST',
      version: v.version ?? 1,
      status: v.status ?? 'DRAFT',
      updatedOn: new Date().toISOString(),
      columns: this.columns,
      rows: this.rows
    };
  }

  // ------------ Column actions (menu like screenshot) ------------
  openAddMenu(ev: MouseEvent): void {
    ev.stopPropagation();
    this.addMenuStyle = this.calcMenuPosFromEvent(ev);
    this.showAddMenu = true;
    this.showRowMenu = false;
    this.showColMenu = false;
  }

  addColumn(kind: DtColumnKind): void {
    const base = kind === 'condition' ? 'condition' : kind === 'calculation' ? 'calc' : 'result';
    const id = this.svc.newId(kind === 'result' ? 'r' : kind === 'calculation' ? 'k' : 'c');

    const col: DtColumn = {
      id,
      kind,
      key: `${base}${this.columns.filter(x => x.kind === kind).length + 1}`,
      label: kind === 'condition' ? 'Condition' : kind === 'calculation' ? 'Calculation' : 'Result',
      dataType: 'string',
      inputType: 'text',
      isEnabled: true
    };

    this.columns = [...this.columns, col];
    // ensure every row has key
    for (const r of this.rows) {
      if (!r.cells) r.cells = {};
      if (r.cells[col.id] == null) r.cells[col.id] = '';
    }

    this.closeMenus();
  }

  openColMenu(kind: DtColumnKind, index: number, ev: MouseEvent): void {
    ev.stopPropagation();
    this.colMenuKind = kind;
    this.colMenuIndex = index;
    this.colMenuStyle = this.calcMenuPosFromEvent(ev);
    this.showColMenu = true;
    this.showAddMenu = false;
    this.showRowMenu = false;
  }

  openRowMenu(ri: number, ev: MouseEvent): void {
    ev.stopPropagation();
    this.rowMenuIndex = ri;
    this.rowMenuStyle = this.calcMenuPosFromEvent(ev);
    this.showRowMenu = true;
    this.showAddMenu = false;
    this.showColMenu = false;
  }

  closeMenus(): void {
    this.showAddMenu = false;
    this.showRowMenu = false;
    this.showColMenu = false;
    this.rowMenuIndex = null;
    this.colMenuIndex = null;
    this.colMenuKind = null;
  }

  removeColumn(): void {
    if (this.colMenuKind == null || this.colMenuIndex == null) return;

    const list = this.columns.filter(c => c.kind === this.colMenuKind);
    const target = list[this.colMenuIndex];
    if (!target) return;

    this.columns = this.columns.filter(c => c.id !== target.id);
    for (const r of this.rows) {
      if (r.cells && target.id in r.cells) delete r.cells[target.id];
    }

    this.closeMenus();
  }

  setColLabel(col: DtColumn, label: string): void {
    col.label = label;
  }

  // ------------ Row actions / context menu ------------
  addRow(): void {
    const r: DtRow = { id: this.svc.newId('row'), enabled: true, cells: {} };
    for (const c of this.columns) r.cells[c.id] = '';
    this.rows = [...this.rows, r];
  }


  moveRow(dir: -1 | 1): void {
    const i = this.rowMenuIndex;
    if (i == null) return;
    const j = i + dir;
    if (j < 0 || j >= this.rows.length) return;

    const copy = this.rows.slice();
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
    this.rows = copy;
    this.rowMenuIndex = j;
  }

  insertRow(above: boolean): void {
    const i = this.rowMenuIndex;
    if (i == null) return;

    const r: DtRow = { id: this.svc.newId('row'), enabled: true, cells: {} };
    for (const c of this.columns) r.cells[c.id] = '';

    const copy = this.rows.slice();
    copy.splice(above ? i : i + 1, 0, r);
    this.rows = copy;
    this.closeMenus();
  }

  copyRow(): void {
    const i = this.rowMenuIndex;
    if (i == null) return;

    const src = this.rows[i];
    const cloned: DtRow = {
      id: this.svc.newId('row'),
      enabled: src.enabled,
      cells: { ...(src.cells ?? {}) }
    };

    const copy = this.rows.slice();
    copy.splice(i + 1, 0, cloned);
    this.rows = copy;
    this.closeMenus();
  }

  clearRow(): void {
    const i = this.rowMenuIndex;
    if (i == null) return;
    const r = this.rows[i];
    for (const c of this.columns) r.cells[c.id] = '';
    this.closeMenus();
  }

  deleteRow(): void {
    const i = this.rowMenuIndex;
    if (i == null) return;

    const copy = this.rows.slice();
    copy.splice(i, 1);
    this.rows = copy.length ? copy : [{ id: this.svc.newId('row'), enabled: true, cells: {} }];
    this.closeMenus();
  }

  setRowEnabled(index: number, enabled: boolean): void {
    const r = this.rows[index];
    if (r) r.enabled = enabled;
  }

  // ------------ Cells ------------
  getCell(row: DtRow, colId: string): string {
    return (row.cells && row.cells[colId] != null) ? row.cells[colId] : '';
  }

  setCell(row: DtRow, colId: string, value: string): void {
    if (!row.cells) row.cells = {};
    row.cells[colId] = value;
  }


  // ------------ TrackBy ------------
  trackByTable(_: number, t: any): any { return t?.id; }
  trackByRow(_: number, r: DtRow): any { return r.id; }
  trackByCol(_: number, c: DtColumn): any { return c.id; }





  addMenuStyle: any = {};
  rowMenuStyle: any = {};
  colMenuStyle: any = {};

  private menuSize = { w: 260, h: 260 }; // used for viewport clamping

  private calcMenuPosFromEvent(ev: MouseEvent): { left: string; top: string } {
    const el = ev.currentTarget as HTMLElement;
    const r = el.getBoundingClientRect();

    const margin = 8;
    const w = this.menuSize.w;
    const h = this.menuSize.h;

    // preferred position: below-right of clicked element
    let left = r.left;
    let top = r.bottom + margin;

    // clamp within viewport
    if (left + w + margin > window.innerWidth) left = window.innerWidth - w - margin;
    if (top + h + margin > window.innerHeight) top = r.top - h - margin; // flip above
    if (top < margin) top = margin;
    if (left < margin) left = margin;

    return { left: `${Math.round(left)}px`, top: `${Math.round(top)}px` };
  }

}
