// shared-ui.module.ts (or shared.module.ts)
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { UiSmartDropdownComponent } from 'src/app/shared/ui/uismartdropdown/uismartdropdown.component';
import { UiDatetimePickerComponent } from 'src/app/shared/ui/uidatetimepicker/uidatetimepicker.component';
import { UiSmartLookupComponent } from 'src/app/shared/ui/uismartlookup/uismartlookup.component';


@NgModule({
  declarations: [
    UiSmartDropdownComponent,
    UiDatetimePickerComponent,
    UiSmartLookupComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule
  ],
  exports: [
    UiSmartDropdownComponent,
    UiDatetimePickerComponent,
    UiSmartLookupComponent
  ]
})
export class SharedUiModule { }
