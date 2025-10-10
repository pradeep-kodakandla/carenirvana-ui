import { Component, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { HeaderService } from '../service/header.service';

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrl: './header.component.css'
})
export class HeaderComponent {

  isHighlighted = false;
  selectedTabId: string | null = null;

  toggleHighlight(): void {
    this.isHighlighted = !this.isHighlighted;
  }

  removeHighlight(): void {
    this.isHighlighted = false;
  }

  searchTerm: string = '';

  constructor(private router: Router, public headerService: HeaderService) {
  }
  onSearch(): void {
    console.log(this.searchTerm); // You can handle the search logic here, e.g., filter a list
  }

  clearSearch(): void {
    this.searchTerm = '';
  }

  goToPage(pageName: string) {
    this.router.navigate([`${pageName}`]);
  }

  goToLogoutPage(pageName: string) {
    this.onLogout();
    this.router.navigate([`${pageName}`]);
  }

  onLogout(): void {
    // 1) clear tabs in memory
    this.headerService.resetTabs();

    // 2) clear any persisted tab state
    // If you use user-scoped keys, you can also wipe all cn_tabs_* just in case.
    Object.keys(sessionStorage)
      .filter(k => k.startsWith('cn_tabs_') || k === 'cn_tabs' || k === 'selectedMemberDetailsId')
      .forEach(k => sessionStorage.removeItem(k));

    // 3) sign out (tokens, user state)
    // this.authService.logout(); // implement this to clear tokens/user

    // 4) navigate to login
    this.router.navigate(['/login']);
  }


  selectTab(tab: { label: string; route: string }): void {
    this.selectedTabId = tab.label;
  }

  //removeTab(tab: { label: string; route: string }): void {
  //  this.headerService.removeTab(tab.route);
  //}

  removeTab(tab: { label: string; route: string }): void {
    const confirmClose = window.confirm(`Are you sure you want to close the "${tab.label}" tab?`);
    if (confirmClose) {
      this.headerService.removeTab(tab.route);
    }
  }


  onAddNewTab(): void {
    const newTabIndex = this.headerService.getTabs().length + 1;
    const newTabLabel = `Member Info ${newTabIndex}`;
    const newTabRoute = `/member-info/${newTabIndex}`;

    // For a blank page, clear the session key so downstream code can branch
    sessionStorage.removeItem('selectedMemberDetailsId');

    this.headerService.addTab(newTabLabel, newTabRoute, '0');
    this.router.navigateByUrl('/', { skipLocationChange: true }).then(() => {
      this.router.navigate([newTabRoute]);
    });
  }

  onTabClick(route: string): void {
    this.headerService.selectTab(route);

    const memberDetailsId = this.headerService.getMemberDetailsId(route);
    console.log('MemberDetailsId for route', route, 'is', memberDetailsId);
    if (memberDetailsId) {
      sessionStorage.setItem('selectedMemberDetailsId', memberDetailsId);
    } else {
      sessionStorage.removeItem('selectedMemberDetailsId');
    }

    const memberId = this.headerService.getMemberId(route) || '';
    this.router.navigateByUrl('/', { skipLocationChange: true }).then(() => {
      this.router.navigate([route], { queryParams: { memberId } });
    });
  }

  columns = [
    {
      sections: [
        { header: 'Search', bodyItems: ['Member', 'Provder', 'Member assignment'] },
        { header: 'Admin', bodyItems: ['User Managmenet', 'Work Basket', 'Security Roles', 'Security Profiles', 'System Configuration'] }
      ]
    },
    {
      sections: [
        { header: 'Configuration', bodyItems: ['Care Managmenet', 'Utilization Management', 'Appeals & Grievances', 'Member Services', 'Config Management', 'Provider Management'] },
        { header: 'Rules Engine', bodyItems: ['Rules Engine Admin', 'Rules Engine Editor'] }
      ]
    },
    {
      sections: [
        { header: 'Settings', bodyItems: ['Add Member', 'Call Tracker'] },
        { header: 'Manage', bodyItems: ['Print Queue', 'Knowledge Library', 'External Links', 'Member Merge', 'User PTO', 'Worklog Manager'] }
      ]
    }
  ];

  isExpanded = false;
  searchQuery = '';

  toggleSearch(): void {

    if (this.isExpanded == true)
      this.isExpanded = false;
    else
      this.isExpanded = true;
  }

  collapseSearch(): void {
    if (!this.searchQuery) {
      this.isExpanded = false;
    }
  }

}
