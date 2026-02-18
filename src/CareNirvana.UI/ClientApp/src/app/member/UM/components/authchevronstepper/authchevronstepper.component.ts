import { Component, EventEmitter, Input, Output } from '@angular/core';

export interface AuthWizardStep {
  id: string;          // ex: 'details'
  label: string;       // ex: 'Details'
  route: string;       // ex: 'details'
  disabled?: boolean;

  // Optional (doesn't break existing usage):
  icon?: string;       // material icon name (e.g., 'folder')
  badge?: number | string; // count (e.g., 2)
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

  iconFor(step: AuthWizardStep): string {
    if (step.icon) return step.icon;

    const id = (step.id || '').toLowerCase();
    if (id.includes('detail')) return 'assignment';
    if (id.includes('decision')) return 'task_alt';
    if (id.includes('note')) return 'note_alt';
    if (id.includes('document')) return 'folder';
    if (id.includes('activ')) return 'timeline';
    return 'chevron_right';
  }
}
