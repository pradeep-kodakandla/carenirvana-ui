import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { RulesEngineRoutingModule } from './rulesengine.routing.module';

import { RulesEngineShellComponent } from './layout/rulesengineshell.component';
import { RulesDashboardComponent } from './pages/rulesdashboard/rulesdashboard.component';
import { RuleGroupsComponent } from './pages/rulegroups/rulegroups.component';
import { RulesComponent } from './pages/rules/rules.component';
import { DatafieldsComponent } from './pages/datafields/datafields.component';
import { FunctionsComponent } from './pages/functions/functions.component';
import { DecisiontableComponent } from './pages/decisiontable/decisiontable.component';
import { ReactiveFormsModule } from '@angular/forms';
import { SharedUiModule } from 'src/app/casewizard/casewizard/sharedui.module';


@NgModule({
  declarations: [
    RulesEngineShellComponent,
    RulesDashboardComponent,
    RuleGroupsComponent,
    RulesComponent,
    DatafieldsComponent,
    FunctionsComponent,
    DecisiontableComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    RulesEngineRoutingModule,
    ReactiveFormsModule,
    SharedUiModule
  ]
})
export class RulesEngineModule { }
