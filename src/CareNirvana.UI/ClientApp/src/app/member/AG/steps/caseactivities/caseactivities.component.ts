import { Component, ViewChild } from '@angular/core';
import { CaseUnsavedChangesAwareService } from 'src/app/member/AG/guards/services/caseunsavedchangesaware.service';
import { CasedetailsComponent } from 'src/app/member/AG/steps/casedetails/casedetails.component';

@Component({
  selector: 'app-caseactivities',
  templateUrl: './caseactivities.component.html',
  styleUrl: './caseactivities.component.css'
})
export class CaseactivitiesComponent implements CaseUnsavedChangesAwareService {

  @ViewChild(CasedetailsComponent) details?: CasedetailsComponent;

  caseHasUnsavedChanges(): boolean {
    return this.details?.caseHasUnsavedChanges?.() ?? false;
  }

  hasUnsavedChanges(): boolean {
    return this.caseHasUnsavedChanges();
  }

  // optional: if you want Save button at Notes component level
  save(): void {
    this.details?.save();
  }
}
