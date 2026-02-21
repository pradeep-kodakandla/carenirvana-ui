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

  iconFor(step: CaseStep): string {
    if (step.icon) return step.icon;

    const id = (step.id || '').toLowerCase();
    if (id.includes('detail'))      return 'assignment';
    if (id.includes('disposition')) return 'task_alt';
    if (id.includes('mdreview') || id.includes('md'))  return 'medical_services';
    if (id.includes('activit'))     return 'timeline';
    if (id.includes('note'))        return 'note_alt';
    if (id.includes('document'))    return 'folder';
    if (id.includes('close'))       return 'check_circle';
    return 'chevron_right';
  }
}
