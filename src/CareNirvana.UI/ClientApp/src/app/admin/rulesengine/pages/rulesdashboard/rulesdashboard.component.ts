import { Component, OnInit } from '@angular/core';
import { RulesEngineSampleDataService } from '../../data/rulesengine.sampledata.service';
import { RulesengineService, RulesDashboardStats, RuleExecutionLogRow, PagedResult } from 'src/app/service/rulesengine.service';


@Component({
  selector: 'app-rulesdashboard',
  templateUrl: './rulesdashboard.component.html',
  styleUrls: ['./rulesdashboard.component.css']
})
export class RulesDashboardComponent implements OnInit {
  stats!: RulesDashboardStats;

  logs: RuleExecutionLogRow[] = [];
  loadingLogs = false;
  logsError: string | null = null;

  page = 1;
  pageSize = 10;
  total = 0;

  constructor(private dashboardApi: RulesengineService) { }

  ngOnInit(): void {
    // KPIs
    this.dashboardApi.getDashboard().subscribe({
      next: (s) => (this.stats = s)
    });

    // Recent Rule Executions (from log table)
    this.loadLogs();
  }

  loadLogs(): void {
    this.loadingLogs = true;
    this.logsError = null;

    this.dashboardApi.getRuleExecutionLogs(this.page, this.pageSize).subscribe({
      next: (res: PagedResult<RuleExecutionLogRow>) => {
        this.logs = res.items ?? [];
        this.total = res.total ?? 0;
        this.page = res.page ?? this.page;
        this.pageSize = res.pageSize ?? this.pageSize;
        this.loadingLogs = false;
      },
      error: (err) => {
        this.loadingLogs = false;
        this.logsError = 'Unable to load recent rule executions.';
        // eslint-disable-next-line no-console
        console.error(err);
      }
    });
  }

  prevPage(): void {
    if (this.page <= 1) return;
    this.page--;
    this.loadLogs();
  }

  nextPage(): void {
    const maxPage = Math.max(1, Math.ceil((this.total || 0) / (this.pageSize || 1)));
    if (this.page >= maxPage) return;
    this.page++;
    this.loadLogs();
  }

  onPageSizeChange(value: string): void {
    const size = Number(value);
    this.pageSize = Number.isFinite(size) && size > 0 ? size : 10;
    this.page = 1;
    this.loadLogs();
  }

  get rangeText(): string {
    if (!this.total) return '0 records';
    const start = (this.page - 1) * this.pageSize + 1;
    const end = Math.min(this.total, this.page * this.pageSize);
    return `${start}-${end} of ${this.total}`;
  }

  statusPillClass(status: string | null | undefined): string {
    const s = (status ?? '').toLowerCase();
    if (s.includes('success') || s === 'ok' || s.includes('completed')) return 'green';
    if (s.includes('fail') || s.includes('error')) return 'red';
    return 'blue';
  }

  displayRuleName(r: RuleExecutionLogRow): string {
    return (r.matchedRuleName && r.matchedRuleName.trim().length > 0)
      ? r.matchedRuleName
      : r.triggerKey;
  }
}
