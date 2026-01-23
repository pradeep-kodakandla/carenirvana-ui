import { Component, HostListener, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CdkDragDrop, CdkDropList, CdkDrag, CdkDragMove } from '@angular/cdk/drag-drop';
import { forkJoin } from 'rxjs';
import {
  RulesengineService,
  RuleGroupModel,
  RuleModel,
  RuleType
} from 'src/app/service/rulesengine.service';
import { UiSmartOption } from 'src/app/shared/ui/uismartdropdown/uismartdropdown.component';


type DataType = 'string' | 'number' | 'boolean' | 'date' | 'datetime';

type DragKind = 'field' | 'function' | 'action';
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

interface DragItem {
  kind: DragKind;
  field?: FieldDef;
  fn?: FuncDef;
  action?: ActionDef;
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

  // ---- Left palette: search
  fieldSearch = '';
  functionSearch = '';
  actionSearch = '';

  // top-5 default view
  showAllFields = false;
  showAllFunctions = false;
  showAllActions = false;


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

  // ---- Ladder
  branches: Branch[] = [];
  activeBranchIndex = 0;

  // ---- Right JSON
  jsonText = '';
  jsonError = '';
  jsonUserEditing = false;

  // ---- IDs for drop lists (stable)
  readonly fieldsPaletteId = 'fieldsPalette';
  readonly functionsPaletteId = 'functionsPalette';
  readonly actionsPaletteId = 'actionsPalette';
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
    return d?.kind === 'action';
  };

  canDropToExpr = (drag: CdkDrag<any>, _drop: CdkDropList<any>) => {
    const d = drag.data as DragItem;
    return d?.kind === 'field' || d?.kind === 'function';
  };

  // ============================================================
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
    if (hasElse) return;

    this.branches.push({
      id: this.makeId('br'),
      type: 'ELSE',
      when: null,
      then: []
    });

    this.syncJsonFromDesigner();
  }

  addElseIf(): void {
    // Insert before ELSE (if exists), otherwise append
    const elseIdx = this.branches.findIndex(b => b.type === 'ELSE');
    const insertAt = elseIdx >= 0 ? elseIdx : this.branches.length;
    this.branches.splice(insertAt, 0, this.makeElseIfBranch());
    this.activeBranchIndex = insertAt;
    this.syncJsonFromDesigner();
  }

  setActiveBranch(i: number): void {
    this.activeBranchIndex = i;
  }

  // ============================================================
  // WHEN canvas operations
  // ============================================================

  toggleActiveGroupOp(): void {
    const g = this.activeBranch.when;
    if (!g) return;
    g.op = g.op === 'AND' ? 'OR' : 'AND';
    this.syncJsonFromDesigner();
  }

  isActiveGroupEmpty(): boolean {
    const g = this.activeBranch.when;
    return !g || g.children.length === 0;
  }

  addEmptyConditionToActiveGroup(): void {
    const g = this.activeBranch.when;
    if (!g) return;
    g.children.push(this.makeEmptyCondition());
    this.syncJsonFromDesigner();
  }

  // Drop onto the main WHEN canvas: create a new condition with left prefilled
  dropToActiveWhenCanvas(ev: CdkDragDrop<any>): void {
    const g = this.activeBranch.when;
    if (!g) return;

    const d = ev.item.data as DragItem;
    if (!d || (d.kind !== 'field' && d.kind !== 'function')) return;

    const cond = this.makeEmptyCondition();
    cond.left = this.dragItemToExpr(d);
    g.children.push(cond);

    this.syncJsonFromDesigner();
  }

  removeWhenNode(groupId: string, nodeId: string): void {
    const g = this.findGroupById(this.activeBranch.when, groupId);
    if (!g) return;

    g.children = g.children.filter(n => n.id !== nodeId);
    this.syncJsonFromDesigner();
  }

  addGroup(parentGroupId: string): void {
    const g = this.findGroupById(this.activeBranch.when, parentGroupId);
    if (!g) return;

    g.children.push(this.makeEmptyGroup());
    this.syncJsonFromDesigner();
  }

  addCondition(parentGroupId: string): void {
    const g = this.findGroupById(this.activeBranch.when, parentGroupId);
    if (!g) return;

    g.children.push(this.makeEmptyCondition());
    this.syncJsonFromDesigner();
  }

  toggleGroupOp(groupId: string): void {
    const g = this.findGroupById(this.activeBranch.when, groupId);
    if (!g) return;

    g.op = g.op === 'AND' ? 'OR' : 'AND';
    this.syncJsonFromDesigner();
  }

  // Drop into a group (nested groups)
  dropToGroup(groupId: string, ev: CdkDragDrop<any>): void {
    const g = this.findGroupById(this.activeBranch.when, groupId);
    if (!g) return;

    const d = ev.item.data as DragItem;
    if (!d || (d.kind !== 'field' && d.kind !== 'function')) return;

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
    if (!c) return;

    const d = ev.item.data as DragItem;
    if (!d || (d.kind !== 'field' && d.kind !== 'function')) return;

    c.left = this.dragItemToExpr(d);
    c.operator = null;
    c.right = null;
    this.syncJsonFromDesigner();
  }

  // Drop into condition RIGHT slot
  dropCondRight(condId: string, ev: CdkDragDrop<any>): void {
    const c = this.findCondition(this.activeBranch.when, condId);
    if (!c) return;

    const d = ev.item.data as DragItem;
    if (!d || (d.kind !== 'field' && d.kind !== 'function')) return;

    c.right = this.dragItemToExpr(d);
    this.syncJsonFromDesigner();
  }

  clearCondLeft(condId: string): void {
    const c = this.findCondition(this.activeBranch.when, condId);
    if (!c) return;

    c.left = null;
    c.operator = null;
    c.right = null;
    this.syncJsonFromDesigner();
  }

  clearCondRight(condId: string): void {
    const c = this.findCondition(this.activeBranch.when, condId);
    if (!c) return;

    c.right = null;
    this.syncJsonFromDesigner();
  }

  setCondLiteralRight(condId: string, text: string): void {
    const c = this.findCondition(this.activeBranch.when, condId);
    if (!c) return;

    const dt = this.exprDataType(c.left) ?? 'string';
    c.right = { type: 'literal', dataType: dt, value: this.parseLiteral(dt, text) };
    this.syncJsonFromDesigner();
  }

  // ============================================================
  // THEN actions
  // ============================================================

  dropToThenCanvas(ev: CdkDragDrop<any>): void {
    const d = ev.item.data as DragItem;
    if (!d || d.kind !== 'action' || !d.action) return;

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
    if (!inst) return;

    const d = ev.item.data as DragItem;
    if (!d || (d.kind !== 'field' && d.kind !== 'function')) return;

    inst.params[paramFieldKey] = this.dragItemToExpr(d);
    this.syncJsonFromDesigner();
  }

  clearActionParam(instId: string, paramFieldKey: string): void {
    const inst = this.activeBranch.then.find(a => a.id === instId);
    if (!inst) return;
    inst.params[paramFieldKey] = null;
    this.syncJsonFromDesigner();
  }

  setActionParamLiteral(instId: string, paramFieldKey: string, text: string, dt: DataType): void {
    const inst = this.activeBranch.then.find(a => a.id === instId);
    if (!inst) return;
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
    this.syncJsonFromDesigner();
  }

  applyJsonToDesigner(): void {
    this.jsonError = '';
    const t = (this.jsonText || '').trim();
    if (!t) {
      this.branches = [this.makeIfBranch()];
      this.activeBranchIndex = 0;
      this.jsonUserEditing = false;
      this.syncJsonFromDesigner();
      return;
    }

    try {
      const obj = JSON.parse(t) as UiRuleJsonV1;
      if (obj?.schema !== 'rulesengine.uirule.v1') {
        this.jsonError = 'JSON schema mismatch. Expected rulesengine.uirule.v1';
        return;
      }

      const loaded = this.fromJson(obj);
      this.branches = loaded;
      this.activeBranchIndex = 0;
      this.jsonUserEditing = false;
      this.syncJsonFromDesigner();
    } catch (e: any) {
      this.jsonError = e?.message ?? 'Invalid JSON';
    }
  }

  private syncJsonFromDesigner(): void {
    if (this.jsonUserEditing) return;

    this.jsonError = '';
    const obj: UiRuleJsonV1 = this.toJson();
    this.jsonText = JSON.stringify(obj, null, 2);
  }

  private toJson(): UiRuleJsonV1 {
    return {
      schema: 'rulesengine.uirule.v1',
      version: 1,
      branches: this.branches.map(b => ({
        type: b.type,
        when: b.when ? this.whenGroupToJson(b.when) : undefined,
        then: (b.then || []).map(ai => ({
          key: ai.actionKey,
          params: this.exprMapToJson(ai.params || {})
        }))
      }))
    };
  }

  private fromJson(obj: UiRuleJsonV1): Branch[] {
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
          type: b.type,
          when: this.whenGroupFromJson(b.when),
          then: this.actionsFromJson(b.then || [])
        });
      }
    }
    if (out.length === 0) out.push(this.makeIfBranch());
    return out;
  }

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
    if (!this.exprAuto.open || this.exprAuto.key !== key) return;

    const t = this.exprAuto.target;
    const expectedType = t?.expectedType ?? null;

    this.exprAuto.query = (query ?? '').trim();
    this.exprAuto.items = this.buildExprAutoItems(this.exprAuto.query, expectedType);
  }

  applyExprAuto(it: ExprAutoItem): void {
    const t = this.exprAuto.target;
    if (!t) return;

    if (t.kind === 'condRight') {
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
    if (ev.key === 'Escape') {
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

    for (const f of this.fields || []) {
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

    this.actions = [memberAlert, addActivity, setField];
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

    if (!this.rule) {
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

  // ============================================================
  // Internals
  // ============================================================

  private tryLoadFromRuleJson(ruleJson: string | null): void {
    if (!ruleJson || !ruleJson.trim()) return;

    try {
      const obj = JSON.parse(ruleJson);
      if (obj?.schema === 'rulesengine.uirule.v1') {
        this.branches = this.fromJson(obj as UiRuleJsonV1);
        this.activeBranchIndex = 0;
        this.jsonUserEditing = false;
        this.syncJsonFromDesigner();
      } else {
        // leave designer as-is; show JSON panel content
        this.jsonText = JSON.stringify(obj, null, 2);
      }
    } catch {
      // ignore
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
}
