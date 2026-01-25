import { Component, OnInit } from '@angular/core';
import { RulesEngineSampleDataService } from '../../data/rulesengine.sampledata.service';
import { RulesengineService, RulesDashboardStats } from 'src/app/service/rulesengine.service';

@Component({
  selector: 'app-rulesdashboard',
  templateUrl: './rulesdashboard.component.html',
  styleUrls: ['./rulesdashboard.component.css']
})
export class RulesDashboardComponent implements OnInit {
  stats!: RulesDashboardStats;
  executions: any[] = [];

  constructor(
    private dashboardApi: RulesengineService,
    private sampleData: RulesEngineSampleDataService
  ) { }

  ngOnInit(): void {
    // keep Recent Rule Executions static for now
    this.executions = this.sampleData.getRecentExecutions();

    // KPIs dynamic
    this.dashboardApi.getDashboard().subscribe({
      next: (s) => (this.stats = s) // optional fallback
    });
  }
}
