import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CasewizardRoutingModule } from './casewizardrouting.module';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { SharedUiModule } from 'src/app/casewizard/casewizard/sharedui.module';

import { CasewizardshellComponent } from 'src/app/member/AG/components/casewizardshell/casewizardshell.component';
import { CaseChevronStepperComponent } from 'src/app/member/AG/components/case-chevron-stepper/case-chevron-stepper.component';
import { CaseConfirmLeaveDialogComponent } from 'src/app/member/AG/components/case-confirm-leave-dialog/case-confirm-leave-dialog.component';

import { CasedetailsComponent } from 'src/app/member/AG/steps/casedetails/casedetails.component';
import { CasedispositionComponent } from 'src/app/member/AG/steps/casedisposition/casedisposition.component';
import { CasemdreviewComponent } from 'src/app/member/AG/steps/casemdreview/casemdreview.component';
import { CasecloseComponent } from 'src/app/member/AG/steps/caseclose/caseclose.component';
import { CasesharedwidgetsModule } from './casesharedwidgets.module';

@NgModule({
  declarations: [
    CasewizardshellComponent,
    CaseChevronStepperComponent,
    CaseConfirmLeaveDialogComponent,

    CasedetailsComponent,
    CasedispositionComponent,
    CasemdreviewComponent,
    CasecloseComponent,
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    CasewizardRoutingModule,
    SharedUiModule,
    CasesharedwidgetsModule
  ],
  exports: [
    CasewizardshellComponent 
  ]
})
export class CaseWizardModule { }

