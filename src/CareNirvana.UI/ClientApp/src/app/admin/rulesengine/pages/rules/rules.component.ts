import { Component, OnInit } from '@angular/core';
import {
  RulesEngineSampleDataService,
  RuleModel,
  RuleGroupModel,
  RuleType
} from '../../data/rulesengine.sampledata.service';
import { UiSmartOption } from 'src/app/shared/ui/uismartdropdown/uismartdropdown.component';


@Component({
  selector: 'appRules',
  templateUrl: './rules.component.html',
  styleUrls: ['./rules.component.css']
})
export class RulesComponent implements OnInit {
  showForm = false;
  editRuleId: number | null = null;
  searchText = '';

  rules: RuleModel[] = [];
  groups: RuleGroupModel[] = [];

  ruleTypeOptions = this.data.getRuleTypeOptions();
  ruleTypeUiOptions: UiSmartOption<RuleType>[] = [];
  groupUiOptions: UiSmartOption<number>[] = [];


  form: {
    name: string;
    ruleGroupId: number;
    ruleType: RuleType;
    description: string;
  } = {
      name: '',
      ruleGroupId: 0,
      ruleType: 'REALTIME',
      description: ''
    };

  constructor(private data: RulesEngineSampleDataService) { }

  ngOnInit(): void {
    this.ruleTypeUiOptions = this.ruleTypeOptions.map(x => ({ value: x.value, label: x.label }));
    this.refresh();
  }

  get isEditMode(): boolean {
    return this.editRuleId != null;
  }

  refresh(): void {
    this.groups = this.data.getRuleGroups();
    this.rules = this.data.getRules();
    this.groupUiOptions = this.groups.map(g => ({ value: g.id, label: g.name }));
  }

  get filteredRules(): RuleModel[] {
    const q = (this.searchText ?? '').trim().toLowerCase();
    if (!q) return this.rules;

    return this.rules.filter(r => {
      const g = this.groupName(r.ruleGroupId).toLowerCase();
      return (
        (r.name ?? '').toLowerCase().includes(q) ||
        (r.description ?? '').toLowerCase().includes(q) ||
        g.includes(q) ||
        (r.ruleType ?? '').toLowerCase().includes(q)
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
      description: ''
    };
  }

  onEdit(r: RuleModel): void {
    this.showForm = true;
    this.editRuleId = r.id;

    this.form = {
      name: r.name ?? '',
      ruleGroupId: r.ruleGroupId,
      ruleType: r.ruleType,
      description: r.description ?? ''
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

    if (!name) return;
    if (!description) return;
    if (!ruleGroupId) return;

    if (this.editRuleId != null) {
      this.data.updateRule(this.editRuleId, {
        name,
        ruleGroupId,
        ruleType: this.form.ruleType,
        description
      });
    } else {
      this.data.addRule({
        name,
        ruleGroupId,
        ruleType: this.form.ruleType,
        description
      });
    }

    this.showForm = false;
    this.editRuleId = null;
    this.refresh();
  }

  onDelete(r: RuleModel): void {
    this.data.deleteRule(r.id);
    this.refresh();
  }

  groupName(ruleGroupId: number): string {
    return this.groups.find(g => g.id === ruleGroupId)?.name ?? '';
  }
}
