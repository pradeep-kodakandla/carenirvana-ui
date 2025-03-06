import { Component, Input, ViewEncapsulation } from '@angular/core';

@Component({
  selector: 'app-member',
  templateUrl: './member.component.html',
  styleUrl: './member.component.css',
  encapsulation: ViewEncapsulation.None,
})
export class MemberComponent {
  @Input() memberId: string | undefined;

  currentStep = 1;

  setStep(step: number): void {
    this.currentStep = step;
  }

  showAuthorizationComponent = false;

  onAddClick() {
    this.showAuthorizationComponent = true;
  }

  onCancel() {
    this.showAuthorizationComponent = false;
  }

}
