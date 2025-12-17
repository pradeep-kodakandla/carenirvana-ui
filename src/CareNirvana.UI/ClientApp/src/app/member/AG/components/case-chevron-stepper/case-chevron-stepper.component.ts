import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CaseStep } from 'src/app/member/AG/components/casewizardshell/casewizardshell.component';

@Component({
  selector: 'caseChevronStepper', // no hyphen
  templateUrl: './case-chevron-stepper.component.html',
  styleUrls: ['./case-chevron-stepper.component.css'],
})
export class CaseChevronStepperComponent {
  @Input() steps: CaseStep[] = [];
  @Input() activeStepId = '';
  @Output() stepSelected = new EventEmitter<CaseStep>();

  clickStep(step: CaseStep) {
    if (step.disabled) return;
    this.stepSelected.emit(step);
  }
}
