import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';


import { CasewizardshellComponent } from 'src/app/member/AG/components/casewizardshell/casewizardshell.component';

import { CasedetailsComponent } from 'src/app/member/AG/steps/casedetails/casedetails.component';
import { CasedispositionComponent } from 'src/app/member/AG/steps/casedisposition/casedisposition.component';
import { CasemdreviewComponent } from 'src/app/member/AG/steps/casemdreview/casemdreview.component';
import { CaseactivitiesComponent } from 'src/app/member/AG/steps/caseactivities/caseactivities.component';
import { CasenotesComponent } from 'src/app/member/AG/steps/casenotes/casenotes.component';
import { CasedocumentsComponent } from 'src/app/member/AG/steps/casedocuments/casedocuments.component';
import { CasecloseComponent } from 'src/app/member/AG/steps/caseclose/caseclose.component';

import { casependingchangesGuard } from 'src/app/member/AG/guards/guards/casependingchanges.guard';


const routes: Routes = [
  {
    path: 'case/:caseId',
    component: CasewizardshellComponent,
    children: [
      { path: 'details', component: CasedetailsComponent, canDeactivate: [CasedetailsComponent] },
      { path: 'disposition', component: CasedispositionComponent, canDeactivate: [CasedispositionComponent] },
      { path: 'mdReview', component: CasemdreviewComponent, canDeactivate: [CasemdreviewComponent] },
      { path: 'activities', component: CaseactivitiesComponent, canDeactivate: [CaseactivitiesComponent] },
      { path: 'notes', component: CasenotesComponent, canDeactivate: [CasenotesComponent] },
      { path: 'documents', component: CasedocumentsComponent, canDeactivate: [CasedocumentsComponent] },
      { path: 'close', component: CasecloseComponent, canDeactivate: [CasecloseComponent] },
      { path: '', pathMatch: 'full', redirectTo: 'details' },
    ],
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class CasewizardRoutingModule { }
