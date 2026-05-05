import { Component, OnInit, OnDestroy, EventEmitter, Output } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter, takeUntil } from 'rxjs/operators';
import { Subject } from 'rxjs';
import { HeaderService } from '../service/header.service';
import { AuthenticateService, Last24hCounts } from 'src/app/service/authentication.service';
import { MemberService } from 'src/app/service/shared-member.service';
import { MemberSummary } from 'src/app/service/dashboard.service.service';
import { MembersearchComponent } from 'src/app/member/membersearch/membersearch.component';
import { MatMenuTrigger } from '@angular/material/menu';

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrl: './header.component.css'
})
export class HeaderComponent implements OnInit, OnDestroy {

  private destroy$ = new Subject<void>();

  isHighlighted = false;
  selectedTabId: string | null = null;
  items: any[] = [];
  isExpanded = false;
  searchQuery = '';
  searchTerm = '';
  isHistoryLoading = false;

  accessCounts: { members: number; auths: number; complaints: number } = {
    members: 0,
    auths: 0,
    complaints: 0
  };

  /** Active filter for the recently-accessed table. 'all' = show everything. */
  activeAccessFilter: 'all' | 'members' | 'auths' | 'complaints' = 'all';

  /** Items currently shown in the table after applying activeAccessFilter. */
  filteredItems: any[] = [];

  selectedMemberDetailsId: number | null = null;
  careStaffOptions: { value: number; label: string }[] = [];

  private lastHistoryFetch = 0;
  private readonly HISTORY_THROTTLE_MS = 2000;
  private historyCloseTimer: any = null;

  @Output() addClicked = new EventEmitter<string>();

  constructor(
    private router: Router,
    public headerService: HeaderService,
    public authService: AuthenticateService,
    public memberService: MemberService
  ) {}

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  ngOnInit(): void {
    const userId = Number(sessionStorage.getItem('loggedInUserid')) || 0;
    this.loadRecentlyAccessed(userId);
    this.loadAccessCounts(userId);

    this.selectedTabId = this.headerService.getSelectedTab() || this.router.url.split('?')[0];

    this.router.events
      .pipe(
        filter(e => e instanceof NavigationEnd),
        takeUntil(this.destroy$)
      )
      .subscribe(() => {
        this.selectedTabId = this.headerService.getSelectedTab() || this.router.url.split('?')[0];
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.historyCloseTimer) {
      clearTimeout(this.historyCloseTimer);
    }
  }

  // ─── Data loading ───────────────────────────────────────────────────────────

  loadRecentlyAccessed(userId: number): void {
    const from = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const to = new Date().toISOString();

    this.authService.getRecentlyAccessed(userId, from, to, 50, 0)
      .subscribe({
        next: (res) => {
          this.items = Array.isArray(res) && res.length > 0 ? res : [];
          this.applyAccessFilter();
          if (!this.items.length) {
            console.warn('No recently accessed records found for userId:', userId);
          }
        },
        error: (err) => {
          console.error('Error loading recently accessed:', err);
          this.items = [];
          this.applyAccessFilter();
        }
      });
  }

  loadAccessCounts(userId: number): void {
    this.authService.getRecentlyAccessedCounts(userId).subscribe({
      next: (res) => {
        this.accessCounts = {
          members: res?.memberAccessCount ?? 0,
          auths: res?.authorizationAccessCount ?? 0,
          complaints: res?.complaintAccessCount ?? 0
        };
      },
      error: (err) => {
        console.error('Error fetching access counts:', err);
        this.accessCounts = { members: 0, auths: 0, complaints: 0 };
      }
    });
  }

  // ─── Recently-accessed filter ───────────────────────────────────────────────

  /** Total accessed in last 24h — used as the count for the 'All' chip. */
  get totalAccessCount(): number {
    return (this.accessCounts?.members || 0)
         + (this.accessCounts?.auths || 0)
         + (this.accessCounts?.complaints || 0);
  }

  /**
   * Selects a chip filter on the recently-accessed table.
   * 'all' shows everything; the other values filter to that category.
   */
  setAccessFilter(type: 'all' | 'members' | 'auths' | 'complaints'): void {
    this.activeAccessFilter = type;
    this.applyAccessFilter();
  }

  /**
   * Inline style for a chip — visibly highlights the selected one and
   * dims the rest. Works without depending on external CSS.
   */
  chipStyle(type: 'all' | 'members' | 'auths' | 'complaints'): { [k: string]: any } {
    const isActive = this.activeAccessFilter === type;
    return {
      cursor: 'pointer',
      outline: isActive ? '2px solid #1976d2' : '2px solid transparent',
      'outline-offset': '2px',
      opacity: isActive ? 1 : 0.55,
      'font-weight': isActive ? 600 : 'normal',
      'box-shadow': isActive ? '0 1px 4px rgba(25, 118, 210, 0.35)' : 'none',
      transition: 'outline 0.15s ease, opacity 0.15s ease, box-shadow 0.15s ease'
    };
  }

  /**
   * Recomputes filteredItems based on activeAccessFilter.
   * Classification uses the id fields on each access record:
   *   - auth access     → has authDetailId
   *   - complaint/case  → has complaintDetailId
   *   - member access   → has neither
   */
  private applyAccessFilter(): void {
    if (this.activeAccessFilter === 'all') {
      this.filteredItems = [...this.items];
      return;
    }

    this.filteredItems = this.items.filter(it => {
      const hasAuth = it?.authDetailId != null && Number(it.authDetailId) !== 0;
      const hasComplaint = it?.complaintDetailId != null && Number(it.complaintDetailId) !== 0;

      switch (this.activeAccessFilter) {
        case 'auths':      return hasAuth;
        case 'complaints': return hasComplaint;
        case 'members':    return !hasAuth && !hasComplaint;
        default:           return true;
      }
    });
  }

  // ─── Member search ──────────────────────────────────────────────────────────

  onMemberSearchIconClick(comp: MembersearchComponent): void {
    if (comp) {
      comp.resetSearch();
    }
  }

  onHeaderMemberSelected(member: MemberSummary | null, trigger: MatMenuTrigger): void {
    if (!member) return;
    this.openMemberTab(member.memberId, `${member.firstName} ${member.lastName}`, member.memberDetailsId);
    if (trigger) {
      trigger.closeMenu();
    }
  }

  // ─── Search ─────────────────────────────────────────────────────────────────

  onSearch(): void {}

  clearSearch(): void {
    this.searchTerm = '';
  }

  toggleSearch(): void {
    this.isExpanded = !this.isExpanded;
  }

  collapseSearch(): void {
    if (!this.searchQuery) {
      this.isExpanded = false;
    }
  }

  // ─── Navigation ─────────────────────────────────────────────────────────────

  goToPage(pageName: string): void {
    this.router.navigate([`${pageName}`]);
  }

  goToLogoutPage(pageName: string): void {
    this.onLogout();
    this.router.navigate([`${pageName}`]);
  }

  onLogout(): void {
    this.headerService.resetTabs();
    Object.keys(sessionStorage)
      .filter(k =>
        k.startsWith('cn_tabs_') ||
        k === 'cn_tabs' ||
        k === 'selectedMemberDetailsId' ||
        k.startsWith('member_tab_state_')   // FIX: also wipe all tab-state keys on logout
      )
      .forEach(k => sessionStorage.removeItem(k));
    this.router.navigate(['/login']);
  }

  // ─── Tab management ─────────────────────────────────────────────────────────

  selectTab(tab: { label: string; route: string }): void {
    this.selectedTabId = tab.route;
    this.headerService.selectTab(tab.route);
  }

  /**
   * Removes a tab.
   * FIX: also clears the persisted member-component tab-selection state
   * (member_tab_state_{memberId}) so that if the same member is re-opened
   * it starts fresh at the first tab rather than restoring the old selection.
   */
  removeTab(tab: { label: string; route: string }, event: Event): void {
    event.stopPropagation();

    const confirmClose = window.confirm(`Are you sure you want to close the "${tab.label}" tab?`);
    if (!confirmClose) return;

    // ── FIX: clear persisted inner-tab state for this member ──────────────────
    // Routes follow the pattern /member-info/{memberId} or
    // /member-info/{memberId}/auth/... — extract memberId from segment [2].
    const routeSegments = tab.route.split('/').filter(Boolean);
    // routeSegments[0] = 'member-info', routeSegments[1] = memberId
    if (routeSegments[0] === 'member-info' && routeSegments[1]) {
      const memberId = routeSegments[1];
      sessionStorage.removeItem(`member_tab_state_${memberId}`);
    }

    const tabs = this.headerService.getTabs();
    const removedIndex = tabs.findIndex(t => t.route === tab.route);
    const isActiveTab = tab.route === this.selectedTabId;

    this.headerService.removeTab(tab.route);

    if (!isActiveTab) {
      return;
    }

    const remainingTabs = this.headerService.getTabs();

    if (remainingTabs.length === 0) {
      this.selectedTabId = null;
      this.router.navigate(['/dashboard']);
      return;
    }

    const targetIndex = removedIndex > 0 ? removedIndex - 1 : 0;
    const targetTab = remainingTabs[Math.min(targetIndex, remainingTabs.length - 1)];
    this.onTabClick(targetTab.route);
  }

  onAddNewTab(): void {
    const uniqueId = Date.now();
    const newTabLabel = `New Member`;
    const newTabRoute = `/member-info/new-${uniqueId}`;

    sessionStorage.removeItem('selectedMemberDetailsId');

    this.headerService.addTab(newTabLabel, newTabRoute, '0');
    this.router.navigateByUrl('/', { skipLocationChange: true }).then(() => {
      this.selectedTabId = newTabRoute;
      this.router.navigateByUrl(newTabRoute);
    });
  }

  onTabClick(route: string): void {
    this.selectedTabId = route;

    if (route.includes('member-auth')) {
      this.memberService.setIsCollapse(true);
    } else {
      this.memberService.setIsCollapse(false);
    }

    this.headerService.selectTab(route);

    const memberDetailsId = this.headerService.getMemberDetailsId(route);
    const mdNum = Number(memberDetailsId || 0);

    if (mdNum > 0) {
      sessionStorage.setItem('selectedMemberDetailsId', String(mdNum));
    } else {
      sessionStorage.removeItem('selectedMemberDetailsId');
    }

    const memberId = this.headerService.getMemberId(route) || '';
    const target = route?.startsWith('/') ? route : `/${route}`;

    this.router.navigateByUrl('/', { skipLocationChange: true }).then(() => {
      const tree = this.router.parseUrl(target);
      tree.queryParams = { ...(tree.queryParams ?? {}), memberId };
      this.router.navigateByUrl(tree);
    });
  }

  // ─── Open tab helpers ────────────────────────────────────────────────────────

  openMemberTab(memberId: string, memberName: string, memberDetailsId?: number): void {
    const tabLabel = `Member: ${memberName}`;
    const tabRoute = `/member-info/${memberId}`;

    const existingTab = this.headerService.getTabs().find(tab => tab.route === tabRoute);
    if (!existingTab) {
      this.headerService.addTab(tabLabel, tabRoute, memberId, memberDetailsId ? String(memberDetailsId) : null);
    }

    if (memberDetailsId != null) {
      sessionStorage.setItem('selectedMemberDetailsId', String(memberDetailsId));
    }

    this.onTabClick(tabRoute);
  }

  openAuthTab(authNumber: string, memberId: string, memberDetailsId?: number): void {
    this.addClicked.emit(authNumber);

    if (!authNumber) authNumber = 'DRAFT';

    const tabRoute = `/member-info/${memberId}/auth/${authNumber}/details`;
    const tabLabel = `Auth # ${authNumber}`;

    const existingTab = this.headerService.getTabs().find(t => t.route === tabRoute);
    if (!existingTab) {
      this.headerService.addTab(tabLabel, tabRoute, String(memberId), memberDetailsId ? String(memberDetailsId) : null);
    } else {
      this.headerService.updateTab(tabRoute, { label: tabLabel, route: tabRoute });
    }

    if (memberDetailsId != null) {
      sessionStorage.setItem('selectedMemberDetailsId', String(memberDetailsId));
    }

    this.onTabClick(tabRoute);
  }

  /**
   * Opens (or focuses) a Case tab from the recently-accessed history.
   * Mirrors the route format used by membercasedetails.openCaseTab:
   *   /member-info/{memberId}/case/{caseNumber}/details
   */
  openCaseTab(caseNumber: string, memberId: string, memberDetailsId?: number): void {
    if (!caseNumber) caseNumber = 'DRAFT';

    const tabRoute = `/member-info/${memberId}/case/${caseNumber}/details`;
    const tabLabel = `Case # ${caseNumber}`;

    const existingTab = this.headerService.getTabs().find(t => t.route === tabRoute);
    if (!existingTab) {
      this.headerService.addTab(tabLabel, tabRoute, String(memberId), memberDetailsId ? String(memberDetailsId) : null);
    } else {
      this.headerService.updateTab(tabRoute, { label: tabLabel, route: tabRoute });
    }

    if (memberDetailsId != null) {
      sessionStorage.setItem('selectedMemberDetailsId', String(memberDetailsId));
    }

    this.onTabClick(tabRoute);
  }

  // ─── History popover ─────────────────────────────────────────────────────────

  openHistoryMenu(trigger: MatMenuTrigger): void {
    const now = Date.now();
    const shouldFetch = (now - this.lastHistoryFetch) > this.HISTORY_THROTTLE_MS;

    if (shouldFetch) {
      this.isHistoryLoading = true;
      const userId = Number(sessionStorage.getItem('loggedInUserid')) || 0;
      this.loadRecentlyAccessed(userId);
      this.loadAccessCounts(userId);
      this.lastHistoryFetch = now;
      setTimeout(() => (this.isHistoryLoading = false), 300);
    }

    trigger.openMenu();
  }

  closeHistoryMenuLater(trigger: MatMenuTrigger): void {
    if (this.historyCloseTimer) clearTimeout(this.historyCloseTimer);
    this.historyCloseTimer = setTimeout(() => trigger.closeMenu(), 200);
  }

  cancelClose(): void {
    if (this.historyCloseTimer) {
      clearTimeout(this.historyCloseTimer);
      this.historyCloseTimer = null;
    }
  }

  closeHistoryMenuNow(trigger: MatMenuTrigger): void {
    if (this.historyCloseTimer) {
      clearTimeout(this.historyCloseTimer);
      this.historyCloseTimer = null;
    }
    trigger.closeMenu();
  }

  // ─── Messages popover ────────────────────────────────────────────────────────

  openMessagesMenu(trigger: MatMenuTrigger): void {
    if (!trigger.menuOpen) {
      trigger.openMenu();
    }
  }

  // ─── Misc ────────────────────────────────────────────────────────────────────

  toggleHighlight(): void {
    this.isHighlighted = !this.isHighlighted;
  }

  removeHighlight(): void {
    this.isHighlighted = false;
  }

  columns = [
    {
      sections: [
        { header: 'Search', bodyItems: ['Member', 'Provider', 'Member Assignment'] },
        { header: 'Admin', bodyItems: ['User Management', 'Work Basket', 'Security Roles', 'Security Profiles', 'System Configuration'] }
      ]
    },
    {
      sections: [
        { header: 'Configuration', bodyItems: ['Care Management', 'Utilization Management', 'Appeals & Grievances', 'Member Services', 'Config Management', 'Provider Management'] },
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
}
