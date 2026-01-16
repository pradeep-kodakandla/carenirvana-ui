import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatInputModule } from '@angular/material/input';
import { MatCardModule } from '@angular/material/card';
import { MatMenuModule } from '@angular/material/menu';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTableModule } from '@angular/material/table';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSelectModule } from '@angular/material/select';
import { MatOptionModule } from '@angular/material/core';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations'
import { CdkDrag, CdkDropList } from '@angular/cdk/drag-drop';

import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatListModule } from '@angular/material/list';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatSortModule } from '@angular/material/sort';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatTabsModule } from '@angular/material/tabs';
import { MatGridListModule } from '@angular/material/grid-list';
import { MatSidenavModule } from '@angular/material/sidenav';

import { BaseChartDirective } from 'ng2-charts';
import { MatBadgeModule } from '@angular/material/badge';

import { MatMenu } from '@angular/material/menu';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { MatMenuTrigger } from '@angular/material/menu';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';

import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatStepperModule } from '@angular/material/stepper';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialogModule } from '@angular/material/dialog';
import { MatSnackBarModule } from '@angular/material/snack-bar';

import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatRadioModule } from '@angular/material/radio';

import { DragDropModule } from '@angular/cdk/drag-drop';
import { MatAccordion } from '@angular/material/expansion';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';


@NgModule({
  declarations: [],
  imports: [
    CommonModule, MatFormFieldModule,
    FormsModule,
    MatToolbarModule,
    MatInputModule,
    MatCardModule,
    MatMenuModule,
    MatIconModule,
    MatButtonModule,
    MatTableModule,
    MatSlideToggleModule,
    MatSelectModule,
    MatOptionModule,
    BrowserAnimationsModule,
    MatChipsModule,
    CdkDropList, CdkDrag,
    MatDividerModule,
    MatListModule,
    MatFormFieldModule, MatInputModule,
    MatTableModule, MatSortModule, MatPaginatorModule,
    MatExpansionModule,
    MatTabsModule,
    MatGridListModule,
    MatSidenavModule,
    BaseChartDirective, MatBadgeModule, MatButtonToggleModule, MatAutocompleteModule, MatCheckboxModule, MatStepperModule, MatTooltipModule, MatDialogModule,
    MatSnackBarModule, MatDatepickerModule, MatNativeDateModule, MatRadioModule, DragDropModule, MatAccordion, MatProgressSpinnerModule, 
  ],
  exports: [MatFormFieldModule, 
    FormsModule,
    MatToolbarModule,
    MatInputModule,
    MatCardModule,
    MatMenuModule,
    MatIconModule,
    MatButtonModule,
    MatTableModule,
    MatSlideToggleModule,
    MatSelectModule,
    MatOptionModule,
    BrowserAnimationsModule,
    MatChipsModule,
    CdkDropList, CdkDrag,
    MatDividerModule,
    MatListModule,
    MatFormFieldModule, MatInputModule,
    MatTableModule, MatSortModule, MatPaginatorModule,
    MatExpansionModule,
    MatTabsModule,
    MatGridListModule,
    MatSidenavModule, BaseChartDirective, MatBadgeModule, MatButtonToggleModule, MatAutocompleteModule, MatCheckboxModule, MatStepperModule, MatTooltipModule, MatDialogModule,
    MatSnackBarModule, MatDatepickerModule, MatNativeDateModule, MatRadioModule, DragDropModule, MatAccordion, MatProgressSpinnerModule, 
  ]
})
export class AngularMaterialModule { }
