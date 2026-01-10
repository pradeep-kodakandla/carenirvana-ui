import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { UiSmartOption } from 'src/app/shared/ui/uismartdropdown/uismartdropdown.component';
import { RulesengineService, RuleGroupModel, RuleModel, RuleType } from 'src/app/service/rulesengine.service';

type RuleModelEx = RuleModel & { ruleJson?: string | null };

type DataType = 'string' | 'number' | 'boolean' | 'date' | 'datetime';

interface DtCondition {
  name: string;
  columnId?: string;
  dataType: DataType;
  operator: string;

  mappedModule?: string;
  mappedDatasetKey?: string;
  mappedFieldKey?: string;
  mappedFieldPath?: string;
  mappedFieldLabel?: string;
}

interface DtResultCol {
  name: string;
  columnId?: string;
  dataType: DataType;
}

interface DecisionRuleJson {
  meta?: { source?: string; generatedOn?: string };
  engine?: string;
  version?: number;
  input?: { conditions: DtCondition[] };
  output?: { returnMode?: string; resultColumns: DtResultCol[] };
  decisionTable?: { id?: string; name?: string; hitPolicy?: string; tableVersion?: number };
}

@Component({
  selector: 'app-rule-designer',
  templateUrl: './rulesdesigner.component.html',
  styleUrls: ['./rulesdesigner.component.css']
})
export class RuleDesignerComponent implements OnInit {
  loading = false;
  saving = false;
  error = '';

  id = 0;

  rule: RuleModelEx | null = null;
  groups: RuleGroupModel[] = [];
  groupUiOptions: UiSmartOption<number>[] = [];
  ruleTypeUiOptions: UiSmartOption<RuleType>[] = [];

  // visual designer state
  name = '';
  description = '';
  ruleType: RuleType = 'REALTIME';
  ruleGroupId = 0;
  activeFlag = true;

  dtName = '';
  dtId = '';
  hitPolicy = 'FIRST';
  returnMode = 'FIRST_MATCH';
  version = 1;

  conditions: DtCondition[] = [];
  results: DtResultCol[] = [];

  // JSON panel
  showJson = false;
  jsonText = '';
  jsonError = '';

  readonly operators: UiSmartOption<string>[] = [
    { value: 'EQ', label: 'Equals' },
    { value: 'NEQ', label: 'Not Equals' },
    { value: 'IN', label: 'In' },
    { value: 'NOT_IN', label: 'Not In' },
    { value: 'CONTAINS', label: 'Contains' },
    { value: 'STARTS_WITH', label: 'Starts With' },
    { value: 'ENDS_WITH', label: 'Ends With' },
    { value: 'GT', label: 'Greater Than' },
    { value: 'GTE', label: 'Greater/Equal' },
    { value: 'LT', label: 'Less Than' },
    { value: 'LTE', label: 'Less/Equal' },
    { value: 'IS_EMPTY', label: 'Is Empty' },
    { value: 'NOT_EMPTY', label: 'Not Empty' }
  ];

  readonly dataTypes: UiSmartOption<DataType>[] = [
    { value: 'string', label: 'String' },
    { value: 'number', label: 'Number' },
    { value: 'boolean', label: 'Boolean' },
    { value: 'date', label: 'Date' },
    { value: 'datetime', label: 'DateTime' }
  ];

  readonly hitPolicies: UiSmartOption<string>[] = [
    { value: 'FIRST', label: 'FIRST' },
    { value: 'ANY', label: 'ANY' },
    { value: 'COLLECT', label: 'COLLECT' }
  ];

  readonly returnModes: UiSmartOption<string>[] = [
    { value: 'FIRST_MATCH', label: 'FIRST_MATCH' },
    { value: 'ALL_MATCHES', label: 'ALL_MATCHES' }
  ];

  constructor(
    private api: RulesengineService,
    private route: ActivatedRoute,
    private router: Router
  ) { }

  ngOnInit(): void {
    this.ruleTypeUiOptions = this.api.getRuleTypeOptions().map(x => ({ value: x.value, label: x.label }));

    this.id = Number(this.route.snapshot.paramMap.get('id')) || 0;
    if (!this.id) {
      this.error = 'Invalid Rule Id.';
      return;
    }

    this.load();
  }

  load(): void {
    this.loading = true;
    this.error = '';

    forkJoin({
      groups: this.api.getRuleGroups(),
      rules: this.api.getRules()
    }).subscribe({
      next: (res) => {
        this.groups = res.groups ?? [];
        this.groupUiOptions = this.groups.map(g => ({ value: g.id, label: g.name }));

        const r = (res.rules ?? []).find(x => x.id === this.id) as RuleModelEx | undefined;
        if (!r) {
          this.error = `Rule not found: ${this.id}`;
          this.loading = false;
          return;
        }

        this.rule = r;
        this.name = r.name ?? '';
        this.description = r.description ?? '';
        this.ruleType = r.ruleType;
        this.ruleGroupId = r.ruleGroupId;
        this.activeFlag = r.activeFlag ?? true;

        this.loadFromRuleJson(r.ruleJson ?? null);
        this.refreshJsonPreview();

        this.loading = false;
      },
      error: (err) => {
        console.error(err);
        this.error = 'Failed to load rule.';
        this.loading = false;
      }
    });
  }

  back(): void {
    this.router.navigate(['/admin/rulesengine/rules']);
  }

  // ---------- designer actions ----------
  addCondition(): void {
    this.conditions.push({
      name: 'New Condition',
      dataType: 'string',
      operator: 'EQ'
    });
    this.refreshJsonPreview();
  }

  removeCondition(i: number): void {
    this.conditions.splice(i, 1);
    this.refreshJsonPreview();
  }

  addResult(): void {
    this.results.push({
      name: 'Result',
      dataType: 'string'
    });
    this.refreshJsonPreview();
  }

  removeResult(i: number): void {
    this.results.splice(i, 1);
    this.refreshJsonPreview();
  }

  toggleJson(): void {
    this.showJson = !this.showJson;
  }

  // ---------- parse/build ----------
  private loadFromRuleJson(ruleJson: string | null): void {
    // empty -> blank designer
    if (!ruleJson || !ruleJson.trim()) {
      this.dtName = '';
      this.dtId = '';
      this.hitPolicy = 'FIRST';
      this.returnMode = 'FIRST_MATCH';
      this.version = 1;
      this.conditions = [];
      this.results = [];
      return;
    }

    try {
      const obj = JSON.parse(ruleJson) as DecisionRuleJson;

      this.version = obj.version ?? 1;
      this.returnMode = obj.output?.returnMode ?? 'FIRST_MATCH';
      this.hitPolicy = obj.decisionTable?.hitPolicy ?? obj.decisionTable?.['hitPolicy'] ?? 'FIRST';

      this.dtName = obj.decisionTable?.name ?? '';
      this.dtId = obj.decisionTable?.id ?? '';

      this.conditions = (obj.input?.conditions ?? []).map(c => ({
        name: c.name ?? 'Condition',
        columnId: c.columnId,
        dataType: (c.dataType as DataType) ?? 'string',
        operator: c.operator ?? 'EQ',
        mappedModule: c.mappedModule,
        mappedDatasetKey: c.mappedDatasetKey,
        mappedFieldKey: c.mappedFieldKey,
        mappedFieldPath: c.mappedFieldPath,
        mappedFieldLabel: c.mappedFieldLabel
      }));

      this.results = (obj.output?.resultColumns ?? []).map(x => ({
        name: x.name ?? 'Result',
        columnId: x.columnId,
        dataType: (x.dataType as DataType) ?? 'string'
      }));
    } catch (e: any) {
      // If JSON is invalid, show JSON tab so user can fix.
      this.showJson = true;
      this.jsonError = e?.message ?? 'Invalid ruleJson.';
      this.jsonText = ruleJson;
    }
  }

  buildRuleJsonObject(): DecisionRuleJson {
    const now = new Date().toISOString();

    const obj: DecisionRuleJson = {
      meta: {
        source: 'RuleDesigner',
        generatedOn: now
      },
      engine: 'DecisionTable',
      version: this.version ?? 1,
      input: {
        conditions: this.conditions.map(c => ({
          name: c.name,
          columnId: c.columnId,
          dataType: c.dataType,
          operator: c.operator,
          mappedModule: c.mappedModule,
          mappedDatasetKey: c.mappedDatasetKey,
          mappedFieldKey: c.mappedFieldKey,
          mappedFieldPath: c.mappedFieldPath,
          mappedFieldLabel: c.mappedFieldLabel
        }))
      },
      output: {
        returnMode: this.returnMode,
        resultColumns: this.results.map(r => ({
          name: r.name,
          columnId: r.columnId,
          dataType: r.dataType
        }))
      },
      decisionTable: {
        id: this.dtId || undefined,
        name: this.dtName || undefined,
        hitPolicy: this.hitPolicy || undefined,
        tableVersion: 1
      }
    };

    return obj;
  }

  refreshJsonPreview(): void {
    this.jsonError = '';
    const obj = this.buildRuleJsonObject();
    this.jsonText = JSON.stringify(obj, null, 2);
  }

  applyJsonToDesigner(): void {
    this.jsonError = '';
    const t = (this.jsonText ?? '').trim();
    if (!t) {
      this.loadFromRuleJson(null);
      this.refreshJsonPreview();
      return;
    }

    try {
      const obj = JSON.parse(t) as DecisionRuleJson;
      // Load it by re-stringifying (normalizes)
      this.loadFromRuleJson(JSON.stringify(obj));
      this.refreshJsonPreview();
      this.showJson = false;
    } catch (e: any) {
      this.jsonError = e?.message ?? 'Invalid JSON.';
    }
  }

  // ---------- save ----------
  save(): void {
    if (!this.rule) return;

    const ruleJsonObj = this.buildRuleJsonObject();
    const ruleJson = JSON.stringify(ruleJsonObj);
    const input = ruleJsonObj.input ?? null;

    const req: any = {
      name: (this.name ?? '').trim(),
      ruleGroupId: Number(this.ruleGroupId) || 0,
      ruleType: this.ruleType,
      description: (this.description ?? '').trim(),
      activeFlag: this.activeFlag ?? true,
      ruleJson,  // ✅ send ruleJson
      input      // ✅ also send input (as requested)
    };

    if (!req.name || !req.ruleGroupId) {
      this.error = 'Rule Name and Rule Group are required.';
      return;
    }

    this.saving = true;
    this.error = '';

    this.api.updateRule(this.rule.id, req).subscribe({
      next: () => {
        this.saving = false;
        this.back();
      },
      error: (err) => {
        console.error(err);
        this.error = 'Save failed.';
        this.saving = false;
      }
    });
  }

  groupName(id: number): string {
    return this.groups.find(g => g.id === id)?.name ?? '';
  }
}
