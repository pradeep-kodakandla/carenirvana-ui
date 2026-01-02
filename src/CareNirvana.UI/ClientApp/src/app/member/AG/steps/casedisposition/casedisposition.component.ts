import { Component, Input, ViewChild } from '@angular/core';
import { CasedetailsComponent } from '../casedetails/casedetails.component';

export type WizardMode = 'new' | 'edit';

@Component({
  selector: 'app-casedisposition',
  templateUrl: './casedisposition.component.html'
})
export class CasedispositionComponent {
  @ViewChild(CasedetailsComponent) private detailsComp?: CasedetailsComponent;

  private _wizardMode: WizardMode = 'new';

  @Input()
  set wizardMode(v: WizardMode) {
    this._wizardMode = v ?? 'new';
    if (this.detailsComp) this.detailsComp.wizardMode = this._wizardMode;
  }
  get wizardMode(): WizardMode {
    return this._wizardMode;
  }

  /** Called by shell. Forwards to underlying template-driven renderer. */
  setTemplateId(id: number | string | null | undefined) {
    this.detailsComp?.setTemplateId(id as any);
  }

  async save(): Promise<void> {
    await this.detailsComp?.save();
  }

  caseHasUnsavedChanges(): boolean {
    return this.detailsComp?.caseHasUnsavedChanges() ?? false;
  }

  hasUnsavedChanges(): boolean {
    return this.caseHasUnsavedChanges();
  }
}
