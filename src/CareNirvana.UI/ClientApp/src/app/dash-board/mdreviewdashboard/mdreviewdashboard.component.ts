import { Component, ViewEncapsulation } from '@angular/core';

@Component({
  selector: 'app-mdreviewdashboard',
  templateUrl: './mdreviewdashboard.component.html',
  styleUrl: './mdreviewdashboard.component.css',
  encapsulation: ViewEncapsulation.None,
})
export class MdreviewdashboardComponent {

  auths = [
    {
      memberId: '123456789',
      firstName: 'John',
      lastName: 'Smith',
      authNumber: '0208TSB1N',
      authType: 'Acute',
      facility: 'Hospital Care',
      networkStatus: 'Par',
      dueDate: '08/01/2025 6:00 PM',
      priority: 'High',
      serviceLines: [
        { code: '99213', desc: 'Office Visit', from: '01-01-2025', to: '01-02-2025', req: 4, appr: 0, denied: 0, initial: 'Approved', director: '' }
      ],
      recommendation: 'Approved'
    },
    {
      memberId: '123456788',
      firstName: 'Henry',
      lastName: 'Garcia',
      authNumber: '1209TZBSX',
      authType: 'Hospitalization',
      facility: 'Clinic',
      networkStatus: 'Non-Par',
      dueDate: '08/03/2025 12:00 PM',
      priority: 'Medium',
      serviceLines: [
        { code: '99214', desc: 'Consultation Visit', from: '01-01-2025', to: '01-05-2025', req: 2, appr: 0, denied: 2, initial: 'Denied', director: '' }
      ],
      recommendation: 'Denied'
    }
  ];

  selectedIndex: number | null = null;

  get selectedAuth() {
    return this.selectedIndex !== null ? this.auths[this.selectedIndex] : null;
  }

  onReviewClick(index: number) {
    this.selectedIndex = index;
  }

  onNext() {
    if (this.selectedIndex !== null && this.selectedIndex < this.auths.length - 1) {
      this.selectedIndex++;
    }
  }

  onPrevious() {
    if (this.selectedIndex !== null && this.selectedIndex > 0) {
      this.selectedIndex--;
    }
  }

  isSelected(index: number) {
    return this.selectedIndex === index;
  }

  closeReview() {
    this.selectedIndex = null;
  }
}
