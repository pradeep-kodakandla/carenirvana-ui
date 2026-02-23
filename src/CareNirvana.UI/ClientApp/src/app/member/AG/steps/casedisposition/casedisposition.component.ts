import { Component, Input, ViewChild, AfterViewInit, ViewEncapsulation } from '@angular/core';
import { CasedetailsComponent } from '../casedetails/casedetails.component';

export type WizardMode = 'new' | 'edit';

@Component({
  selector: 'app-casedisposition',
  templateUrl: './casedisposition.component.html',
  styleUrls: ['./casedisposition.component.css'],
  encapsulation: ViewEncapsulation.None,
})
export class CasedispositionComponent implements AfterViewInit {
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

  /** Read-only flag — forwarded from shell for non-latest levels. */
  private _readOnly = false;

  @Input()
  set readOnly(v: boolean) {
    this._readOnly = !!v;
    if (this.detailsComp) this.detailsComp.readOnly = this._readOnly;
  }
  get readOnly(): boolean {
    return this._readOnly;
  }

  setReadOnly(v: boolean): void {
    this.readOnly = v;
  }

  /** Called by shell. Forwards to underlying template-driven renderer. */
  setTemplateId(id: number | string | null | undefined) {
    this.detailsComp?.setTemplateId(id as any);
  }

  async save(): Promise<void> {
    if (this._readOnly) return;
    await this.detailsComp?.save();
  }

  caseHasUnsavedChanges(): boolean {
    return this.detailsComp?.caseHasUnsavedChanges() ?? false;
  }

  hasUnsavedChanges(): boolean {
    return this.caseHasUnsavedChanges();
  }

  /** ✅ Forward validation methods so shell can call them */
  syncFormControlVisibility(): void {
    this.detailsComp?.syncFormControlVisibility?.();
  }

  markVisibleControlsTouched(): void {
    this.detailsComp?.markVisibleControlsTouched?.();
  }

  get form(): any {
    return this.detailsComp?.form ?? null;
  }

  hasValidationErrors(): boolean {
    return this.detailsComp?.hasValidationErrors?.() ?? false;
  }

  scrollToFirstError(): void {
    this.detailsComp?.scrollToFirstError?.();
  }

  /** ✅ Forward shell validation reporter to inner details component */
  set _shellReportValidation(fn: (hasErrors: boolean) => void) {
    if (this.detailsComp) {
      (this.detailsComp as any)._shellReportValidation = fn;
    }
    // Also store it to set on detailsComp when it becomes available (AfterViewInit)
    this.__shellReportFn = fn;
  }
  private __shellReportFn?: (hasErrors: boolean) => void;

  ngAfterViewInit(): void {
    // Forward stored callbacks into the child once it's available
    if (this.__shellReportFn && this.detailsComp) {
      (this.detailsComp as any)._shellReportValidation = this.__shellReportFn;
    }
  }
}
