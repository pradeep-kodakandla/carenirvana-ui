import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { map } from 'rxjs/operators';

import {
  RulesengineService,
  RuleGroupModel,
  RuleModel
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

  form: FormGroup;
  loading = false;

  constructor(private api: RulesengineService, private fb: FormBuilder) {
    this.form = this.fb.group({
      name: ['', Validators.required],
      description: ['', Validators.required],
      activeFlag: [true]
    });
  }

  ngOnInit(): void {
    this.refresh();
  }

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

  onNewGroup(): void {
    this.showForm = true;
    this.editGroupId = null;

    this.form.reset({
      name: '',
      description: '',
      activeFlag: true
    });
  }

  onEdit(g: RuleGroupModel): void {
    this.showForm = true;
    this.editGroupId = g.id;

    this.form.reset({
      name: g.name ?? '',
      description: g.description ?? '',
      activeFlag: g.activeFlag ?? true
    });
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
      description: string;
      activeFlag: boolean;
    };

    const req = {
      name: (v.name ?? '').trim(),
      description: (v.description ?? '').trim(),
      activeFlag: v.activeFlag ?? true
    };

    if (!req.name || !req.description) return;

    this.loading = true;

    // keep call$ as Observable<void> to avoid union type subscribe issues
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

  onDelete(g: RuleGroupModel): void {
    if (!g?.id) return;
    this.loading = true;

    this.api.deleteRuleGroup(g.id).subscribe({
      next: () => this.refresh(),
      error: (err: any) => {
        console.error('Delete rule group failed', err);
        this.loading = false;
      }
    });
  }

  getAssignedRules(groupId: number): RuleModel[] {
    return this.rules.filter(r => r.ruleGroupId === groupId);
  }
}
