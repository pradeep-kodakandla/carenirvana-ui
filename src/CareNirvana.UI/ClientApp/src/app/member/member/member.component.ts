import { Component, Input, ViewEncapsulation } from '@angular/core';

@Component({
  selector: 'app-member',
  templateUrl: './member.component.html',
  styleUrl: './member.component.css',
  encapsulation: ViewEncapsulation.None,
})
export class MemberComponent {
  /*@Input() memberId: string | undefined;*/
  @Input() memberId!: number;
  authNumber: string = '';
  currentStep = 1;

  setStep(step: number): void {
    this.currentStep = step;
  }

  showAuthorizationComponent = false;

  onAddClick(authNumber: string) {
    console.log('Parent Received Auth Number:', authNumber); // ✅ Debugging log
    // If authNumber is received, pass it properly
    if (authNumber) {
      this.authNumber = authNumber;  // Store it
    }
    this.showAuthorizationComponent = true;
  }

  onCancel() {
    this.showAuthorizationComponent = false;
  }

}
