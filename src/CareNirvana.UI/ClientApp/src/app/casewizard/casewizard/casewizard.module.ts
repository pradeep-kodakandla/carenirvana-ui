import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CasewizardRoutingModule } from './casewizardrouting.module';
import { ReactiveFormsModule } from '@angular/forms';
import { SharedUiModule } from 'src/app/casewizard/casewizard/sharedui.module';

import { CasewizardshellComponent } from 'src/app/member/AG/components/casewizardshell/casewizardshell.component';
import { CaseChevronStepperComponent } from 'src/app/member/AG/components/case-chevron-stepper/case-chevron-stepper.component';
import { CaseConfirmLeaveDialogComponent } from 'src/app/member/AG/components/case-confirm-leave-dialog/case-confirm-leave-dialog.component';

import { CasedetailsComponent } from 'src/app/member/AG/steps/casedetails/casedetails.component';
import { CasedispositionComponent } from 'src/app/member/AG/steps/casedisposition/casedisposition.component';
import { CasemdreviewComponent } from 'src/app/member/AG/steps/casemdreview/casemdreview.component';
import { CaseactivitiesComponent } from 'src/app/member/AG/steps/caseactivities/caseactivities.component';
import { CasenotesComponent } from 'src/app/member/AG/steps/casenotes/casenotes.component';
import { CasedocumentsComponent } from 'src/app/member/AG/steps/casedocuments/casedocuments.component';
import { CasecloseComponent } from 'src/app/member/AG/steps/caseclose/caseclose.component';

@NgModule({
  declarations: [
    CasewizardshellComponent,
    CaseChevronStepperComponent,
    CaseConfirmLeaveDialogComponent,

    CasedetailsComponent,
    CasedispositionComponent,
    CasemdreviewComponent,
    CaseactivitiesComponent,
    CasenotesComponent,
    CasedocumentsComponent,
    CasecloseComponent,
  ],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    CasewizardRoutingModule,
    SharedUiModule
  ],
})
export class CaseWizardModule { }

