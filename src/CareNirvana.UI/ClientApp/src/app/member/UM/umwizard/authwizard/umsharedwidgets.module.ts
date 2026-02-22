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
import { MatDialogModule } from '@angular/material/dialog';

// UM step components you want to reuse outside the wizard
import { AuthdetailsComponent } from 'src/app/member/UM/steps/authdetails/authdetails.component';
import { AuthnotesComponent } from 'src/app/member/UM/steps/authnotes/authnotes.component';
import { AuthdocumentsComponent } from 'src/app/member/UM/steps/authdocuments/authdocuments.component';
import { AuthactivityComponent } from 'src/app/member/UM/steps/authactivity/authactivity.component';
import { AuthmdreviewComponent } from 'src/app/member/UM/steps/authmdreview/authmdreview.component';
import { ProviderDetailsComponent } from 'src/app/member/UM/components/authwizardshell/provider-details.component';

@NgModule({
  declarations: [
    AuthdetailsComponent,
    AuthnotesComponent,
    AuthdocumentsComponent,
    AuthactivityComponent,
    AuthmdreviewComponent,
    ProviderDetailsComponent
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
    MatDialogModule,
  ],
  exports: [
    AuthdetailsComponent,
    AuthnotesComponent,
    AuthdocumentsComponent,
    AuthactivityComponent,
    AuthmdreviewComponent,
    ProviderDetailsComponent
  ]
})
export class UmsharedwidgetsModule { }
