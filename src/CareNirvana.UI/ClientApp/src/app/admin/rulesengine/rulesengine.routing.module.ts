import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { RulesEngineShellComponent } from './layout/rulesengineshell.component';
import { RulesDashboardComponent } from './pages/rulesdashboard/rulesdashboard.component';
import { RuleGroupsComponent } from './pages/rulegroups/rulegroups.component';
import { RulesComponent } from './pages/rules/rules.component';
import { DatafieldsComponent } from './pages/datafields/datafields.component';
import { FunctionsComponent } from './pages/functions/functions.component';
import { DecisiontableComponent } from './pages/decisiontable/decisiontable.component';
import { DecisionTableBuilderComponent } from './pages/decisiontablebuilder/decisiontablebuilder.component';

const routes: Routes = [
  {
    path: '',
    component: RulesEngineShellComponent,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      { path: 'dashboard', component: RulesDashboardComponent, data: { title: 'Dashboard' } },
      { path: 'rules', component: RulesComponent, data: { title: 'Business Rules' } },
      { path: 'rulegroups', component: RuleGroupsComponent, data: { title: 'Rule Groups' } },
      { path: 'datafields', component: DatafieldsComponent, data: { title: 'Data Fields' } },
      { path: 'functions', component: FunctionsComponent, data: { title: 'Functions' } },
      { path: 'decision', component: DecisiontableComponent, data: { title: 'Decision Table' } },
      { path: 'decisiontable', component: DecisionTableBuilderComponent, data: { title: 'Decision Table' } }
    ]
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class RulesEngineRoutingModule { }
