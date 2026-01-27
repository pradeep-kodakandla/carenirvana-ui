import { Component, OnInit } from '@angular/core';
import { map } from 'rxjs/operators';

import { UiSmartOption } from 'src/app/shared/ui/uismartdropdown/uismartdropdown.component';
import { RulesengineService, DecisionTableListItem } from 'src/app/service/rulesengine.service';

type DtColumnKind = 'condition' | 'calculation' | 'result';
type DataType = 'string' | 'number' | 'boolean' | 'date' | 'datetime' | 'enum';
type InputType = 'text' | 'number' | 'date' | 'datetime' | 'select' | 'toggle';
type HitPolicy = 'FIRST' | 'PRIORITY' | 'COLLECT' | 'ALL';
type DeployStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

interface DtColumn {
  id: string;
  kind: DtColumnKind;
  key: string;
  label: string;
  dataType: DataType;
  inputType: InputType;
  operator?: string;
  isEnabled: boolean;

  mappedFieldKey?: string;     // selected fieldKey
  mappedFieldLabel?: string;   // pretty label shown in UI
  mappedFieldPath?: string;    // json path
  mappedDatasetKey?: string;   // datasetKey
  mappedModule?: string;       // moduleKey/name
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
  status: DeployStatus;
  updatedOn: string;
  activeFlag: boolean;

  columns: DtColumn[];
  rows: DtRow[];
}


type RuleDocKind = 'LADDER' | 'DECISION_TABLE';

interface DecisionTableUiModel {
  schema: 'rulesengine.uidt.v1';
  version: 1;
  decisionTable: {
    id: string;
    name?: string;
    tableVersion?: number;
    hitPolicy?: HitPolicy;
    updatedOn?: string | null;
  };
  outputs?: Array<{ key: string; label?: string; dataType?: string }>;
  postProcessing?: UiRuleJsonV2;
}

interface UiRuleJsonV2 {
  schema: 'rulesengine.uirule.v2';
  version: 2;
  branches: any[];
  assets?: any;
}

interface RuleDocV1 {
  schema: 'rulesengine.ruledoc.v1';
  version: 1;
  kind: RuleDocKind;
  ui: UiRuleJsonV2 | DecisionTableUiModel;
  engine?: any;
  meta?: { source?: string; generatedOn?: string };
}


interface FieldRef {
  fieldKey: string;
  fieldName: string;
  path: string;
  datasetKey: string;
  datasetName: string;
  moduleName: string;
}


@Component({
  selector: 'app-decisiontablebuilder',
  templateUrl: './decisiontablebuilder.component.html',
  styleUrls: ['./decisiontablebuilder.component.css']
})
export class DecisionTableBuilderComponent implements OnInit {
  // UI
  viewMode: 'table' | 'json' = 'table';
  statusText = '';
  statusType: 'info' | 'ok' | 'err' = 'info';
  private statusTimer: any;

  // dropdowns
  tables: DecisionTableListItem[] = [];
  selectedTableId: string | null = null;

  // list view
  pageMode: 'list' | 'builder' = 'list';
  searchText = '';

  tableUiOptions: UiSmartOption<string>[] = [];
  hitPolicyUiOptions: UiSmartOption<HitPolicy>[] = [
    { value: 'FIRST', label: 'FIRST' },
    { value: 'PRIORITY', label: 'PRIORITY' },
    { value: 'COLLECT', label: 'COLLECT' },
    { value: 'ALL', label: 'ALL' }
  ];

  statusUiOptions: UiSmartOption<DeployStatus>[] = [
    { value: 'DRAFT', label: 'DRAFT' },
    { value: 'PUBLISHED', label: 'PUBLISHED' },
    { value: 'ARCHIVED', label: 'ARCHIVED' }
  ];

  readonly operatorDefinitions: Array<{ code: string; name: string; description: string }> = [
    { code: '=', name: 'Equals', description: 'Compares scalar values (strings, numbers, booleans).' },
    { code: 'ANY', name: 'Anything', description: 'Always true; ignores the condition value.' },
    { code: 'IN', name: 'Is in', description: 'True if the left operand is in the right-side set/array.' },
    { code: '!IN', name: 'Not in', description: 'True if the left operand is not in the right-side set/array.' },
    { code: '>=', name: 'Greater or equal', description: 'True if left operand is greater than or equal to right operand.' },
    { code: '>', name: 'Greater than', description: 'True if left operand is greater than right operand.' },
    { code: '<=', name: 'Less or equal', description: 'True if left operand is less than or equal to right operand.' },
    { code: '<', name: 'Less than', description: 'True if left operand is less than right operand.' },
    { code: '!=', name: 'Not equal', description: 'True if scalar operands are not equal.' },
    { code: 'BTW', name: 'Between', description: 'Inclusive range check; right operand must have 2 values.' },
    { code: 'BTW LO', name: 'Between left open', description: 'Excludes lower bound, includes upper bound (2-value range).' },
    { code: 'BTW RO', name: 'Between right open', description: 'Includes lower bound, excludes upper bound (2-value range).' },
    { code: '!BTW', name: 'Not between', description: 'True if value is outside the given 2-value range.' },
    { code: 'NULL', name: 'Is null', description: 'True if the evaluated value is empty.' },
    { code: '!NULL', name: 'Is not null', description: 'True if the evaluated value is not empty.' },
    { code: 'C TXT', name: 'Contains text', description: 'Substring match in a string/array (supports separators: | , ;).' },
    { code: 'C IN', name: 'Contains in', description: 'True if any right-side value appears in the left operand (substring/exact).' },
    { code: '!C IN', name: 'Not contains in', description: 'True if none of the right-side values appear in the left operand.' },
    { code: 'EQ ARR', name: 'Equal array', description: 'True if every right-side value is a substring of at least one left array item.' },
    { code: 'ELSE', name: 'Else', description: 'True only when no preceding row has matched.' }
  ];

  operatorUiOptions: UiSmartOption<string>[] = this.operatorDefinitions.map(o => ({
    value: o.code,
    label: `${o.name} (${o.code})`
  }));

  private readonly operatorCodeIndex = new Map<string, string>();


  private initOperatorCodeIndex(): void {
    // Map both operator codes (e.g. '=', '!=', 'BTW LO') and names (e.g. 'Equals')
    // to the canonical code used in payloads / ruleJson.
    this.operatorCodeIndex.clear();

    for (const op of this.operatorDefinitions) {
      this.operatorCodeIndex.set(this.opKey(op.code), op.code);
      this.operatorCodeIndex.set(this.opKey(op.name), op.code);
    }

    // legacy function-style operators (fallback)
    const legacy: Record<string, string> = {
      eq: '=',
      ne: '!=',
      gt: '>',
      gte: '>=',
      lt: '<',
      lte: '<='
    };

    for (const k of Object.keys(legacy)) {
      this.operatorCodeIndex.set(this.opKey(k), legacy[k]);
    }
  }

  condFieldSearch: Record<string, string> = {}; // per condition column id
  private allFields: FieldRef[] = [];
  allFieldUiOptions: UiSmartOption<string>[] = [];
  private fieldIndex = new Map<string, FieldRef>();

  // options cache: per column id => top 20 options based on search
  private condFieldOptions: Record<string, UiSmartOption<string>[]> = {};
  private defaultTop20: UiSmartOption<string>[] = [];

  isTableSaved = false;

  // meta (floating label inputs)
  meta: {
    id: string;
    name: string;
    description: string;
    hitPolicy: HitPolicy;
    version: number;
    status: DeployStatus;
    activeFlag: boolean;
    updatedOn: string;
  } = {
      id: '',
      name: 'Decision Table Template',
      description: '',
      hitPolicy: 'FIRST',
      version: 1,
      status: 'DRAFT',
      activeFlag: true,
      updatedOn: new Date().toISOString()
    };

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

  addMenuStyle: any = {};
  rowMenuStyle: any = {};
  colMenuStyle: any = {};
  private menuSize = { w: 260, h: 260 };

  constructor(private svc: RulesengineService) { }

  ngOnInit(): void {
    this.initOperatorCodeIndex();
    this.refreshTables(false);
    this.loadAllRuleDataFieldsForMapping();
    this.ruleTypeUiOptions = this.svc.getRuleTypeOptions().map(x => ({ value: x.value, label: x.label }));
    this.loadRuleGroups();
  }

  private refreshSavedFlag(): void {
    const id = this.meta?.id || this.selectedTableId || '';
    this.isTableSaved = !!id && this.tables?.some(t => t.id === id);
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
    const start = 3 + this.conditionCols.length;
    const end = start + this.calculationCols.length;
    return `${start} / ${Math.max(end, start + 1)}`;
  }
  get resGroupSpan(): string {
    const start = 3 + this.conditionCols.length + this.calculationCols.length;
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

  // ------------ templates dropdown ------------
  onTemplateChange(id: string): void {
    if (!id) return;
    this.loadTable(id);
  }

  refreshTables(loadFirst: boolean): void {
    this.svc.listTables().subscribe({
      next: (rows) => {
        this.tables = rows ?? [];
        console.log('Loaded decision tables:', this.tables);
        this.tableUiOptions = this.tables.map(t => ({ value: t.id, label: t.name }));
        this.refreshSavedFlag();
        this.checkLinkedRuleForCurrentTable();
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


  // ---------------------------
  // List view helpers
  // ---------------------------
  get filteredTables(): DecisionTableListItem[] {
    const q = (this.searchText || '').trim().toLowerCase();
    if (!q) return this.tables || [];
    return (this.tables || []).filter(t =>
      (t.name || '').toLowerCase().includes(q) ||
      (t.id || '').toLowerCase().includes(q)
    );
  }

  trackByTable = (_: number, t: DecisionTableListItem) => t.id;

  addNewFromList(): void {
    this.pageMode = 'builder';
    this.createNewTable();
  }

  editTable(id: string): void {
    if (!id) return;
    this.pageMode = 'builder';
    this.loadTable(id);
  }

  goToList(): void {
    this.pageMode = 'list';
    this.closeMenus();
    this.closeRuleFlyout();
  }

  deleteTableFromList(t: DecisionTableListItem): void {
    const id = t?.id;
    if (!id) return;

    const name = (t as any)?.name || id;
    const ok = window.confirm(`Delete decision table "${name}"?`);
    if (!ok) return;

    this.svc.deleteTable(id).subscribe({
      next: () => {
        this.setStatus('Deleted.', 'ok', 3000);
        this.refreshTables(false);
        this.pageMode = 'list';
      },
      error: (err: any) => {
        console.error(err);
        this.setStatus('Delete failed.', 'err');
      }
    });
  }

  badgeStatusClass(status: any): string {
    const s = (status ?? '').toString().toLowerCase();
    if (s === 'draft') return 'draft';
    if (s === 'active' || s === 'deployed' || s === 'published') return 'active';
    if (s === 'inactive' || s === 'disabled') return 'inactive';
    return 'gray';
  }

  formatDate(val: any): string {
    if (!val) return '';
    const d = new Date(val);
    if (isNaN(d.getTime())) return String(val);
    return d.toLocaleString();
  }


  createNewTable(): void {
    this.pageMode = 'builder';
    const id = this.svc.newId('dt');

    const payload: DecisionTableDefinition = {
      id,
      name: `New Decision Table ${Math.floor(1000 + Math.random() * 9000)}`,
      description: '',
      hitPolicy: 'FIRST',
      version: 1,
      status: 'DRAFT',
      activeFlag: true,
      updatedOn: new Date().toISOString(),
      columns: [
        { id: this.svc.newId('c'), kind: 'condition', key: 'condition1', label: 'Condition', dataType: 'string', inputType: 'text', operator: '=', isEnabled: true },
        { id: this.svc.newId('r'), kind: 'result', key: 'result1', label: 'Result', dataType: 'string', inputType: 'text', isEnabled: true }
      ],
      rows: [{ id: this.svc.newId('row'), enabled: true, cells: {} }]
    };

    this.svc.createTable(payload).subscribe({
      next: (newId) => {
        this.statusText = 'Created.';
        this.refreshTables(false);
        this.loadTable(newId || id);
        this.refreshSavedFlag();
      },
      error: (err: any) => {
        console.error(err);
        this.statusText = 'Create failed.';
      }
    });
  }

  loadTable(id: string): void {
    this.pageMode = 'builder';
    if (!id) return;

    this.svc.getTableJson(id).subscribe({
      next: (payload: any) => {
        const p = payload as DecisionTableDefinition;

        this.selectedTableId = p.id ?? id;

        this.meta = {
          id: p.id ?? id,
          name: p.name ?? '',
          description: p.description ?? '',
          hitPolicy: (p.hitPolicy ?? 'FIRST') as HitPolicy,
          version: p.version ?? 1,
          status: (p.status ?? 'DRAFT') as DeployStatus,
          activeFlag: p.activeFlag ?? true,
          updatedOn: p.updatedOn ?? new Date().toISOString()
        };

        this.columns = (Array.isArray(p.columns) ? p.columns : []).map((c: any) => {
          if (c?.kind === 'condition') {
            return { ...c, operator: this.normalizeDtOperator(c.operator) };
          }
          return c;
        });

        this.rows = Array.isArray(p.rows) ? p.rows : [];

        if (this.rows.length === 0) this.rows = [{ id: this.svc.newId('row'), enabled: true, cells: {} }];

        this.statusText = 'Loaded.';
        this.checkLinkedRuleForCurrentTable();
        this.refreshSavedFlag();

      },
      error: (err: any) => {
        console.error(err);
        this.statusText = 'Load failed.';
      }
    });
  }

  saveTable(): void {
    this.normalizeIdsBeforeSave();
    const payload = this.buildPayload();
    if (!payload.name?.trim()) {
      this.setStatus('Name required.', 'err');
      return;
    }

    const id = payload.id;
    const exists = this.tables.some(t => t.id === id);

    const call$ = exists
      ? this.svc.updateTable(id, payload)
      : this.svc.createTable(payload).pipe(map(() => void 0));

    call$.subscribe({
      next: () => {
        this.setStatus(`Saved successfully. ID: ${id}`, 'ok', 4000);
        this.isTableSaved = true;
        this.checkLinkedRuleForCurrentTable();
        this.refreshTables(false);
      },
      error: (err: any) => {
        console.error(err);
        this.setStatus('Save failed.', 'err');
      }
    });
  }

  deleteCurrent(): void {
    const id = this.meta.id || this.selectedTableId;
    if (!id) return;

    const ok = window.confirm('Delete this decision table?');
    if (!ok) return;

    this.svc.deleteTable(id).subscribe({
      next: () => {
        this.setStatus('Deleted.', 'ok', 3000);
        this.refreshTables(false);
        this.goToList();
      },
      error: (err: any) => {
        console.error(err);
        this.setStatus('Delete failed.', 'err');
      }
    });
  }

  private buildPayload(): DecisionTableDefinition {
    const computedId = this.computeTableId((this.meta.name ?? '').trim());
    const id = this.meta.id || this.selectedTableId || computedId || this.svc.newId('dt');

    return {
      id,
      name: (this.meta.name ?? '').trim(),
      description: (this.meta.description ?? '').trim(),
      hitPolicy: (this.meta.hitPolicy ?? 'FIRST'),
      version: Number(this.meta.version ?? 1),
      status: (this.meta.status ?? 'DRAFT'),
      activeFlag: (this.meta.activeFlag ?? true),
      updatedOn: new Date().toISOString(),
      columns: this.columns,
      rows: this.rows
    };
  }

  // ------------ Column actions ------------
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

    const label = kind === 'condition' ? 'Condition' : kind === 'calculation' ? 'Calculation' : 'Result';

    let key = `${base}${this.columns.filter(x => x.kind === kind).length + 1}`;

    // Result columns should be: dt.result.<ResultNameWithoutSpaces>
    if (kind === 'result') {
      const desired = this.computeResultKey(label);
      const taken = new Set(this.columns.filter(c => c.kind === 'result').map(c => c.key));
      key = this.makeUniqueKey(desired, taken);
    }

    const col: DtColumn = {
      id,
      kind,
      key,
      label,
      dataType: 'string',
      inputType: 'text',
      isEnabled: true
    };

    if (kind === 'condition') {
      col.operator = '=';
      this.condFieldSearch[col.id] = '';
      this.condFieldOptions[col.id] = this.defaultTop20;
    }

    this.columns = [...this.columns, col];
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

    // Keep result column keys as: dt.result.<ResultNameWithoutSpaces>
    if (col.kind === 'result') {
      const desired = this.computeResultKey(col.label);
      const taken = new Set(
        this.columns
          .filter(c => c.kind === 'result' && c.id !== col.id)
          .map(c => c.key)
      );
      col.key = this.makeUniqueKey(desired, taken);
    }
  }

  // ------------ Row actions ------------
  addRow(): void {
    const r = { id: this.svc.newId('row'), enabled: true, cells: {} as Record<string, string> };
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

    const r = { id: this.svc.newId('row'), enabled: true, cells: {} as Record<string, string> };
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
  //trackByTable(_: number, t: any): any { return t?.id; }
  trackByRow(_: number, r: DtRow): any { return r.id; }
  trackByCol(_: number, c: DtColumn): any { return c.id; }

  private calcMenuPosFromEvent(ev: MouseEvent): { left: string; top: string } {
    const el = ev.currentTarget as HTMLElement;
    const r = el.getBoundingClientRect();

    const margin = 8;
    const w = this.menuSize.w;
    const h = this.menuSize.h;

    let left = r.left;
    let top = r.bottom + margin;

    if (left + w + margin > window.innerWidth) left = window.innerWidth - w - margin;
    if (top + h + margin > window.innerHeight) top = r.top - h - margin;
    if (top < margin) top = margin;
    if (left < margin) left = margin;

    return { left: `${Math.round(left)}px`, top: `${Math.round(top)}px` };
  }

  onAddRule(): void {
    // placeholder action – wire this to your rules page or modal
    console.log('Add Rule clicked. Hook to rules page/modal.');
  }

  private loadAllRuleDataFieldsForMapping(): void {
    // GET /api/rulesengine/datafields  (no moduleId => all)
    this.svc.getRuleDataFields(undefined as any).subscribe({
      next: (rows: any[]) => {
        const all: FieldRef[] = [];

        for (const r of (Array.isArray(rows) ? rows : [])) {
          const moduleName = r.moduleName ?? '';
          const jsonText = r.ruleDataFieldJson ?? '{}';

          let parsed: any = null;
          try { parsed = JSON.parse(jsonText); } catch { parsed = null; }

          const datasets = Array.isArray(parsed?.datasets) ? parsed.datasets : [];
          for (const ds of datasets) {
            const datasetKey = ds.datasetKey ?? '';
            const datasetName = ds.datasetName ?? ds.sourceSectionName ?? datasetKey;
            const fields = Array.isArray(ds.dataFields) ? ds.dataFields : [];

            for (const f of fields) {
              const fieldKey = f.fieldKey ?? '';
              if (!fieldKey) continue;

              all.push({
                fieldKey,
                fieldName: f.fieldName ?? f.name ?? '',
                path: f.path ?? '',
                datasetKey,
                datasetName,
                moduleName
              });
            }
          }
        }

        // stable sort
        all.sort((a, b) => {
          const m = (a.moduleName ?? '').localeCompare(b.moduleName ?? '');
          if (m !== 0) return m;
          const d = (a.datasetName ?? '').localeCompare(b.datasetName ?? '');
          if (d !== 0) return d;
          return (a.fieldName ?? '').localeCompare(b.fieldName ?? '');
        });

        this.fieldIndex = new Map(all.map(x => [x.fieldKey, x]));

        // ✅ Pass ALL options to dropdown (autocomplete inside ui-smart-dropdown will filter)
        this.allFieldUiOptions = all.map(x => ({
          value: x.fieldKey,
          label: `${x.fieldName}  •  ${x.moduleName} / ${x.datasetName}`
        }));

        // if table already loaded, ensure labels are hydrated
        this.hydrateMappedFieldLabels();
      },
      error: (err: any) => {
        console.error('Failed to load rule datafields for mapping', err);
        this.allFieldUiOptions = [];
        this.fieldIndex.clear();
      }
    });
  }


  private hydrateMappedFieldLabels(): void {
    if (!this.columns?.length || this.fieldIndex.size === 0) return;

    for (const c of this.columns) {
      if (c.kind !== 'condition') continue;
      if (!c.mappedFieldKey) continue;

      const ref = this.fieldIndex.get(c.mappedFieldKey);
      if (!ref) continue;

      c.mappedFieldLabel = c.mappedFieldLabel ?? `${ref.fieldName} • ${ref.moduleName} / ${ref.datasetName}`;
      c.mappedFieldPath = c.mappedFieldPath ?? ref.path;
      c.mappedDatasetKey = c.mappedDatasetKey ?? ref.datasetKey;
      c.mappedModule = c.mappedModule ?? ref.moduleName;
    }
  }



  getCondFieldOptions(colId: string): UiSmartOption<string>[] {
    return this.condFieldOptions[colId] ?? this.defaultTop20;
  }

  onCondFieldSelect(col: any, fieldKey: string): void {
    col.mappedFieldKey = fieldKey || undefined;

    const ref = fieldKey ? this.fieldIndex.get(fieldKey) : undefined;
    col.mappedFieldLabel = ref ? `${ref.fieldName} • ${ref.moduleName} / ${ref.datasetName}` : undefined;
    col.mappedFieldPath = ref?.path;
    col.mappedDatasetKey = ref?.datasetKey;
    col.mappedModule = ref?.moduleName;
  }

  onCondOperatorSelect(col: any, operator: string): void {
    col.operator = this.normalizeDtOperator(operator);
  }

  private opKey(op: string): string {
    return (op ?? '').toString().replace(/\s+/g, ' ').trim().toLowerCase();
  }

  private normalizeDtOperator(operator: any): string {
    const raw = (operator ?? '').toString();
    const key = this.opKey(raw);

    // direct match against known operator codes
    const direct = this.operatorCodeIndex.get(key);
    if (direct) return direct;

    // legacy function-style operators (fallback)
    const legacy: Record<string, string> = {
      eq: '=',
      ne: '!=',
      gt: '>',
      gte: '>=',
      lt: '<',
      lte: '<='
    };
    const mapped = legacy[key];
    if (mapped) return mapped;

    // default
    return '=';
  }

  /****************** Add rule logic *********************/
  // --- Rule flyout state ---
  showRuleFlyout = false;
  private closeTimer: any = null;

  savingRule = false;
  ruleSaveOk = '';
  ruleSaveErr = '';

  groups: any[] = []; // RuleGroupModel[]
  groupUiOptions: UiSmartOption<number>[] = [];
  ruleTypeUiOptions: UiSmartOption<string>[] = [];

  ruleDraft: {
    name: string;
    ruleGroupId: number;
    ruleType: string;
    description: string;
    activeFlag: boolean;
  } = {
      name: '',
      ruleGroupId: 0,
      ruleType: 'REALTIME',
      description: '',
      activeFlag: true
    };

  linkedRuleId: number | null = null;
  linkedRuleName = '';
  linkedRuleDtUpdatedOn: string | null = null;

  showUpdateRulePrompt = false;
  private tableJustSaved = false;



  private loadRuleGroups(): void {
    this.svc.getRuleGroups().subscribe({
      next: (res: any[]) => {
        this.groups = Array.isArray(res) ? res : [];
        this.groupUiOptions = this.groups.map(g => ({ value: g.id, label: g.name }));

        // default group
        if (!this.ruleDraft.ruleGroupId && this.groupUiOptions.length > 0) {
          this.ruleDraft.ruleGroupId = this.groupUiOptions[0].value;
        }
      },
      error: (err: any) => {
        console.error('Failed to load rule groups', err);
        this.groups = [];
        this.groupUiOptions = [];
      }
    });
  }

  openRuleFlyout(): void {
    this.cancelCloseRuleFlyout();
    if (!this.showRuleFlyout) {
      this.prefillRuleDraft();
      this.ruleSaveOk = '';
      this.ruleSaveErr = '';
    }
    this.showRuleFlyout = true;
  }

  toggleRuleFlyout(ev: MouseEvent): void {
    ev.stopPropagation();
    if (this.showRuleFlyout) {
      this.closeRuleFlyout();
    } else {
      this.openRuleFlyout();
    }
  }

  closeRuleFlyout(): void {
    this.cancelCloseRuleFlyout();
    this.showRuleFlyout = false;
  }

  scheduleCloseRuleFlyout(): void {
    this.cancelCloseRuleFlyout();
    this.closeTimer = setTimeout(() => {
      this.showRuleFlyout = false;
    }, 250);
  }

  cancelCloseRuleFlyout(): void {
    if (this.closeTimer) {
      clearTimeout(this.closeTimer);
      this.closeTimer = null;
    }
  }



  private prefillRuleDraft(): void {
    // smart defaults based on decision table name
    const dtName = (this.meta?.name ?? '').trim() || 'Decision Table';
    if (!this.ruleDraft.name?.trim()) this.ruleDraft.name = `${dtName} Rule`;
    if (!this.ruleDraft.ruleType) this.ruleDraft.ruleType = 'REALTIME';
    if (this.ruleDraft.activeFlag == null) this.ruleDraft.activeFlag = true;
    if (!this.ruleDraft.description) this.ruleDraft.description = `Generated from Decision Table: ${this.meta?.id ?? ''}`.trim();
    if (!this.ruleDraft.ruleGroupId && this.groupUiOptions.length > 0) this.ruleDraft.ruleGroupId = this.groupUiOptions[0].value;
  }

  saveRuleFromDecisionTable(): void {
    this.ruleSaveOk = '';
    this.ruleSaveErr = '';

    const name = (this.ruleDraft.name ?? '').trim();
    const ruleGroupId = Number(this.ruleDraft.ruleGroupId) || 0;

    if (!name) { this.ruleSaveErr = 'Rule name is required.'; return; }
    if (!ruleGroupId) { this.ruleSaveErr = 'Rule group is required.'; return; }

    // validate: all condition columns should be mapped
    const missing = (this.conditionCols || []).filter((c: any) => !c.mappedFieldKey || !c.mappedFieldPath);
    if (missing.length > 0) {
      this.ruleSaveErr = `Map all condition columns to a Data Field before saving. Missing: ${missing.map((x: any) => x.label).join(', ')}`;
      return;
    }

    const dt = this.buildPayload(); // your current decision table json (id, name, columns, rows...)
    const ruleJsonObj = this.buildRuleJsonFromDecisionTable(dt);

    const req: any = {
      ruleGroupId,
      name,
      ruleType: this.ruleDraft.ruleType ?? 'REALTIME',
      description: (this.ruleDraft.description ?? '').trim(),
      activeFlag: this.ruleDraft.activeFlag ?? true,
      ruleJson: ruleJsonObj // service will stringify -> backend stores as jsonb
    };

    this.savingRule = true;

    // Create rule (POST /rules) already exists
    this.svc.createRule(req).subscribe({
      next: (newId: number) => {
        this.savingRule = false;
        this.ruleSaveOk = `Rule saved (ID: ${newId}).`;
        // keep flyout open so user can see success
      },
      error: (err: any) => {
        console.error('Create rule failed', err);
        this.savingRule = false;
        this.ruleSaveErr = 'Save failed. Check API logs.';
      }
    });
  }


  private buildRuleJsonFromDecisionTable(dt: any): RuleDocV1 {
    const engine = this.buildDecisionTableEngineJson(dt);

    const outputs = (dt?.columns || [])
      .filter((c: any) => c && c.isEnabled && (c.kind === 'result' || c.kind === 'calculation'))
      .map((c: any) => ({
        key: String(c.key ?? '').trim(),
        label: String(c.label ?? c.key ?? '').trim(),
        // map enum -> string for RulesDesigner / rule ui
        dataType: (String(c.dataType ?? 'string').toLowerCase() === 'enum') ? 'string' : String(c.dataType ?? 'string')
      }))
      .filter((o: any) => !!o.key);

    const ui: DecisionTableUiModel = {
      schema: 'rulesengine.uidt.v1',
      version: 1,
      decisionTable: {
        id: dt?.id,
        name: dt?.name,
        tableVersion: dt?.version,
        hitPolicy: dt?.hitPolicy,
        updatedOn: dt?.updatedOn ?? null
      },
      outputs,
      // Editable routing in RulesDesigner, evaluated *after* the decision table returns outputs
      postProcessing: {
        schema: 'rulesengine.uirule.v2',
        version: 2,
        branches: [{ type: 'IF', when: { op: 'AND', children: [] }, then: [] }]
      }
    };

    const doc: RuleDocV1 = {
      schema: 'rulesengine.ruledoc.v1',
      version: 1,
      kind: 'DECISION_TABLE',
      ui,
      engine,
      meta: { source: 'DecisionTableBuilder', generatedOn: new Date().toISOString() }
    };

    return doc;
  }

  private buildDecisionTableEngineJson(dt: any): any {
    // Preserve your existing runtime shape (engine: DecisionTable)
    const condColumns = (dt?.columns || []).filter((c: any) => c.kind === 'condition' && c.isEnabled);

    const conditionFieldRefs = condColumns.map((c: any) => ({
      columnKey: c.key,
      fieldKey: c.mappedFieldKey,
      path: c.mappedFieldPath,
      dataType: c.dataType,
      datasetKey: c.mappedDatasetKey,
      module: c.mappedModule
    }));

    const rows = (dt?.rows || []).filter((r: any) => r.enabled !== false);

    const compiledRules = rows.map((r: any, idx: number) => {
      const conditions = condColumns
        .filter((c: any) => c.mappedFieldPath && c.key)
        .map((c: any) => {
          const raw = (r?.cells || {})[c.id] ?? '';
          return {
            fieldPath: c.mappedFieldPath,
            operator: this.normalizeDtOperator(c.operator),
            value: raw,
            dataType: c.dataType
          };
        });

      // results
      const results: any = {};
      for (const col of (dt?.columns || [])) {
        if (!col || !col.isEnabled) continue;
        if (col.kind === 'result' || col.kind === 'calculation') {
          results[col.key] = (r?.cells || {})[col.id] ?? '';
        }
      }

      return {
        id: `row_${idx + 1}`,
        enabled: r.enabled !== false,
        priority: idx + 1,
        when: { all: conditions },
        then: results
      };
    });

    return {
      engine: 'DecisionTable',
      decisionTable: {
        id: dt?.id,
        name: dt?.name,
        tableVersion: dt?.version,
        hitPolicy: dt?.hitPolicy,
        updatedOn: dt?.updatedOn ?? null
      },
      inputs: {
        conditions: conditionFieldRefs
      },
      rules: compiledRules
    };
  }

  // call after loadTable + after refreshTables + after saveTable

  private extractDecisionTableInfoFromRuleJson(obj: any): { id: string | null; name?: string; tableVersion?: number; updatedOn?: string | null } {
    // RuleDoc wrapper
    if (obj?.schema === 'rulesengine.ruledoc.v1') {
      if (obj?.kind === 'DECISION_TABLE') {
        const ui = obj?.ui;
        const dt = ui?.decisionTable ?? ui;
        const id = dt?.id ?? obj?.engine?.decisionTable?.id ?? null;
        return {
          id,
          name: dt?.name ?? obj?.engine?.decisionTable?.name,
          tableVersion: dt?.tableVersion ?? obj?.engine?.decisionTable?.tableVersion,
          updatedOn: dt?.updatedOn ?? obj?.engine?.decisionTable?.updatedOn ?? null
        };
      }
      // LADDER doc might still reference DTs as actions; not a DT rule
      return { id: null };
    }

    // Legacy DecisionTable runtime JSON
    if (obj?.engine === 'DecisionTable') {
      const dt = obj?.decisionTable ?? {};
      return { id: dt?.id ?? null, name: dt?.name, tableVersion: dt?.tableVersion, updatedOn: dt?.updatedOn ?? null };
    }

    // Very old shape (defensive)
    if (obj?.decisionTable?.id) {
      return { id: obj.decisionTable.id, name: obj?.decisionTable?.name, tableVersion: obj?.decisionTable?.tableVersion, updatedOn: obj?.decisionTable?.updatedOn ?? null };
    }

    return { id: null };
  }

  private checkLinkedRuleForCurrentTable(): void {
    const dtId = this.meta?.id || this.selectedTableId;
    if (!dtId) {
      this.linkedRuleId = null;
      this.linkedRuleName = '';
      this.linkedRuleDtUpdatedOn = null;
      this.showUpdateRulePrompt = false;
      return;
    }

    this.svc.getRules().subscribe({
      next: (rules: any[]) => {
        const arr = Array.isArray(rules) ? rules : [];

        let found: any = null;
        let foundRuleJson: any = null;
        let foundInfo: any = null;

        for (const r of arr) {
          const raw = r.ruleJson ?? r.rulejson ?? null;
          if (!raw) continue;

          let obj: any = null;
          try { obj = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { obj = null; }
          const info = this.extractDecisionTableInfoFromRuleJson(obj);
          if (info?.id && info.id === dtId) {
            found = r;
            foundRuleJson = obj;
            foundInfo = info;
            break;
          }
        }

        if (!found) {
          this.linkedRuleId = null;
          this.linkedRuleName = '';
          this.linkedRuleDtUpdatedOn = null;
          this.showUpdateRulePrompt = false;
          this.tableJustSaved = false;
          return;
        }

        this.linkedRuleId = Number(found.id) || null;
        this.linkedRuleName = found.name ?? '';
        this.linkedRuleDtUpdatedOn = foundInfo?.updatedOn ?? null;

        // prefill flyout fields from existing rule
        this.ruleDraft.name = found.name ?? this.ruleDraft.name;
        this.ruleDraft.ruleGroupId = found.ruleGroupId ?? this.ruleDraft.ruleGroupId;
        this.ruleDraft.ruleType = found.ruleType ?? this.ruleDraft.ruleType;
        this.ruleDraft.description = found.description ?? this.ruleDraft.description;
        this.ruleDraft.activeFlag = found.activeFlag ?? this.ruleDraft.activeFlag;

        // ✅ show prompt only right after a Decision Table save
        if (this.tableJustSaved) {
          const dtUpdatedOn = this.meta.updatedOn;
          this.showUpdateRulePrompt = !!this.linkedRuleId && !!dtUpdatedOn && (this.linkedRuleDtUpdatedOn !== dtUpdatedOn);
          this.tableJustSaved = false;
        }
      },
      error: () => {
        this.tableJustSaved = false;
      }
    });
  }


  saveOrUpdateRuleFromDecisionTable(forceUpdate: boolean = false): void {
    this.ruleSaveOk = '';
    this.ruleSaveErr = '';

    if (!this.isTableSaved) {
      this.ruleSaveErr = 'Save the Decision Table first.';
      return;
    }

    const name = (this.ruleDraft.name ?? '').trim();
    const ruleGroupId = Number(this.ruleDraft.ruleGroupId) || 0;
    if (!name) { this.ruleSaveErr = 'Rule name is required.'; return; }
    if (!ruleGroupId) { this.ruleSaveErr = 'Rule group is required.'; return; }

    // validate: all condition columns mapped
    const missing = (this.conditionCols || []).filter((c: any) => !c.mappedFieldKey || !c.mappedFieldPath);
    if (missing.length > 0) {
      this.ruleSaveErr = `Map all condition columns before saving rule: ${missing.map((x: any) => x.label).join(', ')}`;
      return;
    }

    // build decision table snapshot for rule (use saved updatedOn)
    const dt = { ...this.buildPayload(), updatedOn: this.meta.updatedOn };

    const ruleJsonObj = this.buildRuleJsonFromDecisionTable(dt);

    const req: any = {
      ruleGroupId,
      name,
      ruleType: this.ruleDraft.ruleType ?? 'REALTIME',
      description: (this.ruleDraft.description ?? '').trim(),
      activeFlag: this.ruleDraft.activeFlag ?? true,
      ruleJson: JSON.stringify(ruleJsonObj) // backend expects string json
    };

    this.savingRule = true;

    const shouldUpdate = !!this.linkedRuleId || forceUpdate;

    if (shouldUpdate && this.linkedRuleId) {
      this.svc.updateRule(this.linkedRuleId, req).subscribe({
        next: () => {
          this.savingRule = false;
          this.ruleSaveOk = `Rule updated (ID: ${this.linkedRuleId}).`;
          this.linkedRuleDtUpdatedOn = this.meta.updatedOn;
          this.showUpdateRulePrompt = false;
        },
        error: (err: any) => {
          console.error(err);
          this.savingRule = false;
          this.ruleSaveErr = 'Update failed.';
        }
      });
    } else {
      this.svc.createRule(req).subscribe({
        next: (newId: number) => {
          this.savingRule = false;
          this.ruleSaveOk = `Rule saved (ID: ${newId}).`;
          this.linkedRuleId = newId;
          this.linkedRuleName = name;
          this.linkedRuleDtUpdatedOn = this.meta.updatedOn;
        },
        error: (err: any) => {
          console.error(err);
          this.savingRule = false;
          this.ruleSaveErr = 'Save failed.';
        }
      });
    }
  }


  updateLinkedRuleNow(): void {
    this.showUpdateRulePrompt = false;
    this.saveOrUpdateRuleFromDecisionTable(true);
  }

  dismissRulePrompt(): void {
    this.showUpdateRulePrompt = false;
  }




  // ------------ ID / key helpers ------------
  private toTokenNoSpaces(value: string): string {
    return (value ?? '')
      .trim()
      .replace(/\s+/g, '')
      .replace(/[^A-Za-z0-9_-]/g, '');
  }

  private computeTableId(name: string): string {
    const token = this.toTokenNoSpaces(name);
    return token ? `dt-${token}` : '';
  }

  private computeResultKey(label: string): string {
    const token = this.toTokenNoSpaces(label) || 'Result';
    return `dt.result.${token}`;
  }

  private makeUniqueKey(desired: string, taken: Set<string>): string {
    if (!taken.has(desired)) return desired;
    let i = 2;
    while (taken.has(`${desired}${i}`)) i++;
    return `${desired}${i}`;
  }

  private normalizeIdsBeforeSave(): void {
    // For new/unsaved tables, auto-generate ID from table name (dt-<NameWithoutSpaces>)
    // We treat it as "new" if the current ID does NOT exist in the loaded tables list.
    const currentId = this.meta.id || this.selectedTableId || '';
    const exists = !!currentId && this.tables.some(t => t.id === currentId);
    if (!exists) {
      const computed = this.computeTableId((this.meta.name ?? '').trim());
      if (computed) {
        this.meta.id = computed;
        this.selectedTableId = computed;
      }
    }

    // Ensure every result column key follows dt.result.<LabelWithoutSpaces>
    const taken = new Set<string>();
    for (const c of this.columns) {
      if (c.kind !== 'result') continue;
      const desired = this.computeResultKey(c.label);
      c.key = this.makeUniqueKey(desired, taken);
      taken.add(c.key);
    }
  }

  private setStatus(msg: string, type: 'info' | 'ok' | 'err' = 'info', autoClearMs = 0): void {
    this.statusText = msg;
    this.statusType = type;

    if (this.statusTimer) clearTimeout(this.statusTimer);
    if (autoClearMs > 0) {
      this.statusTimer = setTimeout(() => {
        this.statusText = '';
        this.statusType = 'info';
      }, autoClearMs);
    }
  }

}
