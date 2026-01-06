import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { UiSmartOption } from 'src/app/shared/ui/uismartdropdown/uismartdropdown.component';

import {
  RulesEngineSampleDataService,
  RuleGroupModel,
  RuleModel,
  ScheduleType,
  DropdownOption
} from '../../data/rulesengine.sampledata.service';

@Component({
  selector: 'appRuleGroups',
  templateUrl: './rulegroups.component.html',
  styleUrls: ['./rulegroups.component.css']
})
export class RuleGroupsComponent implements OnInit {
  groups: RuleGroupModel[] = [];
  rules: RuleModel[] = [];

  showForm = false;
  editGroupId: number | null = null;

  scheduleUiOptions: UiSmartOption<ScheduleType>[] = [];
  private scheduleOptions: DropdownOption<ScheduleType>[] = [];

  form: FormGroup;

  constructor(private data: RulesEngineSampleDataService, private fb: FormBuilder) {
    this.form = this.fb.group({
      name: ['', Validators.required],
      scheduleType: ['DailyOnce' as ScheduleType, Validators.required],
      description: ['', Validators.required],
      purpose: ['', Validators.required]
    });
  }

  ngOnInit(): void {
    this.scheduleOptions = this.data.getScheduleOptions();
    this.scheduleUiOptions = this.scheduleOptions.map(x => ({ value: x.value, label: x.label }));
    this.refresh();
  }

  refresh(): void {
    this.groups = this.data.getRuleGroups();
    this.rules = this.data.getRules();
  }

  get isEditMode(): boolean {
    return this.editGroupId != null;
  }

  scheduleLabel(t: ScheduleType): string {
    return this.scheduleOptions.find(x => x.value === t)?.label ?? String(t ?? '');
  }

  onNewGroup(): void {
    this.showForm = true;
    this.editGroupId = null;

    this.form.reset({
      name: '',
      scheduleType: 'DailyOnce',
      description: '',
      purpose: ''
    });
  }

  onEdit(g: RuleGroupModel): void {
    this.showForm = true;
    this.editGroupId = g.id;

    this.form.reset({
      name: g.name ?? '',
      scheduleType: g.scheduleType,
      description: g.description ?? '',
      purpose: g.purpose ?? ''
    });
  }

  // for now: schedule button opens edit form (focused on schedule)
  onSchedule(g: RuleGroupModel): void {
    this.onEdit(g);
  }

  onCancel(): void {
    this.showForm = false;
    this.editGroupId = null;
  }

  onSave(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const v = this.form.value as {
      name: string;
      scheduleType: ScheduleType;
      description: string;
      purpose: string;
    };

    if (this.editGroupId != null) {
      this.data.updateRuleGroup(this.editGroupId, {
        name: v.name,
        scheduleType: v.scheduleType,
        description: v.description,
        purpose: v.purpose
      });
    } else {
      this.data.addRuleGroup({
        name: v.name,
        scheduleType: v.scheduleType,
        description: v.description,
        purpose: v.purpose
      });
    }

    this.showForm = false;
    this.editGroupId = null;
    this.refresh();
  }

  getAssignedRules(groupId: number): RuleModel[] {
    return this.rules.filter(r => r.ruleGroupId === groupId);
  }
}
