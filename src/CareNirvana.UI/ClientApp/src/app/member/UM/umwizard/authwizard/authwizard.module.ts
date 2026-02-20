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
import { DragDropModule } from '@angular/cdk/drag-drop';
import { MatIcon } from '@angular/material/icon';
import { MatDialogModule } from '@angular/material/dialog';

import { AuthwizardshellComponent } from 'src/app/member/UM/components/authwizardshell/authwizardshell.component';
import { AuthchevronstepperComponent } from 'src/app/member/UM/components/authchevronstepper/authchevronstepper.component';
import { AuthconfirmleavedialogComponent } from 'src/app/member/UM/components/authconfirmleavedialog/authconfirmleavedialog.component';

import { SmartCheckResultDialogComponent } from 'src/app/member/UM/steps/authsmartcheck/smartcheck-result-dialog.component';
import { AuthsmartcheckComponent } from 'src/app/member/UM/steps/authsmartcheck/authsmartcheck.component';
import { AuthdecisionComponent } from 'src/app/member/UM/steps/authdecision/authdecision.component';
import { UmsharedwidgetsModule } from 'src/app/member/UM/umwizard/authwizard/umsharedwidgets.module';



@NgModule({
  declarations: [
    AuthwizardshellComponent,
    AuthchevronstepperComponent,
    AuthconfirmleavedialogComponent,

    AuthsmartcheckComponent,
    AuthdecisionComponent,
    SmartCheckResultDialogComponent

    
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    AuthwizardroutingModule,
    SharedUiModule,

    MatIcon,
    MatCardModule,
    MatDividerModule,
    MatAutocompleteModule,
    MatInputModule,
    MatFormFieldModule,
    MatButtonModule,
    MatDialogModule,
    DragDropModule,
    UmsharedwidgetsModule
  ],
  exports: [
    AuthwizardshellComponent
  ]
})
export class authWizardModule { }

