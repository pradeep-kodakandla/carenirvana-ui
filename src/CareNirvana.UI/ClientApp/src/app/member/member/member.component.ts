import { Component, Input, ViewEncapsulation } from '@angular/core';
import { RolepermissionService } from 'src/app/service/rolepermission.service';
import { ActivatedRoute, Router } from '@angular/router';
import { MemberService } from 'src/app/service/shared-member.service';

// ─── Tabs that force the left sidebar into collapsed mode ───────────────────
const COLLAPSE_TABS = new Set(['Authorization', 'Complaints']);

interface DashboardWidget {
  key: string;
  defaultLabel: string;
  customLabel: string;
  enabled: boolean;
}
interface PermissionConfig {
  modules?: any[];
  dashboardWidgets?: {
    widgets: DashboardWidget[];
    defaultWidget: string;
  };
}

@Component({
  selector: 'app-member',
  templateUrl: './member.component.html',
  styleUrl: './member.component.css',
  encapsulation: ViewEncapsulation.None,
})
export class MemberComponent {
  @Input() memberId!: number;
  authNumber = '';
  currentStep = 1;
  roleConfig: PermissionConfig = {};
  mainTabs: any[] = [];
  showAuthorizationComponent = false;

  activeMainTabIndex = 0;
  activeChildTabIndex: { [tabName: string]: number } = {};

  constructor(
    private roleService: RolepermissionService,
    private route: ActivatedRoute,
    private router: Router,
    private shared: MemberService
  ) {}

  ngOnInit(): void {
    const loggedInUserId = Number(sessionStorage.getItem('loggedInUserid'));
    const roleId = Number(this.getRoleIdByUserId(loggedInUserId));

    this.fetchRoleData(roleId);
    this.route.parent?.paramMap.subscribe(params => {
      this.memberId = Number(params.get('id')!);
      this.restoreTabState();
    });
  }

  private getRoleIdByUserId(userId: number): number | null {
    const userRoleMap: { [key: number]: number } = {
      3: 4,
      2: 5,
      1: 4,
      4: 7,
      5: 6,
      6: 5
    };

    return userRoleMap[userId] ?? null;
  }
  // ─── Tab state persistence ──────────────────────────────────────────────────

  private tabStateKey(): string {
    return `member_tab_state_${this.memberId}`;
  }

  private saveTabState(): void {
    const state = {
      mainIndex: this.activeMainTabIndex,
      childIndices: this.activeChildTabIndex
    };
    sessionStorage.setItem(this.tabStateKey(), JSON.stringify(state));
  }

  /**
   * Restores persisted tab selection for this member.
   *
   * FIX — sidebar default behaviour:
   *   • No saved state (fresh open or after header-tab removal):
   *     reset to index 0 and EXPAND the sidebar.
   *   • Saved state found: restore the index and derive sidebar state from
   *     whether the restored tab is in COLLAPSE_TABS.
   *
   * Result:
   *   - Remove a header tab then re-open the same member → first tab selected,
   *     sidebar expanded (no stale selection).
   *   - Switch away and back to a member that was on Authorization →
   *     sidebar stays collapsed, Authorization tab re-selected.
   */
  private restoreTabState(): void {
    const raw = sessionStorage.getItem(this.tabStateKey());

    if (!raw) {
      // Fresh open (or post-removal): reset everything and expand sidebar
      this.activeMainTabIndex = 0;
      this.activeChildTabIndex = {};
      this.shared.setIsCollapse(false);
      return;
    }

    try {
      const state = JSON.parse(raw);
      this.activeMainTabIndex = state.mainIndex ?? 0;
      this.activeChildTabIndex = state.childIndices ?? {};

      // Derive sidebar collapse from the restored active tab name.
      // NOTE: getOrderedMainTabs() must be called after buildTabsFromRoleConfig()
      // populates mainTabs — restoreTabState() is always called from there.
      const tabs = this.getOrderedMainTabs();
      const activeTab = tabs[this.activeMainTabIndex];
      const shouldCollapse = activeTab ? COLLAPSE_TABS.has(activeTab.name) : false;
      this.shared.setIsCollapse(shouldCollapse);
    } catch {
      // Corrupt data — treat as fresh open
      this.activeMainTabIndex = 0;
      this.activeChildTabIndex = {};
      this.shared.setIsCollapse(false);
    }
  }

  /**
   * Called when a main tab button is clicked.
   * Collapses the sidebar for Authorization / Complaints; expands for all others.
   */
  setActiveMainTab(index: number): void {
    this.activeMainTabIndex = index;
    this.saveTabState();

    const tabs = this.getOrderedMainTabs();
    const tabName = tabs[index]?.name ?? '';
    this.shared.setIsCollapse(COLLAPSE_TABS.has(tabName));
  }

  setActiveChildTab(tabName: string, index: number): void {
    this.activeChildTabIndex = { ...this.activeChildTabIndex, [tabName]: index };
    this.saveTabState();
  }

  getActiveChildTabIndex(tabName: string): number {
    return this.activeChildTabIndex[tabName] ?? 0;
  }

  // ─── Role / config ──────────────────────────────────────────────────────────

  fetchRoleData(roleId: number): void {
    this.roleService.getRoleById(roleId).subscribe((role: any) => {
      const rawPermissions = role.Permissions || role.permissions;

      this.roleConfig = typeof rawPermissions === 'string'
        ? JSON.parse(rawPermissions)
        : rawPermissions;

      sessionStorage.setItem('rolePermissionsJson', JSON.stringify(this.roleConfig.modules));

      this.buildTabsFromRoleConfig();
    });
  }

  buildTabsFromRoleConfig(): void {
    this.mainTabs = [];

    this.roleConfig.modules?.forEach((module: any) => {
      (module.featureGroups || []).forEach((group: any) => {
        this.mainTabs.push({
          name: group.featureGroupName,
          displayOrder: group.displayOrder,
          pages: group.pages || []
        });
      });
    });

    // restoreTabState() is called here (after mainTabs is populated) so that
    // getOrderedMainTabs() returns the real list when looking up the active tab name.
    this.restoreTabState();
  }

  // ─── Misc ───────────────────────────────────────────────────────────────────

  setStep(step: number): void {
    this.currentStep = step;
  }

  onAddClick(authNumber: string): void {
    if (authNumber) this.authNumber = authNumber;
    this.showAuthorizationComponent = false;
  }

  onCancel(): void {
    this.showAuthorizationComponent = false;
  }

  getSafeId(name: string): string {
    return name.replace(/\s+/g, '-').toLowerCase();
  }

  private orderByDisplayThenName<T extends { displayOrder?: number; name?: string }>(a: T, b: T): number {
    const ao = a.displayOrder ?? Number.POSITIVE_INFINITY;
    const bo = b.displayOrder ?? Number.POSITIVE_INFINITY;
    if (ao !== bo) return ao - bo;
    const an = (a.name ?? '').toLocaleLowerCase();
    const bn = (b.name ?? '').toLocaleLowerCase();
    if (an && bn) return an.localeCompare(bn);
    return 0;
  }

  getOrderedMainTabs(): Array<{ name: string; pages: any[]; displayOrder?: number }> {
    return Array.isArray(this.mainTabs)
      ? [...this.mainTabs].sort((a, b) => this.orderByDisplayThenName(a, b))
      : [];
  }

  getOrderedPages(tab: { pages?: Array<{ name: string; displayOrder?: number }> }): Array<{ name: string; displayOrder?: number }> {
    return Array.isArray(tab?.pages)
      ? [...tab.pages].sort((a, b) => this.orderByDisplayThenName(a, b))
      : [];
  }
}
