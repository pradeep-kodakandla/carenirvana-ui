import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

// Reuse whatever your UM step components already expect (smart dropdown, etc.)
import { SharedUiModule } from 'src/app/casewizard/casewizard/sharedui.module';

// Material (safe superset for dashboard embedding)
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatTableModule } from '@angular/material/table';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { DragDropModule } from '@angular/cdk/drag-drop';

// Case step components you want to reuse outside the wizard
import { CaseactivitiesComponent } from 'src/app/member/AG/steps/caseactivities/caseactivities.component';
import { CasenotesComponent } from 'src/app/member/AG/steps/casenotes/casenotes.component';
import { CasedocumentsComponent } from 'src/app/member/AG/steps/casedocuments/casedocuments.component';
import { ClaimDetailsComponent } from 'src/app/member/AG/components/casewizardshell/claim-details.component';
import { AuthorizationDetailsComponent } from 'src/app/member/AG/components/casewizardshell/authorization-details.component';

@NgModule({
  declarations: [
    CaseactivitiesComponent,
    CasenotesComponent,
    CasedocumentsComponent,
    ClaimDetailsComponent,
    AuthorizationDetailsComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    SharedUiModule,

    // material deps that these step components commonly use
    MatCardModule,
    MatDividerModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatFormFieldModule,
    MatInputModule,
    MatTooltipModule,
    MatTableModule,
    MatAutocompleteModule,
    DragDropModule,
  ],
  exports: [
    CaseactivitiesComponent,
    CasenotesComponent,
    CasedocumentsComponent,
    ClaimDetailsComponent,
    AuthorizationDetailsComponent
  ]
})
export class CasesharedwidgetsModule { }
