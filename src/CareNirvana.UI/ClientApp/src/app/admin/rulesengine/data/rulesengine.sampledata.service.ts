import { Injectable } from '@angular/core';
import { DashboardStats, RecentExecution } from '../models/rulesengine.models';

export type ScheduleType = 'DailyOnce' | 'DailyTwice' | 'Weekly' | 'Monthly';
export type RuleType = 'REALTIME' | 'BATCH';

export interface DropdownOption<T = any> {
  value: T;
  label: string;
}

export interface RuleGroupModel {
  id: number;
  name: string;
  description: string;
  purpose: string;
  scheduleType: ScheduleType;
}

export interface RuleModel {
  id: number;
  name: string;
  ruleGroupId: number;
  ruleType: RuleType;
  description: string;
}

/**
 * "Saved as JSON in sampledata"
 * - Keep your starting dataset here
 * - Service clones it into in-memory arrays and supports add/edit/delete
 */
const SAMPLE_DATA: {
  ruleGroups: RuleGroupModel[];
  rules: RuleModel[];
  recentExecutions: RecentExecution[];
} = {
  ruleGroups: [],
  rules: [],
  recentExecutions: [
    {
      name: 'Eligibility Check',
      module: 'Care Management',
      mode: 'BATCH',
      when: 'Jan 05, 2026 02:00 AM',
      count: 5240,
      status: 'SUCCESS'
    },
    {
      name: 'Pre Auth Approval',
      module: 'Utilization Mgmt',
      mode: 'REALTIME',
      when: 'Jan 05, 2026 03:22 PM',
      count: 18,
      status: 'SUCCESS'
    }
  ]
};

/**
 * Backward compatible exports (if your dashboard still imports constants directly)
 * NOTE: these are static snapshots; for live stats use service.getDashboardStats()
 */
export const RECENTEXECUTIONS: RecentExecution[] = SAMPLE_DATA.recentExecutions;

export const DASHBOARDSTATS: DashboardStats = {
  activeRules: { value: 0, sub: '0 Realtime, 0 Batch' },
  ruleGroups: { value: 0, sub: 'No groups yet' },
  dataFunctions: { value: 156, sub: 'Reusable components' },
  recordsProcessed: { value: '0', sub: 'This month' }
};

@Injectable({ providedIn: 'root' })
export class RulesEngineSampleDataService {
  private ruleGroups: RuleGroupModel[] = this.clone(SAMPLE_DATA.ruleGroups);
  private rules: RuleModel[] = this.clone(SAMPLE_DATA.rules);
  private recentExecutions: RecentExecution[] = this.clone(SAMPLE_DATA.recentExecutions);

  private nextGroupId = 1;
  private nextRuleId = 1;

  private readonly scheduleOptions: DropdownOption<ScheduleType>[] = [
    { value: 'DailyOnce', label: 'Daily (Once)' },
    { value: 'DailyTwice', label: 'Daily (Twice)' },
    { value: 'Weekly', label: 'Weekly' },
    { value: 'Monthly', label: 'Monthly' }
  ];

  private readonly ruleTypeOptions: DropdownOption<RuleType>[] = [
    { value: 'REALTIME', label: 'Real Time' },
    { value: 'BATCH', label: 'Batch' }
  ];

  // ---- Dropdown options ----
  getScheduleOptions(): DropdownOption<ScheduleType>[] {
    return this.clone(this.scheduleOptions);
  }

  getRuleTypeOptions(): DropdownOption<RuleType>[] {
    return this.clone(this.ruleTypeOptions);
  }

  // ---- Rule Groups ----
  getRuleGroups(): RuleGroupModel[] {
    return this.clone(this.ruleGroups).sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
  }

  addRuleGroup(input: Omit<RuleGroupModel, 'id'>): RuleGroupModel {
    const g: RuleGroupModel = { id: this.nextGroupId++, ...input };
    this.ruleGroups.push(g);
    return this.clone(g);
  }

  updateRuleGroup(id: number, patch: Partial<Omit<RuleGroupModel, 'id'>>): void {
    const idx = this.ruleGroups.findIndex(x => x.id === id);
    if (idx < 0) return;
    this.ruleGroups[idx] = { ...this.ruleGroups[idx], ...patch };
  }

  // ---- Rules ----
  getRules(): RuleModel[] {
    return this.clone(this.rules).sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
  }

  addRule(input: Omit<RuleModel, 'id'>): RuleModel {
    const r: RuleModel = { id: this.nextRuleId++, ...input };
    this.rules.push(r);
    return this.clone(r);
  }

  updateRule(id: number, patch: Partial<Omit<RuleModel, 'id'>>): void {
    const idx = this.rules.findIndex(x => x.id === id);
    if (idx < 0) return;
    this.rules[idx] = { ...this.rules[idx], ...patch };
  }

  deleteRule(id: number): void {
    this.rules = this.rules.filter(x => x.id !== id);
  }

  // ---- Dashboard helpers ----
  getRecentExecutions(): RecentExecution[] {
    return this.clone(this.recentExecutions);
  }

  getDashboardStats(): DashboardStats {
    const rules = this.rules;
    const groups = this.ruleGroups;

    const realtime = rules.filter(r => r.ruleType === 'REALTIME').length;
    const batch = rules.filter(r => r.ruleType === 'BATCH').length;

    return {
      activeRules: { value: rules.length, sub: `${realtime} Realtime, ${batch} Batch` },
      ruleGroups: { value: groups.length, sub: groups.length ? 'Configured groups' : 'No groups yet' },
      dataFunctions: { value: 156, sub: 'Reusable components' },
      recordsProcessed: { value: rules.length ? '2.3M' : '0', sub: 'This month' }
    };
  }

  private clone<T>(v: T): T {
    return JSON.parse(JSON.stringify(v));
  }
}
