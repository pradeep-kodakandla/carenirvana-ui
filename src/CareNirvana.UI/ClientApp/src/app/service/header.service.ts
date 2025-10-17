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


  // header.service.ts
  removeTab(route: string): string | null {
    const i = this.tabs.findIndex(t => t.route === route);
    if (i === -1) return this.selectedRoute;

    // remove the tab
    this.tabs.splice(i, 1);

    // if we closed the selected tab, pick a neighbor
    if (this.selectedRoute === route) {
      // try the tab that shifted into the same index (to the right)
      const right = this.tabs[i];
      // else use the left neighbor
      const left = this.tabs[i - 1];
      this.selectedRoute = (right?.route ?? left?.route) ?? null;
    }

    return this.selectedRoute;
  }

  updateTab(oldRoute: string, patch: Partial<HeaderTab>): void {
    const oldR = this.norm(oldRoute);
    const idx = this.tabs.findIndex(t => this.sameRoute(t.route, oldR));

    if (idx === -1) {
      // Optional: if you meant the selected tab, update that instead
      if (this.selectedRoute) {
        const selIdx = this.tabs.findIndex(t => this.sameRoute(t.route, this.selectedRoute!));
        if (selIdx !== -1) {
          this.applyPatch(selIdx, patch, oldR);
        }
      }
      return;
    }

    this.applyPatch(idx, patch, oldR);
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

  // ---- Internal helpers ----------------------------------------------------

  private applyPatch(index: number, patch: Partial<HeaderTab>, oldR: string): void {
    const current = this.tabs[index];

    // Normalize new route if provided; otherwise keep existing
    const newRoute = patch.route ? this.norm(patch.route) : current.route;

    const updated: HeaderTab = {
      ...current,
      ...patch,
      route: newRoute
    };

    // Replace immutably so OnPush UIs update
    this.tabs = this.replaceAt(this.tabs, index, updated);

    // If the updated tab was selected (by old route), move selection to new route
    if (this.selectedRoute && this.sameRoute(this.selectedRoute, oldR)) {
      this.selectTab(newRoute);
    }

    this.persist();
  }

  private replaceAt<T>(arr: T[], index: number, value: T): T[] {
    const copy = arr.slice();
    copy[index] = value;
    return copy;
  }

  private sameRoute(a: string, b: string): boolean {
    return this.norm(a) === this.norm(b);
  }

  /** Normalize: strip host, query/hash, decode, lowercase, strip trailing slash */
  private norm(route: string): string {
    if (!route) return '';
    try {
      const noHost = route.replace(/^https?:\/\/[^/]+/i, '');
      let r = decodeURIComponent(noHost).split('#')[0].split('?')[0];
      r = r.replace(/\/+$/, '');
      return r.toLowerCase();
    } catch {
      return route.toLowerCase().split('#')[0].split('?')[0].replace(/\/+$/, '');
    }
  }
}



