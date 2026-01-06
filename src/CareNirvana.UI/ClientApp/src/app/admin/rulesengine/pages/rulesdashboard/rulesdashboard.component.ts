import { Component, OnInit } from '@angular/core';
import { RulesEngineSampleDataService } from '../../data/rulesengine.sampledata.service';

@Component({
  selector: 'app-rulesdashboard',
  templateUrl: './rulesdashboard.component.html',
  styleUrls: ['./rulesdashboard.component.css']
})
export class RulesDashboardComponent implements OnInit {
  stats: any;
  executions: any[] = [];

  constructor(private data: RulesEngineSampleDataService) { }

  ngOnInit(): void {
    this.stats = this.data.getDashboardStats();
    this.executions = this.data.getRecentExecutions();
  }
}
