import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { onMainContentChange } from 'src/app/animations/animations.service'
import { TabService } from 'src/app/service/tab.service';
import { MemberService } from 'src/app/service/shared-member.service';
import { DashboardServiceService } from 'src/app/service/dashboard.service.service';
import { HeaderService } from 'src/app/service/header.service';
import { AuthenticateService, RecentlyAccessed } from 'src/app/service/authentication.service';

interface Page {
  link: string;
  name: string;
  icon: string;
}

@Component({
  selector: 'app-member-details',
  templateUrl: './member-details.component.html',
  styleUrl: './member-details.component.css',
  animations: [onMainContentChange],
})

export class MemberDetailsComponent implements OnInit {

  memberId!: number;
  loggedInUser: string = sessionStorage.getItem('loggedInUsername') || '';
  isCollapse: boolean = false;
  isCollapseReady: boolean = false;  // true only AFTER collapse width transition finishes
  private collapseTimer: any = null;
  member: any;

  // Contact info (from GetMemberDetailsAsync)
  memberDetails: any;
  memberPhoneNumbers: any[] = [];
  memberEmails: any[] = [];
  memberAddresses: any[] = [];
  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private tabService: TabService,
    private memberService: MemberService,
    private dashboard: DashboardServiceService,
    private headerService: HeaderService,
    private authService: AuthenticateService
  ) { }

  toggleSidebar() {
    // Clear any pending timer from a rapid toggle
    if (this.collapseTimer) {
      clearTimeout(this.collapseTimer);
      this.collapseTimer = null;
    }

    if (!this.isCollapse) {
      // COLLAPSING: shrink width first, then apply color + show text after transition
      this.isCollapseReady = false;
      this.isCollapse = true;
      this.collapseTimer = setTimeout(() => {
        this.isCollapseReady = true;
      }, 320); // slightly longer than the 0.3s CSS width transition
    } else {
      // EXPANDING: immediately hide text + revert color, then expand width
      this.isCollapseReady = false;
      this.collapseTimer = setTimeout(() => {
        this.isCollapse = false;
      }, 50); // small delay so the text/color disappear first
    }
  }

  tabs: { title: string, memberId: string }[] = [];
  selectedTabIndex = 0;
  tabs1: { id: number; name: string; content: string }[] = [];
  selectedTabId: number | null = null;

  // Primary (or fallback) contact records (shown in UI)
  primaryPhoneNumber: any | null = null;
  primaryEmail: any | null = null;
  primaryAddress: any | null = null;
  primaryAddressLines: string[] = [];


  ngOnInit(): void {
    // Subscribe to route params to handle new member selection
    this.loggedInUser = sessionStorage.getItem('loggedInUsername') || '';

    this.route.params.subscribe(params => {
      const id = params['id'];
      if (id) {
        this.memberId = parseInt(id, 10);

      }
      this.addTabForMember(id);
      this.selectedTabId = this.tabService.getSelectedTab();

    });
    this.tabs1 = this.tabService.getTabs();

    this.memberService.isCollapse$.subscribe(value => {
      if (value !== this.isCollapse) {
        // Use same sequencing as toggleSidebar
        if (this.collapseTimer) {
          clearTimeout(this.collapseTimer);
          this.collapseTimer = null;
        }

        if (value) {
          this.isCollapseReady = false;
          this.isCollapse = true;
          this.collapseTimer = setTimeout(() => {
            this.isCollapseReady = true;
          }, 320);
        } else {
          this.isCollapseReady = false;
          this.collapseTimer = setTimeout(() => {
            this.isCollapse = false;
          }, 50);
        }
      }
    });

    this.dashboard.getpatientsummary(sessionStorage.getItem('selectedMemberDetailsId')).subscribe((data) => {
      if (data && Array.isArray(data)) {
        this.member = data[0];
      }
    }, error => {
      console.error('Error fetching member summary', error);
    });

    const selectedMemberDetailsId = Number(sessionStorage.getItem('selectedMemberDetailsId'));
    if (Number.isFinite(selectedMemberDetailsId) && selectedMemberDetailsId > 0) {
      this.dashboard.getMemberDetails(selectedMemberDetailsId).subscribe({
        next: (res) => {
          this.memberDetails = res;

          // Backend may return camelCase or lowercase keys, and may return nested JSON as a string.
          this.primaryPhoneNumber = this.pickBestRecord(
            this.memberDetails.memberPhoneNumbers,
            (p: any) => p?.phonenumber ?? p?.phoneNumber
          );

          this.primaryEmail = this.pickBestRecord(
            this.memberDetails.memberEmails,
            (e: any) => e?.emailaddress ?? e?.emailAddress
          );

          this.primaryAddress = this.pickBestRecord(
            this.memberDetails.memberAddresses,
            (a: any) => (this.getAddressLines(a) || []).join(' ')
          );

          this.primaryAddressLines = this.primaryAddress ? this.getAddressLines(this.primaryAddress) : [];

          console.log('Member Details:', this.primaryPhoneNumber);
        },
        error: (err) => console.error(err)
      });
    }
  }
  selectTab(tabId: number) {
    this.selectedTabId = tabId;
  }
  closeTab(tabId: number, event: MouseEvent) {
    event.stopPropagation(); // Prevent the tab click event
    this.tabService.removeTab(tabId);
    this.tabs1 = this.tabService.getTabs();
    this.selectedTabId = this.tabService.getSelectedTab();
  }

  addTabForMember(memberId: string): void {
    // Check if the tab for this member already exists
    const tabExists = this.tabs.findIndex(tab => tab.memberId === memberId);

    if (tabExists === -1) {
      // If not, create a new tab
      this.tabs.push({ title: `Member: ${memberId}`, memberId });
      this.selectedTabIndex = this.tabs.length - 1; // Select the newly added tab
    } else {
      // If it exists, switch to that tab
      this.selectedTabIndex = tabExists;
    }
  }

  showFiller = true;
  public sideNavState: boolean = false;

  onSinenavToggle() {
    this.sideNavState = !this.sideNavState;
  }

  getAge(dob: string): number {
    if (!dob) return 0;
    const [month, day, year] = dob.split('-').map(Number);
    const birthDate = new Date(year, month - 1, day);
    const diff = Date.now() - birthDate.getTime();
    const age = new Date(diff).getUTCFullYear() - 1970;
    return age;
  }

  getLevelValue(levelMap: string, key: string): string {
    try {
      const map = JSON.parse(levelMap);
      return map[key] || '';
    } catch {
      return '';
    }
  }

  getRiskClass(level?: string): string {
    if (!level) return 'green'; // handle null/undefined early
    const code = level.toLowerCase();
    if (code.includes('high')) return 'red';
    if (code.includes('medium')) return 'orange';
    if (code.includes('low')) return 'green';
    return 'green';
  }

  get programsList(): string[] {
    const s = this.member?.Programs;
    if (!s) return [];
    return s
      .split(',')
      .map((p: string) => p.trim())   // ✅ explicitly type p
      .filter((p: string) => p.length > 0);
  }

  openMessagesMenu(trigger: any) {
    // avoid re-open loops; open only if not already open
    if (!trigger.menuOpen) {
      trigger.openMenu();
    }
  }

  /**
   * Handles clicking the member name in the sidebar.
   * Replicates the same behavior as onMemberClick in mycaseload:
   * - Records recently accessed
   * - Creates/selects a header tab
   * - Navigates to the member-info route
   */
  onMemberNameClick(event: Event): void {
    event.preventDefault();

    if (!this.member) return;

    const memberId = String(this.member.memberId);
    const memberName = `${this.member.firstName || ''} ${this.member.lastName || ''}`.trim();
    const memberDetailsId = String(this.member.memberDetailsId ?? sessionStorage.getItem('selectedMemberDetailsId') ?? '');

    const tabLabel = `Member: ${memberName}`;
    const tabRoute = `/member-info/${memberId}`;

    // Record recently accessed
    const record: RecentlyAccessed = {
      userId: Number(sessionStorage.getItem('loggedInUserid')),
      featureId: null,
      featureGroupId: 2,
      action: 'VIEW',
      memberDetailsId: Number(memberDetailsId)
    };

    this.authService.addRecentlyAccessed(record.userId, record)
      .subscribe({
        next: id => console.log('Inserted record ID:', id),
        error: err => console.error('Insert failed:', err)
      });

    const existingTab = this.headerService.getTabs().find((tab: any) => tab.route === tabRoute);

    if (existingTab) {
      this.headerService.selectTab(tabRoute);
      const mdId = existingTab.memberDetailsId ?? null;
      if (mdId) sessionStorage.setItem('selectedMemberDetailsId', mdId);
      this.router.navigateByUrl('/', { skipLocationChange: true }).then(() => {
        this.router.navigate([tabRoute]);
      });
    } else {
      this.headerService.addTab(tabLabel, tabRoute, memberId, memberDetailsId);
      sessionStorage.setItem('selectedMemberDetailsId', memberDetailsId);
      this.router.navigateByUrl('/', { skipLocationChange: true }).then(() => {
        this.router.navigate([tabRoute]);
      });
    }
  }

  // -------------------------
  // Contact info helpers
  // -------------------------
  private toArray(value: any): any[] {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  }

  private isTruthy(item: any, keys: string[]): boolean {
    return keys.some(k => item?.[k] === true);
  }

  isPrimary(item: any): boolean {
    return this.isTruthy(item, ['isprimary', 'isPrimary']);
  }

  isPreferred(item: any): boolean {
    return this.isTruthy(item, ['ispreferred', 'isPreferred']);
  }

  /**
   * Pick the record to show in the UI:
   * - Prefer a Primary record
   * - If no Primary, fall back to another record
   * - Prefer records that actually have a value (non-empty / not 'NULL')
   */
  private pickBestRecord<T = any>(items: T[], valueSelector?: (item: T) => any): T | null {
    const list = this.toArray(items);
    if (!list.length) return null;

    const hasValue = (item: T): boolean => {
      if (!valueSelector) return true;
      const raw = valueSelector(item);
      if (raw === null || raw === undefined) return false;
      if (typeof raw === 'string') return this.clean(raw).length > 0;
      return true;
    };

    const primaryWithValue = list.find(x => this.isPrimary(x) && hasValue(x));
    if (primaryWithValue) return primaryWithValue;
    console.log('primary with value', primaryWithValue);
    // If primary exists but has no usable value, fall back to another record that *does* have a value.
    const preferredWithValue = list.find(x => this.isPreferred(x) && hasValue(x));
    if (preferredWithValue) return preferredWithValue;

    const firstWithValue = list.find(hasValue);
    if (firstWithValue) return firstWithValue;

    // Nothing has a value; just return primary if present, otherwise the first record.
    const primary = list.find(x => this.isPrimary(x));
    if (primary) return primary;

    return list[0];
  }


  private clean(value: any): string {
    if (value === null || value === undefined) return '';
    const s = String(value).trim();
    if (!s) return '';
    if (s.toUpperCase() === 'NULL') return '';
    return s;
  }

  formatPhone(phone?: string): string {
    const digits = (phone ?? '').replace(/\D/g, '');
    if (digits.length === 10) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
    return phone ?? '';
  }

  getAddressLines(address: any): string[] {
    if (!address) return [];

    const l1 = this.clean(address.addressline1 ?? address.addressLine1);
    const l2 = this.clean(address.addressline2 ?? address.addressLine2);
    const l3 = this.clean(address.addressline3 ?? address.addressLine3);
    const city = this.clean(address.city);
    const zip = this.clean(address.zipcode ?? address.zipCode);
    const country = this.clean(address.country);

    const lines: string[] = [];
    if (l1) lines.push(l1);
    if (l2) lines.push(l2);
    if (l3) lines.push(l3);

    const lastLine = [city, zip].filter(Boolean).join(' ');
    if (lastLine) lines.push(lastLine);
    if (country) lines.push(country);

    return lines;
  }
}
