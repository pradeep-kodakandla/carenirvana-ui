import { Component, ViewChild } from '@angular/core';
import { CaseUnsavedChangesAwareService } from 'src/app/member/AG/guards/services/caseunsavedchangesaware.service';
import { CasedetailsComponent } from 'src/app/member/AG/steps/casedetails/casedetails.component';

@Component({
  selector: 'app-casedocuments',
  templateUrl: './casedocuments.component.html',
  styleUrl: './casedocuments.component.css'
})
export class CasedocumentsComponent implements CaseUnsavedChangesAwareService {

  @ViewChild(CasedetailsComponent) details?: CasedetailsComponent;

  caseHasUnsavedChanges(): boolean {
    return this.details?.caseHasUnsavedChanges?.() ?? false;
  }

  // optional: if you want Save button at Notes component level
  save(): void {
    this.details?.save();
  }
}
