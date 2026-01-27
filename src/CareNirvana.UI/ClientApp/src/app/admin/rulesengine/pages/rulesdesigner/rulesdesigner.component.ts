import { Component, HostListener, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CdkDragDrop, CdkDropList, CdkDrag, CdkDragMove } from '@angular/cdk/drag-drop';
import { of, forkJoin } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import {
  RulesengineService,
  RuleGroupModel,
  RuleModel,
  RuleType,
  DecisionTableListItem, RuleDataFunctionModel
} from 'src/app/service/rulesengine.service';
import { UiSmartOption } from 'src/app/shared/ui/uismartdropdown/uismartdropdown.component';
import { take } from 'rxjs/operators';

type DataType = 'string' | 'number' | 'boolean' | 'date' | 'datetime';

type DragKind = 'field' | 'function' | 'action' | 'decisionTable';
type AndOr = 'AND' | 'OR';

interface FieldDef {
  key: string;       // fieldKey
  label: string;     // fieldName
  dataType: DataType;
  module?: string;
  dataset?: string;
  path?: string;
}

interface FuncParamDef {
  name: string;
  label: string;
  dataType: DataType;
  required?: boolean;
}

interface FuncDef {
  key: string;
  label: string;
  returnType: DataType;
  params: FuncParamDef[];
}

type ActionUiType = 'text' | 'textarea' | 'select' | 'date' | 'datetime' | 'hidden';

interface ActionParamDef {
  fieldKey: string;        // CM.ALERT.ALERTNAME etc
  fieldName: string;       // label
  dataType: DataType;
  uiType: ActionUiType;
  required?: boolean;
  options?: string[];
}

interface ActionDef {
  key: string;             // internal action key
  label: string;           // display label
  params: ActionParamDef[];
}

type Expr =
  | { type: 'field'; fieldKey: string; label: string; dataType: DataType }
  | { type: 'literal'; dataType: DataType; value: any }
  | { type: 'function'; key: string; label: string; returnType: DataType; args: Record<string, Expr | null> };

type OperatorKey =
  | 'EQ' | 'NEQ'
  | 'GT' | 'GTE' | 'LT' | 'LTE'
  | 'CONTAINS' | 'STARTS_WITH' | 'ENDS_WITH'
  | 'IN' | 'NOT_IN'
  | 'IS_EMPTY' | 'NOT_EMPTY';

interface OperatorDef {
  key: OperatorKey;
  label: string;
  needsRhs: boolean;
  allowed: 'any' | DataType[];
}

type WhenNode = WhenGroupNode | WhenConditionNode;

interface WhenGroupNode {
  nodeType: 'group';
  id: string;
  op: AndOr;
  children: WhenNode[];
}

interface WhenConditionNode {
  nodeType: 'condition';
  id: string;
  left: Expr | null;
  operator: OperatorKey | null;
  right: Expr | null; // may be literal/field/function
}

interface ActionInstance {
  id: string;
  actionKey: string;
  label: string;
  params: Record<string, Expr | null>; // keyed by param.fieldKey
}

type BranchType = 'IF' | 'ELSE_IF' | 'ELSE';

interface Branch {
  id: string;
  type: BranchType;
  when: WhenGroupNode | null;     // null for ELSE
  then: ActionInstance[];
}

interface UiRuleJsonV1 {
  schema: 'rulesengine.uirule.v1';
  version: 1;
  branches: Array<{
    type: BranchType;
    when?: any; // When JSON
    then: any[]; // actions JSON
  }>;
}


type RuleDocKind = 'LADDER' | 'DECISION_TABLE';

type DtResponseMode = 'DIRECT' | 'ROUTE';

interface DecisionTableUiModel {
  schema: 'rulesengine.uidt.v1';
  version: 1;
  decisionTable: {
    id: string;
    name?: string;
    tableVersion?: number;
    hitPolicy?: string;
    updatedOn?: string | null;
  };
  outputs?: Array<{ key: string; label?: string; dataType?: DataType }>;

  /**
   * How this Decision Table is used by the rule:
   * - DIRECT: return decision outputs as the rule response (no routing)
   * - ROUTE: use Decision.* outputs in postProcessing (routing) to build the final response/actions
   *
   * NOTE: this is UI-owned metadata; backend can ignore unknown keys safely.
   */
  responseMode?: DtResponseMode;
  responseOutputKey?: string | null;

  // Post-decision routing (optional)
  postProcessing?: UiRuleJsonV2;

  // UI-only: preserve routing edits even if responseMode === 'DIRECT'
  postProcessingDraft?: UiRuleJsonV2;
}


interface UiRuleJsonV2 {
  schema: 'rulesengine.uirule.v2';
  version: 2;
  branches: Array<{
    type: BranchType;
    when?: any;
    then: any[];
  }>;
  assets?: {
    decisionTables?: Array<{ id: string; name?: string; tableVersion?: number }>;
  };
}

interface RuleDocV1 {
  schema: 'rulesengine.ruledoc.v1';
  version: 1;
  kind: RuleDocKind;
  ui: UiRuleJsonV2 | DecisionTableUiModel;
  engine?: any;
  meta?: {
    source?: string;
    generatedOn?: string;
  };
}



interface DragItem {
  kind: DragKind;
  field?: FieldDef;
  fn?: FuncDef;
  action?: ActionDef;
  decisionTable?: DecisionTableListItem;
}
type ExprAutoKind = 'field' | 'function';

interface ExprAutoItem {
  kind: ExprAutoKind;
  label: string;
  meta: string;
  dataType: DataType;
  drag: DragItem;
}

type ExprAutoTarget =
  | { kind: 'condRight'; condId: string; expectedType: DataType | null }
  | { kind: 'actionParam'; instId: string; paramKey: string; expectedType: DataType | null };


@Component({
  selector: 'app-rule-designer',
  templateUrl: './rulesdesigner.component.html',
  styleUrls: ['./rulesdesigner.component.css']
})
export class RuleDesignerComponent implements OnInit {
  // ---- existing page meta (keep)
  loading = false;
  error = '';
  saving = false;

  id = 0;
  rule: (RuleModel & { ruleJson?: string | null }) | null = null;
  groups: RuleGroupModel[] = [];
  ruleType: RuleType = 'REALTIME';
  ruleGroupId = 0;
  name = '';
  description = '';
  activeFlag = true;

  // ---- Data fields from API
  apiRows: any[] = [];
  fields: FieldDef[] = [];

  // ---- Decision tables (drag into THEN)
  decisionTables: DecisionTableListItem[] = [];

  // ---- Decision Outputs (for DecisionTable-driven rules)
  decisionOutputsMeta: Array<{ key: string; label?: string; dataType?: DataType }> = [];
  decisionOutputFields: FieldDef[] = [];

  // ---- Left palette: search
  fieldSearch = '';
  functionSearch = '';
  actionSearch = '';
  decisionTableSearch = '';
  decisionOutputSearch = '';

  // top-5 default view
  showAllFields = false;
  showAllFunctions = false;
  showAllActions = false;
  showAllDecisionTables = false;
  showAllDecisionOutputs = false;


  ruleTypeUiOptions: UiSmartOption<RuleType>[] = [];
  groupUiOptions: UiSmartOption<number>[] = [];

  // ---- Expression autocomplete (replaces RHS drag-drop as a reliable alternative)
  exprAuto = {
    open: false,
    key: '',
    query: '',
    items: [] as ExprAutoItem[],
    target: null as ExprAutoTarget | null
  };

  // ---- Functions / Actions (predefined)
  functions: FuncDef[] = [
    {
      key: 'calculateAge',
      label: 'Calculate Age',
      returnType: 'number',
      params: [
        { name: 'birthDate', label: 'Birth Date', dataType: 'date', required: true }
      ]
    }
  ];

  actions: ActionDef[] = []; // built from your sample JSON + extras

  // ---- Operators
  readonly operators: OperatorDef[] = [
    { key: 'EQ', label: 'Equals', needsRhs: true, allowed: 'any' },
    { key: 'NEQ', label: 'Not Equals', needsRhs: true, allowed: 'any' },

    { key: 'GT', label: 'Greater Than', needsRhs: true, allowed: ['number', 'date', 'datetime'] },
    { key: 'GTE', label: 'Greater / Equal', needsRhs: true, allowed: ['number', 'date', 'datetime'] },
    { key: 'LT', label: 'Less Than', needsRhs: true, allowed: ['number', 'date', 'datetime'] },
    { key: 'LTE', label: 'Less / Equal', needsRhs: true, allowed: ['number', 'date', 'datetime'] },

    { key: 'CONTAINS', label: 'Contains', needsRhs: true, allowed: ['string'] },
    { key: 'STARTS_WITH', label: 'Starts With', needsRhs: true, allowed: ['string'] },
    { key: 'ENDS_WITH', label: 'Ends With', needsRhs: true, allowed: ['string'] },

    { key: 'IN', label: 'In (comma list)', needsRhs: true, allowed: 'any' },
    { key: 'NOT_IN', label: 'Not In (comma list)', needsRhs: true, allowed: 'any' },

    { key: 'IS_EMPTY', label: 'Is Empty', needsRhs: false, allowed: 'any' },
    { key: 'NOT_EMPTY', label: 'Not Empty', needsRhs: false, allowed: 'any' }
  ];

  // ---- Ladder / mode
  // ---- Ladder / mode
  designerMode: RuleDocKind = 'LADDER';
  loadedDecisionTable: { id: string; name?: string; tableVersion?: number } | null = null;
  private _dtBaseDoc: RuleDocV1 | null = null;

  // ---- Decision Table (RUN FIRST) behavior
  dtResponseMode: DtResponseMode = 'ROUTE';
  /** Optional: if you want to return only one output when in DIRECT mode */
  dtResponseOutputKey: string | null = null;

  // ---- Decision Outputs editor (manual fallback)
  dtNewOutputKey = '';
  dtNewOutputType: DataType = 'string';
  dtNewOutputLabel = '';

  readonly dataTypeOptions: DataType[] = ['string', 'number', 'boolean', 'date', 'datetime'];

  get isDtDirectResponse(): boolean {
    return this.designerMode === 'DECISION_TABLE' && this.dtResponseMode === 'DIRECT';
  }

  branches: Branch[] = [];
  activeBranchIndex = 0;

  // ---- Right JSON
  jsonText = '';
  jsonError = '';
  jsonUserEditing = false;
  private _lastStableJsonText = '';

  // ---- IDs for drop lists (stable)
  readonly fieldsPaletteId = 'fieldsPalette';
  readonly functionsPaletteId = 'functionsPalette';
  readonly actionsPaletteId = 'actionsPalette';
  readonly decisionTablesPaletteId = 'decisionTablesPalette';
  readonly decisionOutputsPaletteId = 'decisionOutputsPalette';
  readonly runFirstDropId = 'runFirstDrop';
  readonly canvasDropId = 'canvasDrop';
  readonly thenDropId = 'thenDrop';

  private _idSeq = 0;

  successMsg = '';

  constructor(
    private svc: RulesengineService,
    private route: ActivatedRoute,
    private router: Router
  ) { }

  ngOnInit(): void {
    // route id (if your page uses it)
    this.id = Number(this.route.snapshot.paramMap.get('id')) || 0;

    this.ruleTypeUiOptions = this.svc.getRuleTypeOptions().map(x => ({ value: x.value, label: x.label }));

    // Build action defs from your sample + add "Set Field" as generic assignment
    this.buildActions();
    this.refreshFunctions();
    // Default ladder state (empty canvas)
    this.branches = [this.makeIfBranch()];
    this.activeBranchIndex = 0;
    this.syncJsonFromDesigner();

    // Load page data (groups/rule) if you are editing existing rules
    if (this.id) {
      this.loading = true;
      forkJoin({
        groups: this.svc.getRuleGroups(),
        rules: this.svc.getRules()
      }).subscribe({
        next: (res: any) => {
          this.groups = res.groups ?? [];
          this.groupUiOptions = this.groups.map(g => ({ value: g.id, label: g.name }));

          const r = (res.rules ?? []).find((x: any) => x.id === this.id) as any;
          if (r) {
            this.rule = r;
            this.name = r.name ?? '';
            this.description = r.description ?? '';
            this.ruleType = r.ruleType ?? 'REALTIME';
            this.ruleGroupId = r.ruleGroupId ?? 0;
            this.activeFlag = r.activeFlag ?? true;

            // Try load our designer JSON (if it matches schema)
            this.tryLoadFromRuleJson(r.ruleJson ?? r.ruleJsonString ?? r.ruleJsonText ?? null);
          }
          this.loading = false;
        },
        error: (e) => {
          console.error(e);
          this.loading = false;
        }
      });
    }

    // ✅ Your requested call pattern: getRuleDataFields(undefined as any)
    this.svc.getRuleDataFields(undefined as any).subscribe({
      next: (rows: any) => {
        this.apiRows = Array.isArray(rows) ? rows : [];
        this.fields = this.buildFieldsFromApiRows(this.apiRows);
        this.syncJsonFromDesigner();
      },
      error: (e) => console.error(e)
    });

    // Decision Tables for drag/drop into THEN
    this.svc.listTables().subscribe({
      next: (rows: any) => {
        this.decisionTables = Array.isArray(rows) ? rows : [];
      },
      error: (e) => console.error(e)
    });
  }

  // ============================================================
  // Palette lists (top 5 by default)
  // ============================================================

  get filteredFields(): FieldDef[] {
    const q = (this.fieldSearch || '').trim().toLowerCase();
    const list = !q
      ? this.fields
      : this.fields.filter(f =>
        (f.label || '').toLowerCase().includes(q) ||
        (f.key || '').toLowerCase().includes(q) ||
        (f.dataset || '').toLowerCase().includes(q) ||
        (f.module || '').toLowerCase().includes(q)
      );
    return list;
  }

  get visibleFields(): FieldDef[] {
    return this.showAllFields ? this.filteredFields : this.filteredFields.slice(0, 5);
  }

  get filteredFunctions(): FuncDef[] {
    const q = (this.functionSearch || '').trim().toLowerCase();
    const list = !q ? this.functions : this.functions.filter(fn =>
      fn.label.toLowerCase().includes(q) || fn.key.toLowerCase().includes(q)
    );
    return list;
  }

  get visibleFunctions(): FuncDef[] {
    return this.showAllFunctions ? this.filteredFunctions : this.filteredFunctions.slice(0, 5);
  }

  get filteredActions(): ActionDef[] {
    const q = (this.actionSearch || '').trim().toLowerCase();
    const list = !q ? this.actions : this.actions.filter(a =>
      a.label.toLowerCase().includes(q) || a.key.toLowerCase().includes(q)
    );
    return list;
  }

  get visibleActions(): ActionDef[] {
    return this.showAllActions ? this.filteredActions : this.filteredActions.slice(0, 5);
  }


  get filteredDecisionTables(): DecisionTableListItem[] {
    const q = (this.decisionTableSearch || '').trim().toLowerCase();
    const list = !q ? this.decisionTables : this.decisionTables.filter((t: any) =>
      ((t?.name ?? '').toLowerCase().includes(q)) ||
      ((t?.id ?? '').toLowerCase().includes(q))
    );
    return list;
  }

  get visibleDecisionTables(): DecisionTableListItem[] {
    return this.showAllDecisionTables ? this.filteredDecisionTables : this.filteredDecisionTables.slice(0, 5);
  }


  get filteredDecisionOutputs(): FieldDef[] {
    const q = (this.decisionOutputSearch || '').trim().toLowerCase();
    const list = !q ? this.decisionOutputFields : this.decisionOutputFields.filter((f: any) =>
      ((f?.label ?? '').toLowerCase().includes(q)) ||
      ((f?.key ?? '').toLowerCase().includes(q))
    );
    return list;
  }

  get visibleDecisionOutputs(): FieldDef[] {
    return this.showAllDecisionOutputs ? this.filteredDecisionOutputs : this.filteredDecisionOutputs.slice(0, 5);
  }


  // ============================================================
  // Drag data factories
  // ============================================================

  dragField(f: FieldDef): DragItem {
    return { kind: 'field', field: f };
  }

  dragFunction(fn: FuncDef): DragItem {
    return { kind: 'function', fn };
  }

  dragAction(a: ActionDef): DragItem {
    return { kind: 'action', action: a };
  }

  dragDecisionTable(t: DecisionTableListItem): DragItem {
    return { kind: 'decisionTable', decisionTable: t };
  }


  // ============================================================
  // Drag hover tracking
  // (Ensures the deepest drop-list under the pointer receives the drop,
  //  so parent groups / canvas don't steal drops meant for nested groups / expr slots.)
  // ============================================================
  private _hoveredDropListId: string | null = null;

  onPaletteDragMoved(ev: CdkDragMove<any>): void {
    if (typeof document === 'undefined') return;

    const { x, y } = ev.pointerPosition;
    const stack = (document.elementsFromPoint(x, y) as unknown as HTMLElement[]) || [];

    const nearestDrop = stack
      .filter(el => !el.classList?.contains('cdk-drag-preview') && !el.classList?.contains('cdk-drag-placeholder'))
      .map(el => (el.classList?.contains('cdk-drop-list') ? el : (el.closest?.('.cdk-drop-list') as HTMLElement | null)))
      .find(el => !!el) as HTMLElement | undefined;

    this._hoveredDropListId = nearestDrop?.id || null;
  }

  onPaletteDragEnded(): void {
    this._hoveredDropListId = null;
  }


  // ============================================================
  // Drop predicates (prevent wrong drops)
  // ============================================================

  canDropToWhen = (drag: CdkDrag<any>, drop: CdkDropList<any>) => {
    const d = drag.data as DragItem;
    const ok = d?.kind === 'field' || d?.kind === 'function';
    if (!ok) return false;

    // Only let the drop-list currently under the pointer accept the drag.
    // This prevents parent group drop-lists (and the canvas) from stealing
    // drops meant for nested groups / expression slots (especially for group-within-group).
    if (this._hoveredDropListId && drop.id !== this._hoveredDropListId) return false;

    return true;
  };

  canDropToThen = (drag: CdkDrag<any>, _drop: CdkDropList<any>) => {
    const d = drag.data as DragItem;
    return d?.kind === 'action' || d?.kind === 'decisionTable';
  };

  canDropToExpr = (drag: CdkDrag<any>, _drop: CdkDropList<any>) => {
    const d = drag.data as DragItem;
    return d?.kind === 'field' || d?.kind === 'function';
  };

  canDropToRunFirst = (drag: CdkDrag<any>, _drop: CdkDropList<any>) => {
    const d = drag.data as DragItem;
    return d?.kind === 'decisionTable';
  };

  // ============================================================

  // ============================================================
  // RUN FIRST: Decision Table attachment (drag/drop into designer)
  // ============================================================

  dropToRunFirst(ev: CdkDragDrop<any>): void {
    const d = ev.item.data as DragItem;
    if (!d || d.kind !== 'decisionTable' || !d.decisionTable) return;
    this.attachDecisionTableAsRunFirst(d.decisionTable);
  }

  setDtResponseMode(mode: DtResponseMode): void {
    if (this.dtResponseMode === mode) return;
    this.dtResponseMode = mode;
    this.syncJsonFromDesigner();
  }

  attachDecisionTableAsRunFirst(t: DecisionTableListItem): void {
    const dtId = (t as any)?.id ?? '';
    if (!dtId) return;

    const dtName = (t as any)?.name ?? undefined;
    const dtVersionRaw = (t as any)?.version ?? (t as any)?.tableVersion ?? null;
    const dtVersion = (dtVersionRaw != null && dtVersionRaw !== '') ? Number(dtVersionRaw) : undefined;

    // Switch the UI into DecisionTable-first mode
    this.designerMode = 'DECISION_TABLE';
    this.loadedDecisionTable = { id: dtId, name: dtName, tableVersion: dtVersion };

    // Default: route using outputs (user can switch to DIRECT)
    if (!this.dtResponseMode) this.dtResponseMode = 'ROUTE';

    // Create/refresh a base doc so we can preserve engine/meta if present later.
    const existingEngine = (this._dtBaseDoc as any)?.engine;
    const nowIso = new Date().toISOString();

    const draft = this.toUiRuleJsonV2();

    const ui: any = {
      schema: 'rulesengine.uidt.v1',
      version: 1,
      decisionTable: {
        id: dtId,
        name: dtName,
        tableVersion: dtVersion
      },
      // If outputs are already known (manual editor or loaded), keep them
      outputs: (this.decisionOutputsMeta || []).map(o => ({ key: o.key, label: o.label, dataType: o.dataType })),
      // Preserve routing edits even if user switches to DIRECT
      postProcessingDraft: draft
    };

    this._dtBaseDoc = {
      schema: 'rulesengine.ruledoc.v1',
      version: 1,
      kind: 'DECISION_TABLE',
      ui,
      engine: existingEngine,
      meta: { source: 'RulesDesigner', generatedOn: nowIso }
    };

    this.hydrateDecisionOutputsFromDecisionTable(dtId);

    this.syncJsonFromDesigner();
  }

  clearRunFirstDecisionTable(): void {
    // Revert to LADDER rule (DecisionTable removed)
    this.designerMode = 'LADDER';
    this.loadedDecisionTable = null;
    this._dtBaseDoc = null;

    // Keep branches as-is (they become the LADDER rule body again)
    this.dtResponseMode = 'ROUTE';
    this.dtResponseOutputKey = null;

    // Decision outputs are not used in LADDER mode
    this.decisionOutputsMeta = [];
    this.decisionOutputFields = [];

    this.syncJsonFromDesigner();
  }

  addDecisionOutput(): void {
    const rawKey = (this.dtNewOutputKey || '').trim();
    if (!rawKey) return;

    const key = rawKey.startsWith('Decision.') ? rawKey.substring('Decision.'.length) : rawKey;
    if (!key) return;

    const exists = (this.decisionOutputsMeta || []).some(x => x.key === key);
    if (exists) return;

    const label = (this.dtNewOutputLabel || '').trim() || key;

    this.decisionOutputsMeta = [
      ...(this.decisionOutputsMeta || []),
      { key, label, dataType: this.dtNewOutputType ?? 'string' }
    ];

    this.rebuildDecisionOutputFields();

    // reset editor
    this.dtNewOutputKey = '';
    this.dtNewOutputLabel = '';
    this.dtNewOutputType = 'string';

    this.syncJsonFromDesigner();
  }

  removeDecisionOutput(key: string): void {
    const k = (key || '').replace(/^Decision\./, '').trim();
    if (!k) return;

    this.decisionOutputsMeta = (this.decisionOutputsMeta || []).filter(x => x.key !== k);
    this.rebuildDecisionOutputFields();
    this.syncJsonFromDesigner();
  }

  private rebuildDecisionOutputFields(): void {
    const meta = (this.decisionOutputsMeta || []);
    this.decisionOutputFields = meta.map(m => ({
      key: `Decision.${m.key}`,
      label: `Decision.${m.key}`,
      dataType: m.dataType ?? 'string',
      module: 'Decision',
      dataset: 'Decision',
      path: `Decision.${m.key}`
    }));
  }

  /**
   * Auto-populate Decision.* outputs from the underlying Decision Table JSON so that
   * dropping a Decision Table into RUN FIRST immediately shows its result columns
   * in the "Decision Outputs" palette.
   *
   * This uses your existing getTableJson() hook (sync / Promise / Observable supported).
   */


private hydrateDecisionOutputsFromDecisionTable(dtId: string): void {
  const anyThis: any = this as any;

  // Prefer service method; fallback to component method if it exists
  const maybe: any =
  (this.svc && typeof (this.svc as any).getTableJson === 'function')
    ? (this.svc as any).getTableJson(dtId)
    : (typeof anyThis.getTableJson === 'function'
      ? (anyThis.getTableJson(dtId) ?? anyThis.getTableJson())
      : null);

  console.log('hydrateDecisionOutputsFromDecisionTable', dtId, maybe);
  if(!maybe) return;

  const apply = (raw: any) => {
    let obj: any = raw;

    // raw can be JSON string or object
    try {
      if (typeof obj === 'string') obj = JSON.parse(obj);
    } catch {
      // ignore parse errors
    }

    // support wrappers (depending on your API)
    obj = obj?.decisionTableJson ?? obj?.decisiontablejson ?? obj;

    const cols = Array.isArray(obj?.columns) ? obj.columns : [];
    const resultCols = cols.filter((c: any) => c?.kind === 'result' && c?.isEnabled !== false);

    if (!resultCols.length) return;

    const meta = resultCols
      .map((c: any) => {
        const key = String(c?.key ?? '').trim();
        if (!key) return null;

        return {
          key,
          label: (c?.label ?? key),
          dataType: this.normalizeDtDataType(c?.dataType)
        } as { key: string; label?: string; dataType?: DataType };
      })
      .filter(Boolean) as Array<{ key: string; label?: string; dataType?: DataType }>;

    if (!meta.length) return;

    this.decisionOutputsMeta = meta;
    this.rebuildDecisionOutputFields();

    // Keep the underlying DT doc in sync so JSON output reflects these defaults immediately.
    if (this._dtBaseDoc && (this._dtBaseDoc.ui as any)?.schema === 'rulesengine.uidt.v1') {
      const ui: any = this._dtBaseDoc.ui;
      ui.outputs = meta.map(o => ({ key: o.key, label: o.label, dataType: o.dataType }));
    }

    this.syncJsonFromDesigner();
  };

  // ✅ Observable (RxJS) — handle FIRST
  if(typeof maybe?.subscribe === 'function') {
  maybe.pipe(take(1)).subscribe({
    next: (v: any) => apply(v),
    error: () => { /* optionally log */ }
  });
  return;
}

// ✅ Promise / thenable
if (typeof maybe?.then === 'function') {
  maybe.then((v: any) => apply(v)).catch(() => { /* optionally log */ });
  return;
}

// ✅ Plain object
apply(maybe);
}


  private normalizeDtDataType(dtType: any): DataType {
  const t = String(dtType ?? '').toLowerCase();

  if (t === 'number' || t === 'boolean' || t === 'date' || t === 'datetime' || t === 'string') return t as DataType;
  if (t === 'date_time' || t === 'date-time' || t === 'timestamp') return 'datetime';

  return 'string';
}

  // Ladder helpers
  // ============================================================

  get activeBranch(): Branch {
  return this.branches[this.activeBranchIndex] || this.branches[0];
}

makeIfBranch(): Branch {
  return {
    id: this.makeId('br'),
    type: 'IF',
    when: this.makeEmptyGroup(),
    then: []
  };
}

makeElseIfBranch(): Branch {
  return {
    id: this.makeId('br'),
    type: 'ELSE_IF',
    when: this.makeEmptyGroup(),
    then: []
  };
}

ensureElseBranch(): void {
  const hasElse = this.branches.some(b => b.type === 'ELSE');
  if(hasElse) return;

  const activeId = this.activeBranch?.id;

  this.branches.push({
    id: this.makeId('br'),
    type: 'ELSE',
    when: null,
    then: []
  });

  this.normalizeBranches();

  // restore active selection if possible
  if(activeId) {
    const idx = this.branches.findIndex(b => b.id === activeId);
    if (idx >= 0) this.activeBranchIndex = idx;
  }

    this.syncJsonFromDesigner();
}

addElseIf(): void {
  // Insert before ELSE (if exists), otherwise append
  const elseIdx = this.branches.findIndex(b => b.type === 'ELSE');
  const insertAt = elseIdx >= 0 ? elseIdx : this.branches.length;

  const nb = this.makeElseIfBranch();
  this.branches.splice(insertAt, 0, nb);

  // Normalize types (ensures first branch is IF, rest ELSE_IF) and ELSE stays last
  this.normalizeBranches();

  // keep focus on the newly added branch (even if type normalized to IF)
  const newIdx = this.branches.findIndex(b => b.id === nb.id);
  this.activeBranchIndex = newIdx >= 0 ? newIdx : Math.min(insertAt, this.branches.length - 1);

  this.syncJsonFromDesigner();
}



canRemoveBranch(b: Branch): boolean {
  return b.type !== 'ELSE' && this.branches.length > 1;
}

removeBranch(branchId: string): void {
  const idx = this.branches.findIndex(b => b.id === branchId);
  if(idx < 0) return;

  const b = this.branches[idx];
  if(b.type === 'ELSE') return; // not supported (yet)

  const activeId = this.activeBranch?.id;

  this.branches.splice(idx, 1);

  if(!this.branches.length) {
  this.branches = [this.makeIfBranch()];
}

this.normalizeBranches();

// Keep current branch selected if it still exists; otherwise select nearest.
if (activeId) {
  const newActiveIdx = this.branches.findIndex(x => x.id === activeId);
  if (newActiveIdx >= 0) {
    this.activeBranchIndex = newActiveIdx;
  } else {
    this.activeBranchIndex = Math.min(idx, this.branches.length - 1);
  }
} else {
  this.activeBranchIndex = Math.min(idx, this.branches.length - 1);
}

this.syncJsonFromDesigner();
  }

  /**
   * Keeps branch list structurally valid:
   * - 0 or 1 ELSE branch (keeps the last one if multiple)
   * - ELSE is always the last branch (if present)
   * - First non-ELSE branch is IF; the rest are ELSE_IF
   */
  private normalizeBranches(): void {
  if(!this.branches || this.branches.length === 0) {
  this.branches = [this.makeIfBranch()];
  this.activeBranchIndex = 0;
  return;
}

const elseBranches = this.branches.filter(x => x.type === 'ELSE');
const elseBranch = elseBranches.length ? elseBranches[elseBranches.length - 1] : null;

const nonElse = this.branches.filter(x => x.type !== 'ELSE');

if (nonElse.length) {
  nonElse[0].type = 'IF';
  for (let i = 1; i < nonElse.length; i++) nonElse[i].type = 'ELSE_IF';
}

this.branches = elseBranch ? [...nonElse, elseBranch] : nonElse;

if (this.branches.length === 0) {
  this.branches = [this.makeIfBranch()];
  this.activeBranchIndex = 0;
}
  }

setActiveBranch(i: number): void {
  this.activeBranchIndex = i;
}

// ============================================================
// WHEN canvas operations
// ============================================================

toggleActiveGroupOp(): void {
  const g = this.activeBranch.when;
  if(!g) return;
  g.op = g.op === 'AND' ? 'OR' : 'AND';
  this.syncJsonFromDesigner();
}

isActiveGroupEmpty(): boolean {
  const g = this.activeBranch.when;
  return !g || g.children.length === 0;
}

addEmptyConditionToActiveGroup(): void {
  const g = this.activeBranch.when;
  if(!g) return;
  g.children.push(this.makeEmptyCondition());
  this.syncJsonFromDesigner();
}

// Drop onto the main WHEN canvas: create a new condition with left prefilled
dropToActiveWhenCanvas(ev: CdkDragDrop<any>): void {
  const g = this.activeBranch.when;
  if(!g) return;

  const d = ev.item.data as DragItem;
  if(!d || (d.kind !== 'field' && d.kind !== 'function')) return;

const cond = this.makeEmptyCondition();
cond.left = this.dragItemToExpr(d);
g.children.push(cond);

this.syncJsonFromDesigner();
  }

removeWhenNode(groupId: string, nodeId: string): void {
  const g = this.findGroupById(this.activeBranch.when, groupId);
  if(!g) return;

  g.children = g.children.filter(n => n.id !== nodeId);
  this.syncJsonFromDesigner();
}

addGroup(parentGroupId: string): void {
  const g = this.findGroupById(this.activeBranch.when, parentGroupId);
  if(!g) return;

  g.children.push(this.makeEmptyGroup());
  this.syncJsonFromDesigner();
}

addCondition(parentGroupId: string): void {
  const g = this.findGroupById(this.activeBranch.when, parentGroupId);
  if(!g) return;

  g.children.push(this.makeEmptyCondition());
  this.syncJsonFromDesigner();
}

toggleGroupOp(groupId: string): void {
  const g = this.findGroupById(this.activeBranch.when, groupId);
  if(!g) return;

  g.op = g.op === 'AND' ? 'OR' : 'AND';
  this.syncJsonFromDesigner();
}

// Drop into a group (nested groups)
dropToGroup(groupId: string, ev: CdkDragDrop<any>): void {
  const g = this.findGroupById(this.activeBranch.when, groupId);
  if(!g) return;

  const d = ev.item.data as DragItem;
  if(!d || (d.kind !== 'field' && d.kind !== 'function')) return;

const cond = this.makeEmptyCondition();
cond.left = this.dragItemToExpr(d);
g.children.push(cond);

this.syncJsonFromDesigner();
  }

operatorOptionsFor(left: Expr | null): OperatorDef[] {
  if (!left) return this.operators;

  const t: DataType =
    left.type === 'field' ? left.dataType :
      left.type === 'literal' ? left.dataType :
        left.returnType;

  return this.operators.filter(op =>
    op.allowed === 'any' || (Array.isArray(op.allowed) && op.allowed.includes(t))
  );
}

operatorNeedsRhs(op: OperatorKey | null): boolean {
  if (!op) return false;
  return this.operators.find(x => x.key === op)?.needsRhs ?? true;
}

onOperatorChanged(): void {
  // keep RHS if still needed; otherwise clear RHS
  this.syncJsonFromDesigner();
}

onGroupOpChanged(): void {
  this.syncJsonFromDesigner();
}

// Drop into condition LEFT slot
dropCondLeft(condId: string, ev: CdkDragDrop<any>): void {
  const c = this.findCondition(this.activeBranch.when, condId);
  if(!c) return;

  const d = ev.item.data as DragItem;
  if(!d || (d.kind !== 'field' && d.kind !== 'function')) return;

c.left = this.dragItemToExpr(d);
c.operator = null;
c.right = null;
this.syncJsonFromDesigner();
  }

// Drop into condition RIGHT slot
dropCondRight(condId: string, ev: CdkDragDrop<any>): void {
  const c = this.findCondition(this.activeBranch.when, condId);
  if(!c) return;

  const d = ev.item.data as DragItem;
  if(!d || (d.kind !== 'field' && d.kind !== 'function')) return;

c.right = this.dragItemToExpr(d);
this.syncJsonFromDesigner();
  }

clearCondLeft(condId: string): void {
  const c = this.findCondition(this.activeBranch.when, condId);
  if(!c) return;

  c.left = null;
  c.operator = null;
  c.right = null;
  this.syncJsonFromDesigner();
}

clearCondRight(condId: string): void {
  const c = this.findCondition(this.activeBranch.when, condId);
  if(!c) return;

  c.right = null;
  this.syncJsonFromDesigner();
}

setCondLiteralRight(condId: string, text: string): void {
  const c = this.findCondition(this.activeBranch.when, condId);
  if(!c) return;

  const dt = this.exprDataType(c.left) ?? 'string';
  c.right = { type: 'literal', dataType: dt, value: this.parseLiteral(dt, text) };
  this.syncJsonFromDesigner();
}

  // ============================================================
  // THEN actions
  // ============================================================



  private makeRunDecisionTableAction(t: DecisionTableListItem): ActionInstance {
  const dtId = (t as any)?.id ?? '';
  const dtName = (t as any)?.name ?? '';
  const dtVersion = (t as any)?.version ?? (t as any)?.tableVersion ?? null;

  const inst: ActionInstance = {
    id: this.makeId('act'),
    actionKey: 'runDecisionTable',
    label: dtName ? `Run Decision Table • ${dtName}` : 'Run Decision Table',
    params: {
      __dtId: { type: 'literal', dataType: 'string', value: dtId },
      __dtName: { type: 'literal', dataType: 'string', value: dtName },
      __dtVersion: (dtVersion != null) ? { type: 'literal', dataType: 'number', value: Number(dtVersion) } : null
    }
  };
  return inst;
}

dropToThenCanvas(ev: CdkDragDrop<any>): void {
  const d = ev.item.data as DragItem;
  if(!d) return;

  if(d.kind === 'decisionTable' && d.decisionTable) {
  const inst = this.makeRunDecisionTableAction(d.decisionTable);
  this.activeBranch.then.push(inst);
  this.syncJsonFromDesigner();
  return;
}

if (d.kind !== 'action' || !d.action) return;

const adef = d.action;
const inst: ActionInstance = {
  id: this.makeId('act'),
  actionKey: adef.key,
  label: adef.label,
  params: {}
};

// initialize params as null
for (const p of adef.params) {
  inst.params[p.fieldKey] = null;
}

this.activeBranch.then.push(inst);
this.syncJsonFromDesigner();
  }

removeAction(instId: string): void {
  this.activeBranch.then = this.activeBranch.then.filter(a => a.id !== instId);
  this.syncJsonFromDesigner();
}

actionDef(actionKey: string): ActionDef | undefined {
  return this.actions.find(a => a.key === actionKey);
}

dropActionParam(instId: string, paramFieldKey: string, ev: CdkDragDrop<any>): void {
  const inst = this.activeBranch.then.find(a => a.id === instId);
  if(!inst) return;

  const d = ev.item.data as DragItem;
  if(!d || (d.kind !== 'field' && d.kind !== 'function')) return;

inst.params[paramFieldKey] = this.dragItemToExpr(d);
this.syncJsonFromDesigner();
  }

clearActionParam(instId: string, paramFieldKey: string): void {
  const inst = this.activeBranch.then.find(a => a.id === instId);
  if(!inst) return;
  inst.params[paramFieldKey] = null;
  this.syncJsonFromDesigner();
}

setActionParamLiteral(instId: string, paramFieldKey: string, text: string, dt: DataType): void {
  const inst = this.activeBranch.then.find(a => a.id === instId);
  if(!inst) return;
  inst.params[paramFieldKey] = { type: 'literal', dataType: dt, value: this.parseLiteral(dt, text) };
  this.syncJsonFromDesigner();
}

// ============================================================
// JSON sync (designer -> JSON and JSON -> designer)
// ============================================================

onJsonFocus(): void {
  this.jsonUserEditing = true;
}

onJsonBlur(): void {
  // keep editing true; user must click Apply/Discard to avoid overwriting pasted JSON
}

discardJsonEdits(): void {
  this.jsonUserEditing = false;
  this.jsonError = '';
  if(this._lastStableJsonText) {
  this.jsonText = this._lastStableJsonText;
}
this.syncJsonFromDesigner();
  }


applyJsonToDesigner(): void {
  this.jsonError = '';
  const t = (this.jsonText || '').trim();

  if(!t) {
    this.designerMode = 'LADDER';
    this.loadedDecisionTable = null;
    this._dtBaseDoc = null;
    this.dtResponseMode = 'ROUTE';
    this.dtResponseOutputKey = null;
    this.decisionOutputsMeta = [];
    this.decisionOutputFields = [];
    this.branches = [this.makeIfBranch()];
    this.activeBranchIndex = 0;
    this.jsonUserEditing = false;
    this.syncJsonFromDesigner();
    return;
  }

    let obj: any = null;
  try {
    obj = JSON.parse(t);
  } catch(e: any) {
    this.jsonError = e?.message ?? 'Invalid JSON';
    return;
  }

    const parsed = this.parseAnyRuleJson(obj);
  if(!parsed.ok) {
  this.jsonError = parsed.error;
  return;
}

// DECISION_TABLE doc => show DT card + editable post-decision routing
if (parsed.doc.kind === 'DECISION_TABLE') {
  this.designerMode = 'DECISION_TABLE';
  this._dtBaseDoc = parsed.doc;

  this.loadedDecisionTable = {
    id: parsed.dtInfo?.id ?? '',
    name: parsed.dtInfo?.name ?? undefined,
    tableVersion: parsed.dtInfo?.tableVersion ?? undefined
  };

  const dtUi = parsed.doc.ui as any;

  // Decide usage mode:
  // - If postProcessing exists => ROUTE
  // - If postProcessing is absent => DIRECT (return outputs)
  const hasPostProcessing = !!(dtUi?.postProcessing && (dtUi.postProcessing.schema === 'rulesengine.uirule.v2' || dtUi.postProcessing.schema === 'rulesengine.uirule.v1'));
  const explicitMode = dtUi?.responseMode;
  this.dtResponseMode = (explicitMode === 'DIRECT' || explicitMode === 'ROUTE')
    ? explicitMode
    : (hasPostProcessing ? 'ROUTE' : 'DIRECT');

  this.dtResponseOutputKey = (dtUi?.responseOutputKey ?? null);

  // Decision outputs palette
  this.setDecisionOutputsFromDoc(parsed.doc);

  // Post-processing branches (ROUTE) OR Draft branches (DIRECT)
  const pickUiRule = (raw: any): UiRuleJsonV2 | null => {
    if (!raw) return null;
    if (raw.schema === 'rulesengine.uirule.v2') return raw as UiRuleJsonV2;
    if (raw.schema === 'rulesengine.uirule.v1') return this.upgradeV1ToV2(raw as UiRuleJsonV1);
    return null;
  };

  const ppV2 = pickUiRule(dtUi?.postProcessing);
  const draftV2 = pickUiRule(dtUi?.postProcessingDraft);

  if (this.dtResponseMode === 'ROUTE') {
    this.branches = this.fromUiRuleJson(ppV2 ?? draftV2 ?? this.toUiRuleJsonV2());
  } else {
    // DIRECT: routing is disabled at runtime, but we keep the draft in UI for easy toggling back.
    this.branches = this.fromUiRuleJson(draftV2 ?? ppV2 ?? this.toUiRuleJsonV2());
  }

  this.activeBranchIndex = 0;

  this.jsonUserEditing = false;
  this.syncJsonFromDesigner();
  return;
}

// LADDER doc
const ui = parsed.uiRule;
if (!ui) {
  this.jsonError = 'Missing LADDER ui rule JSON.';
  return;
}

this.designerMode = 'LADDER';
this.loadedDecisionTable = null;
this._dtBaseDoc = null;
this.dtResponseMode = 'ROUTE';
this.dtResponseOutputKey = null;
this.decisionOutputsMeta = [];
this.decisionOutputFields = [];

this.branches = this.fromUiRuleJson(ui);
this.activeBranchIndex = 0;
this.jsonUserEditing = false;
this.syncJsonFromDesigner();
  }



  private syncJsonFromDesigner(): void {
  if(this.jsonUserEditing) return;

  this.jsonError = '';

  // LADDER -> normal rule UI
  if(this.designerMode === 'LADDER') {
  const ui = this.toUiRuleJsonV2();
  const doc: RuleDocV1 = {
    schema: 'rulesengine.ruledoc.v1',
    version: 1,
    kind: 'LADDER',
    ui,
    meta: { source: 'RulesDesigner', generatedOn: new Date().toISOString() }
  };

  this.jsonText = JSON.stringify(doc, null, 2);
  this._lastStableJsonText = this.jsonText;
  return;
}

// DECISION_TABLE -> preserve DT engine + metadata, but allow postProcessing (routing) to be edited here
if (this.designerMode === 'DECISION_TABLE') {
  const base = this._dtBaseDoc ?? null;
  const baseUi = (base?.ui as any) ?? {};
  const dt = baseUi?.decisionTable ?? this.loadedDecisionTable ?? {};

  // Always keep a draft of routing in the UI so switching modes doesn't lose work.
  const postProcessingDraft = this.toUiRuleJsonV2();

  // ROUTE => include postProcessing (runtime routing)
  // DIRECT => omit postProcessing (runtime returns decision outputs)
  const postProcessing = (this.dtResponseMode === 'ROUTE') ? postProcessingDraft : undefined;

  const outputsFromMeta = (this.decisionOutputsMeta || []).map(o => ({ key: o.key, label: o.label, dataType: o.dataType }));
  const outputsFromUi = (Array.isArray(baseUi?.outputs) && baseUi.outputs.length) ? baseUi.outputs : [];
  const outputs = outputsFromMeta.length ? outputsFromMeta : outputsFromUi;

  const ui: DecisionTableUiModel = {
    schema: 'rulesengine.uidt.v1',
    version: 1,
    decisionTable: {
      id: dt?.id ?? this.loadedDecisionTable?.id ?? '',
      name: dt?.name ?? this.loadedDecisionTable?.name,
      tableVersion: dt?.tableVersion ?? this.loadedDecisionTable?.tableVersion,
      hitPolicy: dt?.hitPolicy ?? undefined,
      updatedOn: dt?.updatedOn ?? null
    },
    outputs: outputs.length ? outputs : undefined,
    responseMode: this.dtResponseMode ?? (postProcessing ? 'ROUTE' : 'DIRECT'),
    responseOutputKey: this.dtResponseOutputKey ?? null,
    postProcessing,
    postProcessingDraft
  };

  const doc: RuleDocV1 = {
    schema: 'rulesengine.ruledoc.v1',
    version: 1,
    kind: 'DECISION_TABLE',
    ui,
    engine: base?.engine ?? (base as any)?.engine,
    meta: { source: 'RulesDesigner', generatedOn: new Date().toISOString() }
  };

  this.jsonText = JSON.stringify(doc, null, 2);
  this._lastStableJsonText = this.jsonText;
  return;
}
  }



  private toUiRuleJsonV2(): UiRuleJsonV2 {
  // Collect DT references from actions for dependency discovery
  const dtRefs = new Map<string, { id: string; name?: string; tableVersion?: number }>();

  const branchesJson = this.branches.map(b => ({
    type: b.type,
    when: b.when ? this.whenGroupToJson(b.when) : undefined,
    then: (b.then || []).map(ai => {
      if (ai.actionKey === 'runDecisionTable') {
        const idExpr = (ai.params || {})['__dtId'] as any;
        const nameExpr = (ai.params || {})['__dtName'] as any;
        const verExpr = (ai.params || {})['__dtVersion'] as any;

        const idVal = (idExpr?.type === 'literal') ? String(idExpr.value ?? '') : '';
        const nameVal = (nameExpr?.type === 'literal') ? String(nameExpr.value ?? '') : undefined;
        const verVal = (verExpr?.type === 'literal' && verExpr.value != null) ? Number(verExpr.value) : undefined;

        if (idVal) dtRefs.set(idVal, { id: idVal, name: nameVal, tableVersion: verVal });
      }

      return {
        key: ai.actionKey,
        params: this.exprMapToJson(ai.params || {})
      };
    })
  }));

  const assets = dtRefs.size ? { decisionTables: Array.from(dtRefs.values()) } : undefined;

  return {
    schema: 'rulesengine.uirule.v2',
    version: 2,
    branches: branchesJson,
    assets
  };
}

  private fromUiRuleJson(obj: UiRuleJsonV1 | UiRuleJsonV2): Branch[] {
  const out: Branch[] = [];
  for (const b of (obj.branches || [])) {
    if (b.type === 'ELSE') {
      out.push({
        id: this.makeId('br'),
        type: 'ELSE',
        when: null,
        then: this.actionsFromJson(b.then || [])
      });
    } else {
      out.push({
        id: this.makeId('br'),
        type: b.type as any,
        when: b.when ? this.whenGroupFromJson(b.when) : this.makeEmptyGroup(),
        then: this.actionsFromJson(b.then || [])
      });
    }
  }
  return out.length ? out : [this.makeIfBranch()];
}
  //  }
  //  if (out.length === 0) out.push(this.makeIfBranch());
  //  return out;
  //}

  private whenGroupToJson(g: WhenGroupNode): any {
  return {
    op: g.op,
    children: (g.children || []).map(n => {
      if (n.nodeType === 'group') return this.whenGroupToJson(n);
      return {
        left: this.exprToJson(n.left),
        operator: n.operator,
        right: this.exprToJson(n.right)
      };
    })
  };
}

  private whenGroupFromJson(raw: any): WhenGroupNode {
  const g = this.makeEmptyGroup();
  if (!raw) return g;

  g.op = (raw.op === 'OR' ? 'OR' : 'AND');
  const children = Array.isArray(raw.children) ? raw.children : [];
  for (const c of children) {
    if (c && Array.isArray(c.children)) {
      g.children.push(this.whenGroupFromJson(c));
    } else {
      const cond: WhenConditionNode = this.makeEmptyCondition();
      cond.left = this.exprFromJson(c?.left);
      cond.operator = c?.operator ?? null;
      cond.right = this.exprFromJson(c?.right);
      g.children.push(cond);
    }
  }
  return g;
}

  private actionsFromJson(rawThen: any[]): ActionInstance[] {
  const out: ActionInstance[] = [];
  for (const a of (rawThen || [])) {
    const key = a?.key;
    if (!key) continue;

    const def = this.actionDef(key);
    const inst: ActionInstance = {
      id: this.makeId('act'),
      actionKey: key,
      label: def?.label ?? key,
      params: {}
    };

    // keep whatever is in json params
    const params = a?.params ?? {};
    for (const pk of Object.keys(params)) {
      inst.params[pk] = this.exprFromJson(params[pk]);
    }

    // ensure any missing params exist as null (for UI)
    if (def) {
      for (const p of def.params) {
        if (!(p.fieldKey in inst.params)) inst.params[p.fieldKey] = null;
      }
    }

    out.push(inst);
  }
  return out;
}

  private exprToJson(expr: Expr | null): any {
  if (!expr) return null;
  if (expr.type === 'field') return { type: 'field', key: expr.fieldKey };
  if (expr.type === 'literal') return { type: 'literal', dataType: expr.dataType, value: expr.value };
  if (expr.type === 'function') {
    const args: any = {};
    for (const k of Object.keys(expr.args || {})) {
      args[k] = this.exprToJson(expr.args[k]);
    }
    return { type: 'function', key: expr.key, args };
  }
  return null;
}

  private exprFromJson(raw: any): Expr | null {
  if (!raw) return null;
  if (raw.type === 'field') {
    const fk = String(raw.key || '');
    const f = this.fields.find(x => x.key === fk);
    return {
      type: 'field',
      fieldKey: fk,
      label: f?.label ?? fk,
      dataType: f?.dataType ?? 'string'
    };
  }
  if (raw.type === 'literal') {
    return {
      type: 'literal',
      dataType: (raw.dataType as DataType) ?? 'string',
      value: raw.value
    };
  }
  if (raw.type === 'function') {
    const fnKey = String(raw.key || '');
    const def = this.functions.find(x => x.key === fnKey);
    const args: Record<string, Expr | null> = {};
    const rawArgs = raw.args ?? {};
    for (const k of Object.keys(rawArgs)) {
      args[k] = this.exprFromJson(rawArgs[k]);
    }
    // ensure declared params exist
    if (def) {
      for (const p of def.params) {
        if (!(p.name in args)) args[p.name] = null;
      }
    }
    return {
      type: 'function',
      key: fnKey,
      label: def?.label ?? fnKey,
      returnType: def?.returnType ?? 'number',
      args
    };
  }
  return null;
}

  private exprMapToJson(m: Record<string, Expr | null>): any {
  const out: any = {};
  for (const k of Object.keys(m || {})) out[k] = this.exprToJson(m[k]);
  return out;
}

// ============================================================
// Display helpers (avoid template union-type errors)
// ============================================================

exprLabel(expr: Expr | null | undefined): string {
  if (!expr) return '';
  if (expr.type === 'field') return expr.label || expr.fieldKey;
  if (expr.type === 'literal') return String(expr.value ?? '');
  if (expr.type === 'function') return `${expr.label}(${Object.keys(expr.args || {}).join(', ')})`;
  return '';
}

literalText(expr: Expr | null | undefined): string {
  if (!expr) return '';
  return expr.type === 'literal' ? String(expr.value ?? '') : '';
}

exprDataType(expr: Expr | null | undefined): DataType | null {
  if (!expr) return null;
  if (expr.type === 'field') return expr.dataType;
  if (expr.type === 'literal') return expr.dataType;
  if (expr.type === 'function') return expr.returnType;
  return null;
}


// ============================================================
// Expression autocomplete (Field/Function search for literal inputs)
// ============================================================

condRightKey(condId: string): string {
  return `condRight:${condId}`;
}

actionParamKey(instId: string, paramKey: string): string {
  return `actParam:${instId}:${paramKey}`;
}

isExprAutoOpen(key: string): boolean {
  return this.exprAuto.open && this.exprAuto.key === key;
}

openCondRightAutocomplete(condId: string, currentText: string): void {
  const c = this.findCondition(this.activeBranch.when, condId);
  const expectedType = (this.exprDataType(c?.left) ?? 'string') as DataType;
  const key = this.condRightKey(condId);

  this.exprAuto.open = true;
  this.exprAuto.key = key;
  this.exprAuto.query = (currentText ?? '').trim();
  this.exprAuto.target = { kind: 'condRight', condId, expectedType };
  this.exprAuto.items = this.buildExprAutoItems(this.exprAuto.query, expectedType);
}

openActionParamAutocomplete(instId: string, paramKey: string, expectedType: DataType, currentText: string): void {
  const key = this.actionParamKey(instId, paramKey);

  this.exprAuto.open = true;
  this.exprAuto.key = key;
  this.exprAuto.query = (currentText ?? '').trim();
  this.exprAuto.target = { kind: 'actionParam', instId, paramKey, expectedType };
  this.exprAuto.items = this.buildExprAutoItems(this.exprAuto.query, expectedType);
}

updateExprAutoQuery(key: string, query: string): void {
  if(!this.exprAuto.open || this.exprAuto.key !== key) return;

  const t = this.exprAuto.target;
  const expectedType = t?.expectedType ?? null;

  this.exprAuto.query = (query ?? '').trim();
  this.exprAuto.items = this.buildExprAutoItems(this.exprAuto.query, expectedType);
}

applyExprAuto(it: ExprAutoItem): void {
  const t = this.exprAuto.target;
  if(!t) return;

  if(t.kind === 'condRight') {
  const c = this.findCondition(this.activeBranch.when, t.condId);
  if (!c) return;
  c.right = this.dragItemToExpr(it.drag);
  this.syncJsonFromDesigner();
  this.closeExprAutocomplete();
  return;
}

if (t.kind === 'actionParam') {
  const inst = this.activeBranch.then.find(a => a.id === t.instId);
  if (!inst) return;
  inst.params[t.paramKey] = this.dragItemToExpr(it.drag);
  this.syncJsonFromDesigner();
  this.closeExprAutocomplete();
}
  }

closeExprAutocomplete(): void {
  this.exprAuto.open = false;
  this.exprAuto.key = '';
  this.exprAuto.query = '';
  this.exprAuto.items = [];
  this.exprAuto.target = null;
}

onExprAutoKeydown(ev: KeyboardEvent): void {
  if(ev.key === 'Escape') {
  ev.stopPropagation();
  this.closeExprAutocomplete();
}
  }

@HostListener('document:click')
onDocClick(): void {
  // Clicking outside closes the panel
  this.closeExprAutocomplete();
}

  private buildExprAutoItems(query: string, expectedType: DataType | null): ExprAutoItem[] {
  const q = (query ?? '').toLowerCase().trim();

  const items: ExprAutoItem[] = [];

  const fieldPool: FieldDef[] = [
    ...(this.fields || []),
    ...((this.designerMode === 'DECISION_TABLE') ? (this.decisionOutputFields || []) : [])
  ];

  for (const f of fieldPool) {
    const hay = `${f.label} ${f.key} ${f.module ?? ''} ${f.dataset ?? ''} ${f.path ?? ''}`.toLowerCase();
    if (q && !hay.includes(q)) continue;

    items.push({
      kind: 'field',
      label: f.label || f.key,
      meta: `${f.key} • ${f.dataType}`,
      dataType: f.dataType,
      drag: { kind: 'field', field: f }
    });
  }

  for (const fn of this.functions || []) {
    const hay = `${fn.label} ${fn.key}`.toLowerCase();
    if (q && !hay.includes(q)) continue;

    items.push({
      kind: 'function',
      label: fn.label || fn.key,
      meta: `${fn.key} • returns ${fn.returnType}`,
      dataType: fn.returnType,
      drag: { kind: 'function', fn }
    });
  }

  // Sort: type match first, then prefix match, then alpha
  const score = (it: ExprAutoItem): number => {
    let s = 0;
    if (expectedType && it.dataType === expectedType) s += 100;

    if (q) {
      const lab = it.label.toLowerCase();
      if (lab.startsWith(q)) s += 20;
      if (lab.includes(q)) s += 10;
    } else {
      // when empty query: prefer fields first
      if (it.kind === 'field') s += 5;
    }
    return s;
  };

  items.sort((a, b) => score(b) - score(a) || a.label.localeCompare(b.label));

  // keep it small / fast
  return items.slice(0, 20);
}

  // ============================================================
  // Build action defs from your sample json + add generic assignment
  // ============================================================

  private buildActions(): void {
  // Based on your attached “alert and activity action json.json”
  // We create two action defs: memberAlert + addActivity, and one generic setField action.

  const memberAlert: ActionDef = {
    key: 'memberAlert',
    label: 'Create Member Alert',
    params: [
      { fieldKey: 'CM.ALERT.ALERTNAME', fieldName: 'Alert Name', dataType: 'string', uiType: 'text', required: true },
      { fieldKey: 'CM.ALERT.ALERTDATE', fieldName: 'Alert Date', dataType: 'date', uiType: 'date', required: true },
      { fieldKey: 'CM.ALERT.ALERTSOURCE', fieldName: 'Alert Source', dataType: 'string', uiType: 'text', required: false },
      { fieldKey: 'CM.ALERT.ALERTTYPE', fieldName: 'Alert Type', dataType: 'string', uiType: 'select', required: false }
    ]
  };

  const addActivity: ActionDef = {
    key: 'addActivity',
    label: 'Add Activity',
    params: [
      { fieldKey: 'CM.ACTIVITY.ACTIVITYTYPENAME', fieldName: 'Activity Type', dataType: 'string', uiType: 'select', required: true },
      { fieldKey: 'CM.ACTIVITY.ACTIVITYPRIORITY', fieldName: 'Activity Priority', dataType: 'string', uiType: 'select' },
      { fieldKey: 'CM.ACTIVITY.CONTACTWITH', fieldName: 'Contact With', dataType: 'string', uiType: 'select' },
      { fieldKey: 'CM.ACTIVITY.CONTACTMODE', fieldName: 'Contact Mode', dataType: 'string', uiType: 'select' },
      { fieldKey: 'CM.ACTIVITY.ACTIVITYSCHEDULEDDATETIME', fieldName: 'Activity Scheduled DateTime', dataType: 'datetime', uiType: 'datetime' },
      { fieldKey: 'CM.ACTIVITY.ACTIVITYDUEDATE', fieldName: 'Activity Due Date', dataType: 'date', uiType: 'date' },
      { fieldKey: 'CM.ACTIVITY.ACTIVITYCOMMENTS', fieldName: 'Activity Comments', dataType: 'string', uiType: 'textarea' },
      { fieldKey: 'CM.ACTIVITY.ASSIGNTO', fieldName: 'Assign To', dataType: 'string', uiType: 'select' },
      { fieldKey: 'CM.ACTIVITY.WORKGROUP', fieldName: 'Workgroup', dataType: 'string', uiType: 'select' },
      { fieldKey: 'CM.ACTIVITY.WORKBASKET', fieldName: 'Workbasket', dataType: 'string', uiType: 'select' }
    ]
  };

  const setField: ActionDef = {
    key: 'setField',
    label: 'Set Field (Assignment)',
    params: [
      { fieldKey: 'targetField', fieldName: 'Target Field Key', dataType: 'string', uiType: 'text', required: true },
      { fieldKey: 'value', fieldName: 'Value', dataType: 'string', uiType: 'text', required: true }
    ]
  };

  const runDecisionTable: ActionDef = {
    key: 'runDecisionTable',
    label: 'Run Decision Table',
    params: [
      { fieldKey: '__dtId', fieldName: 'Decision Table ID', dataType: 'string', uiType: 'hidden', required: true },
      { fieldKey: '__dtName', fieldName: 'Decision Table Name', dataType: 'string', uiType: 'hidden' },
      { fieldKey: '__dtVersion', fieldName: 'Decision Table Version', dataType: 'number', uiType: 'hidden' }
    ]
  };

  this.actions = [memberAlert, addActivity, setField, runDecisionTable];
}

  // ============================================================
  // Fields parsing (YOUR FIX): rows[] contains ruleDataFieldJson
  // ============================================================

  private buildFieldsFromApiRows(rows: any[]): FieldDef[] {
  const out: FieldDef[] = [];
  const seen = new Set<string>();

  const normalizeType = (t: any): DataType => {
    const v = String(t || '').toLowerCase();
    if (v === 'datetime' || v === 'datetime-local' || v === 'datatime-local') return 'datetime';
    if (v === 'date') return 'date';
    if (v === 'number' || v === 'int' || v === 'integer' || v === 'float' || v === 'double') return 'number';
    if (v === 'boolean' || v === 'bool') return 'boolean';
    return 'string';
  };

  const pushField = (f: any, moduleKey?: string, datasetKey?: string) => {
    const key = f?.fieldKey;
    if (!key || seen.has(key)) return;

    // optionally hide disabled
    if (f?.isEnabled === false) return;

    seen.add(key);
    out.push({
      key: String(key),
      label: String(f?.fieldName || key),
      dataType: normalizeType(f?.valueType),
      module: String(moduleKey || key.split('.')[0] || ''),
      dataset: String(datasetKey || key.split('.').slice(0, 2).join('.') || ''),
      path: String(f?.path || '')
    });
  };

  for (const row of (rows || [])) {
    const raw = row?.ruleDataFieldJson ?? row?.ruledatafieldjson ?? row?.json ?? null;
    if (!raw) continue;

    let obj: any = raw;
    if (typeof obj === 'string') {
      try { obj = JSON.parse(obj); } catch { continue; }
    }

    // Your sample: root has moduleKey/moduleName and datasets:[ {datasetKey,dataFields:[...]} ]
    const moduleKey = obj?.moduleKey || row?.moduleName || row?.module || '';

    const datasets = obj?.datasets;
    if (Array.isArray(datasets)) {
      for (const ds of datasets) {
        const datasetKey = ds?.datasetKey || ds?.datasetName || '';
        const dfs = ds?.dataFields;
        if (Array.isArray(dfs)) {
          for (const f of dfs) pushField(f, moduleKey, datasetKey);
        }
      }
    }

    // fallback: if obj itself has dataFields
    if (Array.isArray(obj?.dataFields)) {
      for (const f of obj.dataFields) pushField(f, moduleKey, obj?.datasetKey || '');
    }
  }

  out.sort((a, b) => (a.label || '').localeCompare(b.label || ''));
  return out;
}

// ============================================================
// Save/back (keep your current behavior; send JSON string)
// ============================================================

back(): void {
  this.router.navigate(['configuration/rulesengine/rules']);
}

save(): void {
  this.error = '';
  this.successMsg = '';

  if(!this.rule) {
  this.error = 'No rule loaded.';
  return;
}

const ruleJson = this.jsonText;

const req: any = {
  name: (this.name ?? '').trim(),
  ruleGroupId: Number(this.ruleGroupId) || 0,
  ruleType: this.ruleType,
  description: (this.description ?? '').trim(),
  activeFlag: this.activeFlag ?? true,
  ruleJson
};

if (!req.name || !req.ruleGroupId) {
  this.error = 'Rule Name and Rule Group are required.';
  return;
}

this.saving = true;
this.error = '';

this.svc.updateRule(this.rule.id, req).subscribe({
  next: () => {
    this.successMsg = 'Rule saved successfully.';
    this.saving = false;

    setTimeout(() => {
      this.successMsg = '';
    }, 2000);
    //this.back();
  },
  error: (err) => {
    console.error(err);
    this.error = err?.error?.message || 'Save failed.';
    this.successMsg = '';
    this.saving = false;
  }
});
  }


openDecisionTableInBuilder(): void {
  // If your app already has a route to DT builder, wire it here.
  // Keeping this safe: no-op if id is missing.
  const id = this.loadedDecisionTable?.id;
  if(!id) return;

  // Example route (adjust to your app):
  // this.router.navigate(['configuration/rulesengine/decisiontables', id]);
  this.router.navigate(['configuration/rulesengine/decisiontablebuilder', id]);
}

  private setDecisionOutputsFromDoc(doc: RuleDocV1): void {
  const ui: any = doc?.ui ?? {};
  const outputs = Array.isArray(ui?.outputs) ? ui.outputs : null;

  const meta: Array<{ key: string; label ?: string; dataType ?: DataType }> =[];

if (outputs && outputs.length) {
  for (const o of outputs) {
    const k = String(o?.key ?? '').trim();
    if (!k) continue;
    meta.push({
      key: k,
      label: String(o?.label ?? k).trim(),
      dataType: this.normalizeDataType(o?.dataType)
    });
  }
} else {
  // fallback infer from engine.rules[*].then keys
  const engine = (doc as any)?.engine;
  const rules = Array.isArray(engine?.rules) ? engine.rules : [];
  const keys = new Set<string>();
  for (const r of rules) {
    const then = r?.then;
    if (then && typeof then === 'object') {
      for (const k of Object.keys(then)) keys.add(k);
    }
  }
  for (const k of Array.from(keys.values())) {
    meta.push({ key: k, label: k, dataType: 'string' });
  }
}

// Store meta + build FieldDefs as Decision.<key>
this.decisionOutputsMeta = meta;
this.rebuildDecisionOutputFields();
  }

  private normalizeDataType(raw: any): DataType {
  const v = String(raw ?? '').toLowerCase();
  if (v === 'number') return 'number';
  if (v === 'boolean') return 'boolean';
  if (v === 'date') return 'date';
  if (v === 'datetime') return 'datetime';
  return 'string';
}

  // ============================================================
  // Internals
  // ============================================================


  private parseAnyRuleJson(obj: any): {
  ok: boolean;
  error: string;
  doc: RuleDocV1;
  uiRule ?: UiRuleJsonV1 | UiRuleJsonV2;
  dtInfo ?: { id: string; name?: string; tableVersion?: number };
} {
  // 1) New wrapper doc
  if (obj?.schema === 'rulesengine.ruledoc.v1') {
    const doc = obj as RuleDocV1;

    if (doc.kind === 'LADDER') {
      const ui = doc.ui as any;
      if (ui?.schema === 'rulesengine.uirule.v2' || ui?.schema === 'rulesengine.uirule.v1') {
        return { ok: true, error: '', doc, uiRule: ui as any };
      }
      return { ok: false, error: 'RuleDoc LADDER ui is not a supported schema.', doc };
    }

    if (doc.kind === 'DECISION_TABLE') {
      const ui = doc.ui as any;
      const dt = ui?.decisionTable ?? ui;
      const id = dt?.id ?? '';
      if (!id) return { ok: false, error: 'RuleDoc DECISION_TABLE missing decisionTable.id', doc };
      return { ok: true, error: '', doc, dtInfo: { id, name: dt?.name ?? undefined, tableVersion: dt?.tableVersion ?? undefined } };
    }

    return { ok: false, error: 'Unknown RuleDoc.kind', doc };
  }

  // 2) Legacy UI rule v1/v2 (no wrapper)
  if (obj?.schema === 'rulesengine.uirule.v1' || obj?.schema === 'rulesengine.uirule.v2') {
    const ui = obj as any;
    const uiV2 = (ui.schema === 'rulesengine.uirule.v2') ? ui as UiRuleJsonV2 : this.upgradeV1ToV2(ui as UiRuleJsonV1);

    const doc: RuleDocV1 = {
      schema: 'rulesengine.ruledoc.v1',
      version: 1,
      kind: 'LADDER',
      ui: uiV2,
      meta: { source: 'RulesDesigner', generatedOn: new Date().toISOString() }
    };

    return { ok: true, error: '', doc, uiRule: ui };
  }

  // 3) Legacy DecisionTable runtime JSON (no wrapper)
  if (obj?.engine === 'DecisionTable') {
    const dt = obj?.decisionTable ?? {};
    const id = dt?.id ?? '';
    const name = dt?.name ?? undefined;
    const tableVersion = dt?.tableVersion ?? undefined;

    // Infer outputs from compiled rules 'then' keys (best-effort)
    const keys = new Set<string>();
    const rules = Array.isArray(obj?.rules) ? obj.rules : [];
    for (const r of rules) {
      const then = r?.then;
      if (then && typeof then === 'object') {
        for (const k of Object.keys(then)) keys.add(k);
      }
    }
    const outputs = Array.from(keys.values()).map(k => ({ key: k, label: k, dataType: 'string' as DataType }));

    const ui: DecisionTableUiModel = {
      schema: 'rulesengine.uidt.v1',
      version: 1,
      decisionTable: { id, name, tableVersion, hitPolicy: dt?.hitPolicy, updatedOn: dt?.updatedOn ?? null },
      outputs,
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
      engine: obj,
      meta: { source: 'RulesDesigner', generatedOn: new Date().toISOString() }
    };

    if (!id) return { ok: false, error: 'DecisionTable json missing decisionTable.id', doc };
    return { ok: true, error: '', doc, dtInfo: { id, name, tableVersion } };
  }

  // Not recognized
  const empty: RuleDocV1 = { schema: 'rulesengine.ruledoc.v1', version: 1, kind: 'LADDER', ui: this.toUiRuleJsonV2() };
  return { ok: false, error: 'Unrecognized rule JSON format.', doc: empty };
}

  private upgradeV1ToV2(v1: UiRuleJsonV1): UiRuleJsonV2 {
  return {
    schema: 'rulesengine.uirule.v2',
    version: 2,
    branches: (v1.branches || []).map(b => ({ type: b.type, when: b.when, then: b.then }))
  };
}

  private tryLoadFromRuleJson(ruleJson: string | null): void {
  if(!ruleJson || !ruleJson.trim()) return;

let obj: any = null;
try {
  obj = JSON.parse(ruleJson);
} catch {
  return;
}

const parsed = this.parseAnyRuleJson(obj);
if (!parsed.ok) {
  // Not recognized -> just show what we got
  this.jsonText = JSON.stringify(obj, null, 2);
  this._lastStableJsonText = this.jsonText;
  return;
}

if (parsed.doc.kind === 'DECISION_TABLE') {
  this.designerMode = 'DECISION_TABLE';
  this._dtBaseDoc = parsed.doc;

  this.loadedDecisionTable = {
    id: parsed.dtInfo?.id ?? '',
    name: parsed.dtInfo?.name ?? undefined,
    tableVersion: parsed.dtInfo?.tableVersion ?? undefined
  };

  const dtUi = parsed.doc.ui as any;

  const hasPostProcessing = !!(dtUi?.postProcessing && (dtUi.postProcessing.schema === 'rulesengine.uirule.v2' || dtUi.postProcessing.schema === 'rulesengine.uirule.v1'));
  const explicitMode = dtUi?.responseMode;
  this.dtResponseMode = (explicitMode === 'DIRECT' || explicitMode === 'ROUTE')
    ? explicitMode
    : (hasPostProcessing ? 'ROUTE' : 'DIRECT');

  this.dtResponseOutputKey = (dtUi?.responseOutputKey ?? null);

  this.setDecisionOutputsFromDoc(parsed.doc);

  const pickUiRule = (raw: any): UiRuleJsonV2 | null => {
    if (!raw) return null;
    if (raw.schema === 'rulesengine.uirule.v2') return raw as UiRuleJsonV2;
    if (raw.schema === 'rulesengine.uirule.v1') return this.upgradeV1ToV2(raw as UiRuleJsonV1);
    return null;
  };

  const ppV2 = pickUiRule(dtUi?.postProcessing);
  const draftV2 = pickUiRule(dtUi?.postProcessingDraft);

  if (this.dtResponseMode === 'ROUTE') {
    this.branches = this.fromUiRuleJson(ppV2 ?? draftV2 ?? this.toUiRuleJsonV2());
  } else {
    this.branches = this.fromUiRuleJson(draftV2 ?? ppV2 ?? this.toUiRuleJsonV2());
  }

  this.activeBranchIndex = 0;

  this.jsonUserEditing = false;
  this.syncJsonFromDesigner();
  return;
}

// LADDER
this.designerMode = 'LADDER';
this.loadedDecisionTable = null;
this._dtBaseDoc = null;
this.dtResponseMode = 'ROUTE';
this.dtResponseOutputKey = null;
this.decisionOutputsMeta = [];
this.decisionOutputFields = [];

if (parsed.uiRule) {
  this.branches = this.fromUiRuleJson(parsed.uiRule);
  this.activeBranchIndex = 0;
  this.jsonUserEditing = false;
  this.syncJsonFromDesigner();
} else {
  this.jsonText = JSON.stringify(parsed.doc, null, 2);
  this._lastStableJsonText = this.jsonText;
}
  }

  private makeId(prefix: string): string {
  this._idSeq++;
  return `${prefix}_${Date.now()}_${this._idSeq}`;
}

  private makeEmptyGroup(): WhenGroupNode {
  return { nodeType: 'group', id: this.makeId('grp'), op: 'AND', children: [] };
}

  private makeEmptyCondition(): WhenConditionNode {
  return { nodeType: 'condition', id: this.makeId('cnd'), left: null, operator: null, right: null };
}

  private findGroupById(root: WhenGroupNode | null, id: string): WhenGroupNode | null {
  if (!root) return null;
  if (root.id === id) return root;
  for (const ch of root.children) {
    if (ch.nodeType === 'group') {
      const g = this.findGroupById(ch, id);
      if (g) return g;
    }
  }
  return null;
}

  private findCondition(root: WhenGroupNode | null, condId: string): WhenConditionNode | null {
  if (!root) return null;
  for (const ch of root.children) {
    if (ch.nodeType === 'condition' && ch.id === condId) return ch;
    if (ch.nodeType === 'group') {
      const f = this.findCondition(ch, condId);
      if (f) return f;
    }
  }
  return null;
}

  private dragItemToExpr(d: DragItem): Expr {
  if (d.kind === 'field' && d.field) {
    return {
      type: 'field',
      fieldKey: d.field.key,
      label: d.field.label,
      dataType: d.field.dataType
    };
  }
  if (d.kind === 'function' && d.fn) {
    const args: Record<string, Expr | null> = {};
    for (const p of d.fn.params) args[p.name] = null;
    return {
      type: 'function',
      key: d.fn.key,
      label: d.fn.label,
      returnType: d.fn.returnType,
      args
    };
  }
  // fallback literal
  return { type: 'literal', dataType: 'string', value: '' };
}

  private parseLiteral(dt: DataType, text: string): any {
  if (dt === 'number') {
    const n = Number(text);
    return Number.isFinite(n) ? n : null;
  }
  if (dt === 'boolean') {
    const v = String(text || '').toLowerCase();
    if (v === 'true' || v === '1' || v === 'yes') return true;
    if (v === 'false' || v === '0' || v === 'no') return false;
    return null;
  }
  // date/datetime keep string (ISO or user typed)
  return text;
}


functionsLoading = false;

  // keep any built-in ones if you want
  private builtinFunctions: FuncDef[] = [];


refreshFunctions(): void {
  this.functionsLoading = true;

  this.svc.listRuleDataFunctions().pipe(
    map(list => (list ?? []).filter(x => x.activeFlag)),
    switchMap(list =>
      list.length ? forkJoin(list.map(x => this.svc.getRuleDataFunction(x.id))) : of([])
    ),
    map((models: RuleDataFunctionModel[]) =>
      (models ?? [])
        .map((m: RuleDataFunctionModel) => this.mapRuleDataFunctionToFuncDef(m))
        .filter(Boolean) as FuncDef[]
    )
  ).subscribe({
    next: (defs: FuncDef[]) => {
      const merged = [...this.builtinFunctions, ...defs];
      merged.sort((a, b) => (a.label || '').localeCompare(b.label || ''));
      this.functions = merged;
      this.functionsLoading = false;
      this.rebindFunctionExprMetadata();
    },
    error: (err: any) => {
      console.error('Failed to load rule data functions', err);
      this.functionsLoading = false;
    }
  });
}


  private mapRuleDataFunctionToFuncDef(m: RuleDataFunctionModel): FuncDef | null {
  const raw = m.ruleDataFunctionJson;
  const json = this.parseMaybeJson(raw);

  // supports both shapes:
  // { returnType, parameters:[...] }
  // OR { signature:{ returnType, args:[...] } }
  const sig = json?.signature ?? json ?? {};

  const returnType = this.normalizeDataType(sig.returnType ?? json?.returnType ?? 'string');
  const paramsSrc = sig.args ?? json?.parameters ?? [];

  const params: FuncParamDef[] = (Array.isArray(paramsSrc) ? paramsSrc : []).map((p: any) => ({
    name: (p?.name ?? '').toString(),
    label: (p?.label ?? p?.name ?? '').toString(),
    dataType: this.normalizeDataType(p?.dataType ?? p?.type ?? 'string'),
    required: !!p?.required
  })).filter(p => !!p.name);

  return {
    key: String(m.ruleDataFunctionId),              // stable key => id
    label: String(m.ruleDataFunctionName ?? m.ruleDataFunctionId),
    returnType,
    params
  };
}

  private parseMaybeJson(v: any): any {
  if (v == null) return {};
  if (typeof v === 'object') return v;
  if (typeof v === 'string') {
    try { return JSON.parse(v); } catch { return {}; }
  }
  return {};
}

  /**
   * If a rule JSON was loaded before functions arrived,
   * existing expr labels may still show the raw key.
   * This updates function expr metadata in-place.
   */
  private rebindFunctionExprMetadata(): void {
  const visitExpr = (e: any) => {
    if (!e) return;
    if (e.type === 'function') {
      const def = this.functions.find(f => f.key === e.key);
      if (def) {
        e.label = def.label;
        e.returnType = def.returnType;
        const nextArgs: Record<string, any> = {};
        for (const p of def.params) nextArgs[p.name] = e.args?.[p.name] ?? null;
        e.args = nextArgs;
      }
      Object.values(e.args ?? {}).forEach(visitExpr);
    }
  };

  for(const b of this.branches ?? []) {
  const walkGroup = (g: any) => {
    for (const ch of g.children ?? []) {
      if (ch.nodeType === 'condition') {
        visitExpr(ch.left);
        visitExpr(ch.right);
      } else if (ch.nodeType === 'group') {
        walkGroup(ch);
      }
    }
  };

  if (b.when) walkGroup(b.when);
  for (const a of b.then ?? []) {
    for (const k of Object.keys(a.params ?? {})) visitExpr(a.params[k]);
  }
}
  }

// ---- Right JSON panel UI (expand/collapse)
jsonPanelCollapsed = true;
rightPanelTab: 'json' | 'settings' = 'settings';

toggleJsonPanel(): void {
  this.jsonPanelCollapsed = !this.jsonPanelCollapsed;
}



}
