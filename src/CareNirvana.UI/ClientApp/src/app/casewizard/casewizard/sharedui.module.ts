// shared-ui.module.ts (or shared.module.ts)
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { UiSmartDropdownComponent } from 'src/app/shared/ui/uismartdropdown/uismartdropdown.component';
import { UiDatetimePickerComponent } from 'src/app/shared/ui/uidatetimepicker/uidatetimepicker.component';

@NgModule({
  declarations: [
    UiSmartDropdownComponent,
    UiDatetimePickerComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule
  ],
  exports: [
    UiSmartDropdownComponent,
    UiDatetimePickerComponent
  ]
})
export class SharedUiModule { }
