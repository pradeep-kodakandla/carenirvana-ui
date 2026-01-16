import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { AuthwizardroutingModule } from './authwizardrouting.module';
import { SharedUiModule } from 'src/app/casewizard/casewizard/sharedui.module';
// Angular material modules you use
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatButtonModule } from '@angular/material/button';

import { AuthwizardshellComponent } from 'src/app/member/UM/components/authwizardshell/authwizardshell.component';
import { AuthchevronstepperComponent } from 'src/app/member/UM/components/authchevronstepper/authchevronstepper.component';
import { AuthconfirmleavedialogComponent } from 'src/app/member/UM/components/authconfirmleavedialog/authconfirmleavedialog.component';

import { AuthsmartcheckComponent } from 'src/app/member/UM/steps/authsmartcheck/authsmartcheck.component';
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

    AuthsmartcheckComponent,
    AuthdetailsComponent,
    AuthdecisionComponent,
    AuthmdreviewComponent,
    AuthactivityComponent,
    AuthnotesComponent,
    AuthdocumentsComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    AuthwizardroutingModule,
    SharedUiModule,


    MatCardModule,
    MatDividerModule,
    MatAutocompleteModule,
    MatInputModule,
    MatFormFieldModule,
    MatButtonModule,
  ],
  exports: [
    AuthwizardshellComponent
  ]
})
export class authWizardModule { }

