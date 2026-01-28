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
  // NOTE: keep selection by ROUTE (labels can change after save)
  private selected: string | null = null;


  getTabs(): HeaderTab[] {
    return this.tabs;
  }

  addTab(label: string, route: string, memberId?: string | null, memberDetailsId?: string | null): void {
    const exists = this.tabs.some(t => this.sameRoute(t.route, route));
    if (!exists) {
      this.tabs.push({ label, route: this.cleanRoute(route), memberId: memberId ?? null, memberDetailsId: memberDetailsId ?? null });
    } else {
      // Keep metadata fresh if you re-open with updated IDs
      this.tabs = this.tabs.map(t => this.sameRoute(t.route, route) ? { ...t, memberId, memberDetailsId, label, route: this.cleanRoute(route) } : t);
    }
    this.selectedRoute = this.cleanRoute(route);
  }

  selectTab(route: string): void {
    const cleaned = this.cleanRoute(route);
    this.selectedRoute = cleaned;
    const tab = this.tabs.find(t => this.key(t.route) === this.key(cleaned));
    const mdId = tab?.memberDetailsId ?? null;
    if (mdId) sessionStorage.setItem('selectedMemberDetailsId', mdId);
    else sessionStorage.removeItem('selectedMemberDetailsId');
  }

  getSelectedRoute(): string | null {
    return this.selectedRoute;
  }

  getMemberId(route: string): string | null {
    const cleaned = this.cleanRoute(route);
    return this.tabs.find(t => this.key(t.route) === this.key(cleaned))?.memberId ?? null;
  }

  getMemberDetailsId(route: string): string | null {
    const cleaned = this.cleanRoute(route);
    return this.tabs.find(t => this.key(t.route) === this.key(cleaned))?.memberDetailsId ?? null;
  }


  // header.service.ts
  removeTab(route: string): string | null {
    const cleaned = this.cleanRoute(route);
    const i = this.tabs.findIndex(t => this.key(t.route) === this.key(cleaned));
    if (i === -1) return this.selectedRoute;

    // remove the tab
    this.tabs.splice(i, 1);

    // if we closed the selected tab, pick a neighbor
    if (this.selectedRoute && this.key(this.selectedRoute) === this.key(cleaned)) {
      // try the tab that shifted into the same index (to the right)
      const right = this.tabs[i];
      // else use the left neighbor
      const left = this.tabs[i - 1];
      this.selectedRoute = (right?.route ?? left?.route) ?? null;
    }

    return this.selectedRoute;
  }

  updateTab(oldRoute: string, patch: Partial<HeaderTab>): void {
    const oldKey = this.key(oldRoute);
    const idx = this.tabs.findIndex(t => this.key(t.route) === oldKey);

    if (idx === -1) {
      // Optional: if you meant the selected tab, update that instead
      if (this.selectedRoute) {
        const selIdx = this.tabs.findIndex(t => this.key(t.route) === this.key(this.selectedRoute!));
        if (selIdx !== -1) {
          this.applyPatch(selIdx, patch, oldKey);
        }
      }
      return;
    }

    this.applyPatch(idx, patch, oldKey);
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

  private applyPatch(index: number, patch: Partial<HeaderTab>, oldKey: string): void {
    const current = this.tabs[index];

    // IMPORTANT: Do NOT lowercase the stored route.
    // We only normalize for comparisons; storing a lowercased URL will lower-case route params
    // like Auth# and breaks fetching by authNumber.
    const newRoute = patch.route ? this.cleanRoute(patch.route) : current.route;

    const updated: HeaderTab = {
      ...current,
      ...patch,
      route: newRoute
    };

    // Replace immutably so OnPush UIs update
    this.tabs = this.replaceAt(this.tabs, index, updated);

    // If the updated tab was selected (by old route), move selection to new route
    if (this.selectedRoute && this.key(this.selectedRoute) === oldKey) {
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
    return this.key(a) === this.key(b);
  }

  /**
   * Clean a route for STORAGE (preserve case): strip host, query/hash, decode, strip trailing slash.
   * This prevents authNumber route params from being forced to lowercase.
   */
  private cleanRoute(route: string): string {
    if (!route) return '';
    try {
      const noHost = route.replace(/^https?:\/\/[^/]+/i, '');
      let r = decodeURIComponent(noHost).split('#')[0].split('?')[0];
      r = r.replace(/\/+$/, '');
      return r;
    } catch {
      return route.split('#')[0].split('?')[0].replace(/\/+$/, '');
    }
  }

  /** Normalize for COMPARISON only (case-insensitive). */
  private key(route: string): string {
    return this.cleanRoute(route).toLowerCase();
  }
}



