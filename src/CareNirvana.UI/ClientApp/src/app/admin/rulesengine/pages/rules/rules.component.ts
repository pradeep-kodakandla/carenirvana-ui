import { Component, OnInit } from '@angular/core';
import { forkJoin } from 'rxjs';
import { map } from 'rxjs/operators';
import { UiSmartOption } from 'src/app/shared/ui/uismartdropdown/uismartdropdown.component';

import {
  RulesengineService,
  RuleModel,
  RuleGroupModel,
  RuleType
} from 'src/app/service/rulesengine.service';

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

  rules: RuleModel[] = [];
  groups: RuleGroupModel[] = [];

  ruleTypeUiOptions: UiSmartOption<RuleType>[] = [];
  groupUiOptions: UiSmartOption<number>[] = [];

  form: {
    name: string;
    ruleGroupId: number;
    ruleType: RuleType;
    description: string;
    activeFlag: boolean;   // ✅ NEW
  } = {
      name: '',
      ruleGroupId: 0,
      ruleType: 'REALTIME',
      description: '',
      activeFlag: true
    };

  constructor(private api: RulesengineService) { }

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
        this.groups = res.groups ?? [];
        this.rules = res.rules ?? [];
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

  get filteredRules(): RuleModel[] {
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
      activeFlag: true
    };
  }

  onEdit(r: RuleModel): void {
    this.showForm = true;
    this.editRuleId = r.id;

    this.form = {
      name: r.name ?? '',
      ruleGroupId: r.ruleGroupId,
      ruleType: r.ruleType,
      description: r.description ?? '',
      activeFlag: r.activeFlag ?? true
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

    // ✅ include activeFlag so it matches cfgrule + UpsertRuleRequest
    const req = {
      name,
      ruleGroupId,
      ruleType: this.form.ruleType,
      description,
      activeFlag: this.form.activeFlag ?? true
      // ruleJson is optional; service will send null if not provided
    };

    this.loading = true;

    // keep call$ always Observable<void>
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

  onDelete(r: RuleModel): void {
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
}
