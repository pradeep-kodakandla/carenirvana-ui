//import { Injectable } from '@angular/core';
//import { Router } from '@angular/router';

//@Injectable({
//  providedIn: 'root'
//})
//export class HeaderService {
//  dynamicTabs: { label: string; route: string; memberId?: string; memberDetailsId?: string | null; }[] = [];
//  selectedTabRoute: string | null = null; // Track selected tab

//  addTab(label: string, route: string, memberId: string): void {
//    if (!this.dynamicTabs.some(tab => tab.route === route)) {
//      this.dynamicTabs.push({ label, route, memberId });
//    }
//    this.selectTab(route); // Select tab when added
//  }

//  constructor(private router: Router) { }

//  removeTab(route: string): void {
//    this.dynamicTabs = this.dynamicTabs.filter(tab => tab.route !== route);

//    // ✅ If no tabs remain, redirect to the dashboard
//    if (this.dynamicTabs.length === 0) {
//      this.selectedTabRoute = null;
//      this.router.navigate(['/dashboard']); // Redirect to dashboard
//    } else {
//      // ✅ If tabs exist, select the first one
//      this.selectedTabRoute = this.dynamicTabs[0].route;
//      this.router.navigate([this.selectedTabRoute]); // Redirect to the first tab
//    }
//  }

//  getTabs(): { label: string; route: string; memberId?: string }[] {
//    return this.dynamicTabs;
//  }

//  selectTab(route: string): void {
//    this.selectedTabRoute = route;
//  }

//  getSelectedTab(): string | null {
//    return this.selectedTabRoute;
//  }

//  getMemberId(route: string): string | undefined {
//    return this.dynamicTabs.find(tab => tab.route === route)?.memberId;
//  }

//  updateTab(oldRoute: string, newTab: { label: string; route: string; memberId: string }) {
//    const index = this.dynamicTabs.findIndex(t => t.route === oldRoute);
//    if (index !== -1) {
//      this.dynamicTabs[index] = newTab;
//    }
//  }


//}

// header.service.ts
import { Injectable } from '@angular/core';

export interface HeaderTab {
  label: string;
  route: string;
  memberId?: string | null;
  memberDetailsId?: string | null;
  // you can add other fields later (e.g., icon, closable, etc.)
}

@Injectable({ providedIn: 'root' })
export class HeaderService {
  private tabs: HeaderTab[] = [];
  private selectedRoute: string | null = null;
  private selected: string | null = null;

  getTabs(): HeaderTab[] {
    return this.tabs;
  }

  addTab(label: string, route: string, memberId?: string | null, memberDetailsId?: string | null): void {
    const exists = this.tabs.some(t => t.route === route);
    if (!exists) {
      this.tabs.push({ label, route, memberId: memberId ?? null, memberDetailsId: memberDetailsId ?? null });
    } else {
      // Keep metadata fresh if you re-open with updated IDs
      this.tabs = this.tabs.map(t => t.route === route ? { ...t, memberId, memberDetailsId, label } : t);
    }
    this.selectedRoute = route;
  }

  //selectTab(route: string): void {
  //  this.selectedRoute = route;
  //}
  selectTab(route: string): void {
    this.selectedRoute = route;
    const tab = this.tabs.find(t => t.route === route);
    const mdId = tab?.memberDetailsId ?? null;
    if (mdId) sessionStorage.setItem('selectedMemberDetailsId', mdId);
    else sessionStorage.removeItem('selectedMemberDetailsId');
  }

  getSelectedRoute(): string | null {
    return this.selectedRoute;
  }

  getMemberId(route: string): string | null {
    return this.tabs.find(t => t.route === route)?.memberId ?? null;
  }

  getMemberDetailsId(route: string): string | null {
    return this.tabs.find(t => t.route === route)?.memberDetailsId ?? null;
  }

  // Optional helpers if you support closing tabs, renaming, etc.
  removeTab(route: string): void {
    this.tabs = this.tabs.filter(t => t.route !== route);
    if (this.selectedRoute === route) this.selectedRoute = this.tabs.at(-1)?.route ?? null;
  }


  updateTab(oldRoute: string, newTab: { label: string; route: string; memberId: string }) {
    const index = this.tabs.findIndex(t => t.route === oldRoute);
    if (index !== -1) {
      this.tabs[index] = newTab;
    }
  }

  getSelectedTab(): string | null {
    return this.selectedRoute;
  }


  resetTabs() {
    this.tabs = [];
    this.selected = null;
    this.persist(); // writes empty state for current user
  }

  private persist(): void {
    const state = { tabs: this.tabs, selected: this.selected };
    //sessionStorage.setItem(this.key(), JSON.stringify(state));
  }
}


