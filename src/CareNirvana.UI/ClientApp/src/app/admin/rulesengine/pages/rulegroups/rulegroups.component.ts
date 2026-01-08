import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { map } from 'rxjs/operators';
import { UiSmartOption } from 'src/app/shared/ui/uismartdropdown/uismartdropdown.component';

import {
  RulesengineService,
  RuleGroupModel,
  RuleModel,
  ScheduleType,
  DropdownOption
} from 'src/app/service/rulesengine.service';

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
  loading = false;

  constructor(private api: RulesengineService, private fb: FormBuilder) {
    this.form = this.fb.group({
      name: ['', Validators.required],
      scheduleType: ['DailyOnce' as ScheduleType, Validators.required],
      description: ['', Validators.required],
      purpose: ['', Validators.required]
    });
  }

  ngOnInit(): void {
    this.scheduleOptions = this.api.getScheduleOptions();
    this.scheduleUiOptions = this.scheduleOptions.map(x => ({ value: x.value, label: x.label }));
    this.refresh();
  }

  // ✅ HTML uses this: {{ isEditMode ? ... }} :contentReference[oaicite:2]{index=2}
  get isEditMode(): boolean {
    return this.editGroupId != null;
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
        this.loading = false;
      },
      error: (err: any) => {
        console.error('Failed to load rule groups/rules', err);
        this.groups = [];
        this.rules = [];
        this.loading = false;
      }
    });
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

    const req = {
      name: (v.name ?? '').trim(),
      scheduleType: v.scheduleType,
      description: (v.description ?? '').trim(),
      purpose: (v.purpose ?? '').trim()
    };

    if (!req.name || !req.description || !req.purpose) return;

    this.loading = true;

    // ✅ Make call$ ALWAYS Observable<void> to avoid union-type subscribe error
    const call$ = this.editGroupId != null
      ? this.api.updateRuleGroup(this.editGroupId, req)
      : this.api.createRuleGroup(req).pipe(map(() => void 0));

    call$.subscribe({
      next: () => {
        this.showForm = false;
        this.editGroupId = null;
        this.refresh();
      },
      error: (err: any) => {
        console.error('Save rule group failed', err);
        this.loading = false;
      }
    });
  }

  getAssignedRules(groupId: number): RuleModel[] {
    return this.rules.filter(r => r.ruleGroupId === groupId);
  }
}
