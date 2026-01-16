import { Component, EventEmitter, Input, Output } from '@angular/core';

export interface AuthWizardStep {
  id: string;          // ex: 'details'
  label: string;       // ex: 'Details'
  route: string;       // ex: 'details'
  disabled?: boolean;
}

@Component({
  selector: 'app-authchevronstepper',
  templateUrl: './authchevronstepper.component.html',
  styleUrls: ['./authchevronstepper.component.css']
})
export class AuthchevronstepperComponent {
  @Input() steps: AuthWizardStep[] = [];
  @Input() activeStepId: string = '';

  @Output() stepSelected = new EventEmitter<AuthWizardStep>();

  clickStep(step: AuthWizardStep): void {
    if (step.disabled) return;
    this.stepSelected.emit(step);
  }
}
