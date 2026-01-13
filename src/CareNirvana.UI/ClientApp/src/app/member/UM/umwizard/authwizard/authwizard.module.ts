import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthwizardroutingModule } from './authwizardrouting.module';
import { ReactiveFormsModule } from '@angular/forms';
import { SharedUiModule } from 'src/app/casewizard/casewizard/sharedui.module';

import { AuthwizardshellComponent } from 'src/app/member/UM/components/authwizardshell/authwizardshell.component';
import { AuthchevronstepperComponent } from 'src/app/member/UM/components/authchevronstepper/authchevronstepper.component';
import { AuthconfirmleavedialogComponent } from 'src/app/member/UM/components/authconfirmleavedialog/authconfirmleavedialog.component';

import { AuthdetailsComponent } from 'src/app/member/UM/steps/authdetails/authdetails.component';
import { AuthdecisionComponent } from 'src/app/member/UM/steps/authdecision/authdecision.component';
import { AuthmdreviewComponent } from 'src/app/member/UM/steps/authmdreview/authmdreview.component';
import { AuthactivityComponent } from 'src/app/member/UM/steps/authactivity/authactivity.component';
import { AuthnotesComponent } from 'src/app/member/UM/steps/authnotes/authnotes.component';
import { AuthdocumentsComponent } from 'src/app/member/UM/steps/authdocuments/authdocuments.component';


@NgModule({
  declarations: [
    AuthwizardshellComponent,
    AuthchevronstepperComponent,
    AuthconfirmleavedialogComponent,

    AuthdetailsComponent,
    AuthdecisionComponent,
    AuthmdreviewComponent,
    AuthactivityComponent,
    AuthnotesComponent,
    AuthdocumentsComponent
  ],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    AuthwizardroutingModule,
    SharedUiModule
  ],
  exports: [
    AuthwizardshellComponent
  ]
})
export class authWizardModule { }

