export type RuleMode = 'REALTIME' | 'BATCH';
export type RunStatus = 'SUCCESS' | 'FAILED' | 'RUNNING';

export interface KpiStat {
  value: number | string;
  sub: string;
}

export interface DashboardStats {
  activeRules: KpiStat;
  ruleGroups: KpiStat;
  dataFunctions: KpiStat;
  recordsProcessed: KpiStat;
}

export interface RecentExecution {
  name: string;
  module: string;
  mode: RuleMode;
  when: string;
  count: number;
  status: RunStatus;
}

export interface RuleGroupCard {
  title: string;
  meta: string;
}

export interface BusinessRuleCard {
  title: string;
  group: string;
  priority: number;
  desc: string;
  mode: RuleMode;
  active: boolean;
}
