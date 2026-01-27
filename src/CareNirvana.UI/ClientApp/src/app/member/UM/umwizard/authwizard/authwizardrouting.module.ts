import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { AuthwizardshellComponent } from 'src/app/member/UM/components/authwizardshell/authwizardshell.component';
import { SmartCheckResultDialogComponent } from 'src/app/member/UM/steps/authsmartcheck/smartcheck-result-dialog.component';
import { AuthsmartcheckComponent } from 'src/app/member/UM/steps/authsmartcheck/authsmartcheck.component';
import { AuthdetailsComponent } from 'src/app/member/UM/steps/authdetails/authdetails.component';
import { AuthdecisionComponent } from 'src/app/member/UM/steps/authdecision/authdecision.component';
import { AuthmdreviewComponent } from 'src/app/member/UM/steps/authmdreview/authmdreview.component';
import { AuthactivityComponent } from 'src/app/member/UM/steps/authactivity/authactivity.component';
import { AuthnotesComponent } from 'src/app/member/UM/steps/authnotes/authnotes.component';
import { AuthdocumentsComponent } from 'src/app/member/UM/steps/authdocuments/authdocuments.component';

import { authpendingchangesGuard } from 'src/app/member/UM/guards/authepndingchanges.guard';


const routes: Routes = [
  {
    path: ':authNumber',
    component: AuthwizardshellComponent,
    children: [
      { path: 'smartcheck', component: AuthsmartcheckComponent, canDeactivate: [authpendingchangesGuard] },
      { path: 'details', component: AuthdetailsComponent, canDeactivate: [authpendingchangesGuard] },
      { path: 'decision', component: AuthdecisionComponent, canDeactivate: [authpendingchangesGuard] },
      { path: 'mdReview', component: AuthmdreviewComponent, canDeactivate: [authpendingchangesGuard] },
      { path: 'activities', component: AuthactivityComponent, canDeactivate: [authpendingchangesGuard] },
      { path: 'notes', component: AuthnotesComponent, canDeactivate: [authpendingchangesGuard] },
      { path: 'documents', component: AuthdocumentsComponent, canDeactivate: [authpendingchangesGuard] },

      { path: '', pathMatch: 'full', redirectTo: 'smartcheck' },
    ],
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class AuthwizardroutingModule { }
