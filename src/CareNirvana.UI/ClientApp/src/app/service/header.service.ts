import { Injectable } from '@angular/core';
import { Router } from '@angular/router';

@Injectable({
  providedIn: 'root'
})
export class HeaderService {
  dynamicTabs: { label: string; route: string; memberId?: string }[] = [];
  selectedTabRoute: string | null = null; // Track selected tab

  addTab(label: string, route: string, memberId: string): void {
    if (!this.dynamicTabs.some(tab => tab.route === route)) {
      this.dynamicTabs.push({ label, route, memberId });
    }
    this.selectTab(route); // Select tab when added
  }

  constructor(private router: Router) { }

  removeTab(route: string): void {
    this.dynamicTabs = this.dynamicTabs.filter(tab => tab.route !== route);

    // ✅ If no tabs remain, redirect to the dashboard
    if (this.dynamicTabs.length === 0) {
      this.selectedTabRoute = null;
      this.router.navigate(['/dash-board']); // Redirect to dashboard
    } else {
      // ✅ If tabs exist, select the first one
      this.selectedTabRoute = this.dynamicTabs[0].route;
      this.router.navigate([this.selectedTabRoute]); // Redirect to the first tab
    }
  }

  getTabs(): { label: string; route: string; memberId?: string }[] {
    return this.dynamicTabs;
  }

  selectTab(route: string): void {
    this.selectedTabRoute = route;
  }

  getSelectedTab(): string | null {
    return this.selectedTabRoute;
  }

  getMemberId(route: string): string | undefined {
    return this.dynamicTabs.find(tab => tab.route === route)?.memberId;
  }
}


