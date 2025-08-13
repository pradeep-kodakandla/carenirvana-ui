import { Component, ViewEncapsulation } from '@angular/core';
import { AuthService } from 'src/app/service/auth.service';

@Component({
  selector: 'app-mdreviewdashboard',
  templateUrl: './mdreviewdashboard.component.html',
  styleUrl: './mdreviewdashboard.component.css',
  encapsulation: ViewEncapsulation.None,
})
export class MdreviewdashboardComponent {

  selectedAuthData: any = {};
  constructor(
    private authService: AuthService
  ) { }

  ngonInit(): void {
    this.authService.getAuthDataByAuthNumber('TCZBGT7Y3').subscribe(
      (data) => {
        this.auths = data;
        this.selectedAuthData = data[0]?.responseData; // default selection
      });
  }


  // Summary widgets
  summaryStats = [
    { label: 'Urgent Auths', value: 65, icon: 'assignment_ind' },
    { label: 'Pending Reviews', value: 20, icon: 'priority_high' },
    { label: 'Reviewed Today', value: 5, icon: 'report_problem' },
    { label: 'Over Due', value: 40, icon: 'check_circle' }
  ];


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

  searchText: string = '';

  filteredAuths(): any[] {
    if (!this.searchText) return this.auths;
    const lower = this.searchText.toLowerCase();
    return this.auths.filter(auth =>
      (auth.firstName + ' ' + auth.lastName).toLowerCase().includes(lower) ||
      (auth.authNumber || '').toLowerCase().includes(lower)
    );
  }

  onSearch(event: any): void {
    const filterValue = event.target.value.trim().toLowerCase();

  }

}
