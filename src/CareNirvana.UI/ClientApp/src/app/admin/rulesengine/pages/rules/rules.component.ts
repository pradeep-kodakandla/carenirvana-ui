import { Component, OnInit } from '@angular/core';
import { forkJoin } from 'rxjs';
import { map } from 'rxjs/operators';
import { UiSmartOption } from 'src/app/shared/ui/uismartdropdown/uismartdropdown.component';
import { Router, ActivatedRoute } from '@angular/router';

import {
  RulesengineService,
  RuleModel,
  RuleGroupModel,
  RuleType
} from 'src/app/service/rulesengine.service';

type RuleModelEx = RuleModel & { ruleJson?: string | null };

@Component({
  selector: 'appRules',
  templateUrl: './rules.component.html',
  styleUrls: ['./rules.component.css']
})
export class RulesComponent implements OnInit {
  showForm = false;
  editRuleId: number | null = null;
  searchText = '';
  loading = false;

  rules: RuleModelEx[] = [];
  groups: RuleGroupModel[] = [];

  ruleTypeUiOptions: UiSmartOption<RuleType>[] = [];
  groupUiOptions: UiSmartOption<number>[] = [];

  // =========================
  // ✅ Designer modal state
  // =========================
  designerOpen = false;
  designerContext: 'rule' | 'form' = 'rule';
  designerTargetRule: RuleModelEx | null = null;

  designerText = '';
  designerError = '';
  designerDirty = false;
  designerSaving = false;

  // header helpers for modal
  designerHeaderName = '';
  designerHeaderGroup = '';
  designerHeaderType = '';

  form: {
    name: string;
    ruleGroupId: number;
    ruleType: RuleType;
    description: string;
    activeFlag: boolean;
    ruleJson: string; // ✅ NEW
  } = {
      name: '',
      ruleGroupId: 0,
      ruleType: 'REALTIME',
      description: '',
      activeFlag: true,
      ruleJson: ''
    };

  constructor(
    private api: RulesengineService,
    private router: Router,
    private route: ActivatedRoute
  ) { }

  ngOnInit(): void {
    this.ruleTypeUiOptions = this.api.getRuleTypeOptions().map(x => ({ value: x.value, label: x.label }));
    this.refresh();
  }

  get isEditMode(): boolean {
    return this.editRuleId != null;
  }

  refresh(): void {
    this.loading = true;
    forkJoin({
      groups: this.api.getRuleGroups(),
      rules: this.api.getRules()
    }).subscribe({
      next: (res) => {
        console.log('Loaded rules/groups', res);
        this.groups = res.groups ?? [];
        this.rules = (res.rules ?? []) as RuleModelEx[];
        this.groupUiOptions = this.groups.map(g => ({ value: g.id, label: g.name }));
        this.loading = false;
      },
      error: (err: any) => {
        console.error('Failed to load rules/groups', err);
        this.groups = [];
        this.rules = [];
        this.groupUiOptions = [];
        this.loading = false;
      }
    });
  }

  get filteredRules(): RuleModelEx[] {
    const q = (this.searchText ?? '').trim().toLowerCase();
    if (!q) return this.rules;

    return this.rules.filter(r => {
      const g = this.groupName(r.ruleGroupId).toLowerCase();
      const status = (r.activeFlag ? 'active' : 'inactive');
      return (
        (r.name ?? '').toLowerCase().includes(q) ||
        (r.description ?? '').toLowerCase().includes(q) ||
        g.includes(q) ||
        (r.ruleType ?? '').toLowerCase().includes(q) ||
        status.includes(q)
      );
    });
  }

  onNewRule(): void {
    this.showForm = true;
    this.editRuleId = null;

    const firstGroupId = this.groups.length > 0 ? this.groups[0].id : 0;

    this.form = {
      name: '',
      ruleGroupId: firstGroupId,
      ruleType: 'REALTIME',
      description: '',
      activeFlag: true,
      ruleJson: ''
    };
  }

  onEdit(r: RuleModelEx): void {
    this.showForm = true;
    this.editRuleId = r.id;

    this.form = {
      name: r.name ?? '',
      ruleGroupId: r.ruleGroupId,
      ruleType: r.ruleType,
      description: r.description ?? '',
      activeFlag: r.activeFlag ?? true,
      ruleJson: (r.ruleJson ?? '') as string
    };
  }

  onCancel(): void {
    this.showForm = false;
    this.editRuleId = null;
  }

  onSave(): void {
    const name = (this.form.name ?? '').trim();
    const description = (this.form.description ?? '').trim();
    const ruleGroupId = Number(this.form.ruleGroupId) || 0;

    if (!name || !description || !ruleGroupId) return;

    const ruleJsonText = (this.form.ruleJson ?? '').trim();
    const normalized = this.normalizeRuleJson(ruleJsonText); // null if blank
    const extractedInput = this.extractInputFromRuleJson(normalized);

    // ✅ include ruleJson + input
    const req: any = {
      name,
      ruleGroupId,
      ruleType: this.form.ruleType,
      description,
      activeFlag: this.form.activeFlag ?? true,
      ruleJson: normalized,     // string | null
      input: extractedInput     // object | null (ignored by backend if not modeled)
    };

    this.loading = true;

    const call$ = this.editRuleId != null
      ? this.api.updateRule(this.editRuleId, req)
      : this.api.createRule(req).pipe(map(() => void 0));

    call$.subscribe({
      next: () => {
        this.showForm = false;
        this.editRuleId = null;
        this.refresh();
      },
      error: (err: any) => {
        console.error('Save rule failed', err);
        this.loading = false;
      }
    });
  }

  onDelete(r: RuleModelEx): void {
    const ok = confirm(`Delete rule "${r.name}"? This is a soft delete.`);
    if (!ok) return;

    this.loading = true;
    this.api.deleteRule(r.id).subscribe({
      next: () => this.refresh(),
      error: (err: any) => {
        console.error('Delete rule failed', err);
        this.loading = false;
      }
    });
  }

  groupName(ruleGroupId: number): string {
    return this.groups.find(g => g.id === ruleGroupId)?.name ?? '';
  }

  // =========================
  // ✅ Designer helpers
  // =========================

  hasRuleJson(r: RuleModelEx): boolean {
    return !!(r && (r.ruleJson ?? '').toString().trim());
  }

  openDesigner(r: RuleModel): void {
    // If you are currently on /.../rules, this becomes /.../designer/:id
    this.router.navigate(['../designer', r.id], { relativeTo: this.route });
  }

  openDesignerForRule(r: RuleModelEx): void {
    this.designerContext = 'rule';
    this.designerTargetRule = r;

    this.designerHeaderName = r.name ?? '';
    this.designerHeaderGroup = this.groupName(r.ruleGroupId);
    this.designerHeaderType = r.ruleType ?? '';

    const raw = (r.ruleJson ?? '').toString();
    this.designerText = this.prettyIfJson(raw);
    this.designerError = '';
    this.designerDirty = false;
    this.designerSaving = false;
    this.designerOpen = true;
  }

  openDesignerForForm(): void {
    this.designerContext = 'form';
    this.designerTargetRule = null;

    this.designerHeaderName = (this.form.name ?? '').trim() || '(New Rule)';
    this.designerHeaderGroup = this.groupName(Number(this.form.ruleGroupId) || 0) || '';
    this.designerHeaderType = this.form.ruleType ?? '';

    const raw = (this.form.ruleJson ?? '').toString();
    this.designerText = this.prettyIfJson(raw);
    this.designerError = '';
    this.designerDirty = false;
    this.designerSaving = false;
    this.designerOpen = true;
  }

  closeDesigner(): void {
    if (this.designerDirty && !this.designerSaving) {
      const ok = confirm('Discard changes in Designer?');
      if (!ok) return;
    }

    this.designerOpen = false;
    this.designerContext = 'rule';
    this.designerTargetRule = null;
    this.designerText = '';
    this.designerError = '';
    this.designerDirty = false;
    this.designerSaving = false;
  }

  validateDesigner(): void {
    this.designerError = '';
    const text = (this.designerText ?? '').trim();
    if (!text) return;

    const parsed = this.tryParseJson(text);
    if (!parsed.ok) {
      this.designerError = parsed.error;
      return;
    }
  }

  formatDesigner(): void {
    this.designerError = '';
    const text = (this.designerText ?? '').trim();
    if (!text) return;

    const parsed = this.tryParseJson(text);
    if (!parsed.ok) {
      this.designerError = parsed.error;
      return;
    }

    this.designerText = JSON.stringify(parsed.value, null, 2);
    this.designerDirty = true;
  }

  saveDesigner(): void {
    this.designerError = '';
    const text = (this.designerText ?? '').trim();

    // empty => clear ruleJson
    const normalized = this.normalizeRuleJson(text);
    if (text && normalized == null) {
      // normalizeRuleJson only returns null for blank; so this is just safety
      this.designerError = 'Invalid JSON.';
      return;
    }

    if (text) {
      const parsed = this.tryParseJson(text);
      if (!parsed.ok) {
        this.designerError = parsed.error;
        return;
      }
    }

    const extractedInput = this.extractInputFromRuleJson(normalized);

    // Context: editing create/edit form => store into form and close
    if (this.designerContext === 'form') {
      this.form.ruleJson = normalized ?? '';
      this.designerDirty = false;
      this.closeDesigner();
      return;
    }

    // Context: saving directly from card => update rule
    const r = this.designerTargetRule;
    if (!r) {
      this.closeDesigner();
      return;
    }

    const req: any = {
      name: (r.name ?? '').toString(),
      ruleGroupId: Number(r.ruleGroupId) || 0,
      ruleType: r.ruleType,
      description: (r.description ?? '').toString(),
      activeFlag: r.activeFlag ?? true,
      ruleJson: normalized,
      input: extractedInput
    };

    this.designerSaving = true;
    this.api.updateRule(r.id, req).subscribe({
      next: () => {
        this.designerDirty = false;
        this.designerSaving = false;
        this.closeDesigner();
        this.refresh();
      },
      error: (err: any) => {
        console.error('Designer save failed', err);
        this.designerSaving = false;
        this.designerError = 'Failed to save. Check console/network for details.';
      }
    });
  }

  private normalizeRuleJson(text: string): string | null {
    const t = (text ?? '').trim();
    if (!t) return null;

    const parsed = this.tryParseJson(t);
    if (!parsed.ok) return null;

    // store as compact JSON string (consistent)
    return JSON.stringify(parsed.value);
  }

  private extractInputFromRuleJson(ruleJson: string | null): any | null {
    if (!ruleJson) return null;
    try {
      const obj = JSON.parse(ruleJson);
      return obj?.input ?? null;
    } catch {
      return null;
    }
  }

  private prettyIfJson(text: string): string {
    const t = (text ?? '').trim();
    if (!t) return '';
    const parsed = this.tryParseJson(t);
    if (!parsed.ok) return text; // show raw if not JSON
    return JSON.stringify(parsed.value, null, 2);
  }

  private tryParseJson(text: string): { ok: true; value: any } | { ok: false; error: string } {
    try {
      return { ok: true, value: JSON.parse(text) };
    } catch (e: any) {
      const msg = (e?.message ?? 'Invalid JSON').toString();
      return { ok: false, error: msg };
    }
  }
}
