import { Component, OnInit, EventEmitter, Output } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';
import { HeaderService } from '../service/header.service';
import { AuthenticateService, RecentlyAccessed, Last24hCounts } from 'src/app/service/authentication.service';
import { MemberService } from 'src/app/service/shared-member.service';
import { MemberSummary } from 'src/app/service/dashboard.service.service';
import { MembersearchComponent } from 'src/app/member/membersearch/membersearch.component';
import { MatMenuTrigger } from '@angular/material/menu';

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrl: './header.component.css'
})
export class HeaderComponent implements OnInit {

  isHighlighted = false;
  selectedTabId: string | null = null;
  items: any[] = [];
  counts: Last24hCounts | null = null;

  toggleHighlight(): void {
    this.isHighlighted = !this.isHighlighted;
  }

  removeHighlight(): void {
    this.isHighlighted = false;
  }

  searchTerm: string = '';

  constructor(private router: Router, public headerService: HeaderService, public authService: AuthenticateService, public memberService: MemberService) {
  }

  ngOnInit(): void {
    this.loadRecentlyAccessed(Number(sessionStorage.getItem('loggedInUserid')));
    this.loadAccessCounts(Number(sessionStorage.getItem('loggedInUserid')));

    // Keep the visual "active" tab stable even if the tab label changes (e.g., Auth # updates after first save)
    this.selectedTabId = this.headerService.getSelectedTab() || this.router.url.split('?')[0];
    this.router.events
      .pipe(filter(e => e instanceof NavigationEnd))
      .subscribe(() => {
        this.selectedTabId = this.headerService.getSelectedTab() || this.router.url.split('?')[0];
      });
  }

  loadRecentlyAccessed(userId: number): void {
    const from = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const to = new Date().toISOString();

    this.authService.getRecentlyAccessed(userId, from, to, 50, 0)
      .subscribe({
        next: (res) => {
          // Check if response is a valid non-empty array
          if (Array.isArray(res) && res.length > 0) {
            this.items = res;
          } else {
            console.warn(' No recently accessed records found for userId:', userId);
            this.items = [];
          }
        },
        error: (err) => {
          console.error(' Error loading recently accessed:', err);
          this.items = [];
        }
      });
  }

  loadAccessCounts(userId: number): void {
    this.authService.getRecentlyAccessedCounts(userId).subscribe({
      next: (res) => {
        // res is already normalized & strongly typed
        this.counts = res;

        // ✅ Map values into the accessCounts used by your popover
        this.setAccessCountsFromService({
          MemberAccessCount: res.memberAccessCount,
          AuthorizationAccessCount: res.authorizationAccessCount,
          ComplaintAccessCount: res.complaintAccessCount
        });
      },
      error: (err) => {
        console.error('Error fetching access counts:', err);
        this.counts = { memberAccessCount: 0, authorizationAccessCount: 0, complaintAccessCount: 0 };
      }
    });
  }

  onMemberSearchIconClick(comp: MembersearchComponent): void {
    // Clear previous search, filters, results, and selection
    if (comp) {
      comp.resetSearch();
    }
  }

  // Called when a member is selected in the popover search
  onHeaderMemberSelected(member: MemberSummary | null, trigger: MatMenuTrigger): void {

    if (!member) {
      return;
    }
    if (member) {
      this.openMemberTab(member.memberId, `${member.firstName} ${member.lastName}`, member.memberDetailsId);
    }

    // Close the member search menu/hover
    if (trigger) {
      trigger.closeMenu();
    }
  }


  onSearch(): void {
    // You can handle the search logic here, e.g., filter a list
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
    // Use route as the stable identifier for selection (labels can change after save)
    this.selectedTabId = tab.route;
    this.headerService.selectTab(tab.route);
  }

  removeTab(tab: { label: string; route: string }): void {
    const confirmClose = window.confirm(`Are you sure you want to close the "${tab.label}" tab?`);
    if (!confirmClose) return;

    const nextRoute = this.headerService.removeTab(tab.route); // returns neighbor route or null
    if (nextRoute) {
      // Reuse your existing click logic so all side effects happen consistently
      this.onTabClick(nextRoute);  // this already handles selectTab + navigation
    } else {
      // No tabs left: route to a safe default (dashboard, home, etc.)
      this.router.navigate(['/dashboard']);
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
      this.selectedTabId = newTabRoute;
      this.router.navigateByUrl(newTabRoute);
    });
  }

  onTabClick(route: string): void {

    // keep UI selection in sync (route is stable even if label changes)
    this.selectedTabId = route;

    if (route.includes('member-auth')) {
      this.memberService.setIsCollapse(true);
    }
    else {
      this.memberService.setIsCollapse(false);
    }
    this.headerService.selectTab(route);

    const memberDetailsId = this.headerService.getMemberDetailsId(route);
    const mdNum = Number(memberDetailsId || 0);

    // IMPORTANT: treat "0" as missing (string '0' is truthy and was breaking enrollment loads)
    if (mdNum > 0) {
      sessionStorage.setItem('selectedMemberDetailsId', String(mdNum));
    } else {
      sessionStorage.removeItem('selectedMemberDetailsId');
    }

    const memberId = this.headerService.getMemberId(route) || '';

    // IMPORTANT:
    // - `router.navigate([route])` treats the string as ONE path segment and will URL-encode slashes.
    // - Tabs store routes like `/member-info/123/auth/0/details`, so we must navigateByUrl/UrlTree.
    const target = route?.startsWith('/') ? route : `/${route}`;

    this.router.navigateByUrl('/', { skipLocationChange: true }).then(() => {
      const tree = this.router.parseUrl(target);
      tree.queryParams = { ...(tree.queryParams ?? {}), memberId };
      this.router.navigateByUrl(tree);
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

  /****************Counts display ************/
  // Add near your other fields
  accessCounts?: { members: number; auths: number; complaints: number } = { members: 0, auths: 0, complaints: 0 };

  private historyCloseTimer: any = null;

  // Call this wherever you already compute your 24h counts:
  private setAccessCountsFromService(c: { MemberAccessCount: number; AuthorizationAccessCount: number; ComplaintAccessCount: number }) {
    this.accessCounts = {
      members: c?.MemberAccessCount ?? 0,
      auths: c?.AuthorizationAccessCount ?? 0,
      complaints: c?.ComplaintAccessCount ?? 0,
    };
  }

  isHistoryLoading = false;
  private lastHistoryFetch = 0;
  private readonly HISTORY_THROTTLE_MS = 2000;

  // Hover helpers
  openHistoryMenu(trigger: any) {
    //if (this.historyCloseTimer) { clearTimeout(this.historyCloseTimer); this.historyCloseTimer = null; }
    //trigger.openMenu();
    const now = Date.now();
    // throttle so we don't spam the API if user wiggles mouse
    const shouldFetch = (now - this.lastHistoryFetch) > this.HISTORY_THROTTLE_MS;

    if (shouldFetch) {
      this.isHistoryLoading = true;
      const userId = Number(sessionStorage.getItem('loggedInUserid')) || 0;

      // refresh both lists + counts
      this.loadRecentlyAccessed(userId);
      this.loadAccessCounts(userId);

      this.lastHistoryFetch = now;

      // stop the "Refreshing…" indicator a moment after the calls return
      // (they set counts/items; we just clear the flag on next macrotask)
      setTimeout(() => (this.isHistoryLoading = false), 300);
    }

    // open immediately; content updates as soon as responses arrive
    trigger.openMenu();
  }
  closeHistoryMenuLater(trigger: any) {
    if (this.historyCloseTimer) clearTimeout(this.historyCloseTimer);
    this.historyCloseTimer = setTimeout(() => trigger.closeMenu(), 200);
  }
  cancelClose() {
    if (this.historyCloseTimer) { clearTimeout(this.historyCloseTimer); this.historyCloseTimer = null; }
  }
  closeHistoryMenuNow(trigger: any) {
    if (this.historyCloseTimer) { clearTimeout(this.historyCloseTimer); this.historyCloseTimer = null; }
    trigger.closeMenu();
  }

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

    // Reuse the central navigation logic (prevents URL-encoding bugs)
    this.onTabClick(tabRoute);
  }

  @Output() addClicked = new EventEmitter<string>();

  openAuthTab(authNumber: string, memberId: string, memberDetailsId?: number): void {
    this.addClicked.emit(authNumber);

    if (!authNumber) authNumber = 'DRAFT';

    // ✅ route to Auth wizard DETAILS step (matches AuthWizardShell)
    const tabRoute = `/member-info/${memberId}/auth/${authNumber}/details`;
    const tabLabel = `Auth # ${authNumber}`;

    const existingTab = this.headerService.getTabs().find(t => t.route === tabRoute);
    if (!existingTab) {
      this.headerService.addTab(tabLabel, tabRoute, String(memberId), memberDetailsId ? String(memberDetailsId) : null);
    } else {
      // keep label fresh if authNumber changed casing
      this.headerService.updateTab(tabRoute, { label: tabLabel, route: tabRoute });
    }

    if (memberDetailsId != null) {
      sessionStorage.setItem('selectedMemberDetailsId', String(memberDetailsId));
    }

    // Central navigation logic (prevents encoded route segments)
    this.onTabClick(tabRoute);
  }


  // Add these fields (or map them from your own sources)
  selectedMemberDetailsId: number | null = null; // set this when a member tab is active
  careStaffOptions = [
    // populate from your service; example:
    // { value: 3, label: 'Sridhar' }, { value: 2, label: 'Pradeep' }
  ];

  // Optional: open on hover like your History menu
  openMessagesMenu(trigger: any) {
    // avoid re-open loops; open only if not already open
    if (!trigger.menuOpen) {
      trigger.openMenu();
    }
  }


}
