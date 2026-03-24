import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { MemberService } from 'src/app/service/shared-member.service';
import { DashboardServiceService } from 'src/app/service/dashboard.service.service';
import { HeaderService } from 'src/app/service/header.service';
import { AuthenticateService, RecentlyAccessed } from 'src/app/service/authentication.service';

// ─── Removed dead imports ────────────────────────────────────────────────────
// onMainContentChange animation was registered but never used in the template.
// TabService (tabs1, selectTab, closeTab) was loaded but never rendered — router-outlet handles navigation.
// Page interface was declared but never referenced.

@Component({
  selector: 'app-member-details',
  templateUrl: './member-details.component.html',
  styleUrl: './member-details.component.css',
  // FIX: removed animations: [onMainContentChange] — was imported but never bound in template
})
export class MemberDetailsComponent implements OnInit, OnDestroy {

  // ─── Destroy signal (plugs every subscription leak) ────────────────────────
  private destroy$ = new Subject<void>();

  memberId!: number;
  loggedInUser: string = sessionStorage.getItem('loggedInUsername') || '';
  isCollapse = false;
  isCollapseReady = false;
  private collapseTimer: any = null;

  member: any;

  // ─── Memoized parsed level map (avoids JSON.parse on every CD cycle) ────────
  private _parsedLevelMap: Record<string, string> | null = null;

  // Contact info
  memberDetails: any;
  primaryPhoneNumber: any | null = null;
  primaryEmail: any | null = null;
  primaryAddress: any | null = null;
  primaryAddressLines: string[] = [];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private memberService: MemberService,
    private dashboard: DashboardServiceService,
    private headerService: HeaderService,
    private authService: AuthenticateService
  ) {}

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.loggedInUser = sessionStorage.getItem('loggedInUsername') || '';

    // FIX: all data fetches moved INSIDE route.params so they always use the
    // freshly-resolved memberId/memberDetailsId, not a stale sessionStorage value.
    this.route.params
      .pipe(takeUntil(this.destroy$))
      .subscribe(params => {
        const id = params['id'];
        if (id) {
          this.memberId = parseInt(id, 10);
        }

        // Reset memoized map when member changes
        this._parsedLevelMap = null;

        const memberDetailsId = Number(sessionStorage.getItem('selectedMemberDetailsId'));

        this.dashboard.getpatientsummary(String(memberDetailsId || ''))
          .pipe(takeUntil(this.destroy$))
          .subscribe({
            next: (data) => {
              if (data && Array.isArray(data)) {
                this.member = data[0];
                // Re-parse level map after member is loaded
                this._parsedLevelMap = null;
              }
            },
            error: (err) => console.error('Error fetching member summary', err)
          });

        if (Number.isFinite(memberDetailsId) && memberDetailsId > 0) {
          this.dashboard.getMemberDetails(memberDetailsId)
            .pipe(takeUntil(this.destroy$))
            .subscribe({
              next: (res) => {
                this.memberDetails = res;

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

                this.primaryAddressLines = this.primaryAddress
                  ? this.getAddressLines(this.primaryAddress)
                  : [];
              },
              error: (err) => console.error('Error fetching member details', err)
            });
        }
      });

    // Respond to collapse signal from member component tab selection
    this.memberService.isCollapse$
      .pipe(takeUntil(this.destroy$))
      .subscribe(value => {
        if (value === this.isCollapse) return;
        this.applyCollapseState(value);
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.collapseTimer) {
      clearTimeout(this.collapseTimer);
      this.collapseTimer = null;
    }
  }

  // ─── Sidebar collapse ───────────────────────────────────────────────────────

  toggleSidebar(): void {
    this.applyCollapseState(!this.isCollapse);
  }

  /**
   * Single method for all collapse transitions — used by toggleSidebar(),
   * the isCollapse$ subscriber, and any future callers.
   */
  private applyCollapseState(collapse: boolean): void {
    if (this.collapseTimer) {
      clearTimeout(this.collapseTimer);
      this.collapseTimer = null;
    }

    if (collapse) {
      // Shrink width first, then show vertical name text after transition
      this.isCollapseReady = false;
      this.isCollapse = true;
      this.collapseTimer = setTimeout(() => {
        this.isCollapseReady = true;
      }, 320);
    } else {
      // Hide text/color immediately, then expand width
      this.isCollapseReady = false;
      this.collapseTimer = setTimeout(() => {
        this.isCollapse = false;
      }, 50);
    }
  }

  // ─── Member data helpers ────────────────────────────────────────────────────

  getAge(dob: string): number {
    if (!dob) return 0;
    let year: number, month: number, day: number;

    // FIX: handle both MM-DD-YYYY (legacy) and YYYY-MM-DD (ISO) formats
    const parts = dob.split('-').map(Number);
    if (parts[0] > 31) {
      // ISO: YYYY-MM-DD
      [year, month, day] = parts;
    } else {
      // Legacy: MM-DD-YYYY
      [month, day, year] = parts;
    }

    if (!year || !month || !day) return 0;
    const birthDate = new Date(year, month - 1, day);
    const diff = Date.now() - birthDate.getTime();
    return new Date(diff).getUTCFullYear() - 1970;
  }

  /**
   * FIX: memoized — no longer calls JSON.parse on every change-detection cycle.
   * The cache is cleared whenever this.member is reassigned.
   */
  getLevelValue(levelMap: string, key: string): string {
    if (!levelMap) return '';
    if (!this._parsedLevelMap) {
      try {
        this._parsedLevelMap = JSON.parse(levelMap);
      } catch {
        this._parsedLevelMap = {};
      }
    }
    return this._parsedLevelMap?.[key] ?? '';
  }

  // FIX: handle both `Programs` (capital) and `programs` (camelCase) API responses
  get programsList(): string[] {
    const s = this.member?.programs ?? this.member?.Programs;
    if (!s) return [];
    return (s as string)
      .split(',')
      .map((p: string) => p.trim())
      .filter((p: string) => p.length > 0);
  }

  openMessagesMenu(trigger: any): void {
    if (!trigger.menuOpen) {
      trigger.openMenu();
    }
  }

  // ─── Member name click (sidebar) ────────────────────────────────────────────

  onMemberNameClick(event: Event): void {
    event.preventDefault();
    if (!this.member) return;

    const memberId = String(this.member.memberId);
    const memberName = `${this.member.firstName || ''} ${this.member.lastName || ''}`.trim();

    // FIX: avoid String(null) → "null" being stored in sessionStorage
    const rawDetailsId =
      this.member.memberDetailsId != null
        ? this.member.memberDetailsId
        : Number(sessionStorage.getItem('selectedMemberDetailsId')) || null;
    const memberDetailsId = rawDetailsId != null ? String(rawDetailsId) : null;

    const tabLabel = `Member: ${memberName}`;
    const tabRoute = `/member-info/${memberId}`;

    const record: RecentlyAccessed = {
      userId: Number(sessionStorage.getItem('loggedInUserid')),
      featureId: null,
      featureGroupId: 2,
      action: 'VIEW',
      memberDetailsId: rawDetailsId ? Number(rawDetailsId) : 0
    };

    this.authService.addRecentlyAccessed(record.userId, record)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: id => console.log('Inserted record ID:', id),
        error: err => console.error('Insert failed:', err)
      });

    const existingTab = this.headerService.getTabs().find((tab: any) => tab.route === tabRoute);

    if (existingTab) {
      this.headerService.selectTab(tabRoute);
      const mdId = existingTab.memberDetailsId ?? null;
      if (mdId) sessionStorage.setItem('selectedMemberDetailsId', String(mdId));
    } else {
      this.headerService.addTab(tabLabel, tabRoute, memberId, memberDetailsId);
      if (memberDetailsId) sessionStorage.setItem('selectedMemberDetailsId', memberDetailsId);
    }

    this.router.navigateByUrl('/', { skipLocationChange: true }).then(() => {
      this.router.navigate([tabRoute]);
    });
  }

  // ─── Contact info helpers ───────────────────────────────────────────────────

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

    const preferredWithValue = list.find(x => this.isPreferred(x) && hasValue(x));
    if (preferredWithValue) return preferredWithValue;

    const firstWithValue = list.find(hasValue);
    if (firstWithValue) return firstWithValue;

    return list.find(x => this.isPrimary(x)) ?? list[0];
  }

  private clean(value: any): string {
    if (value === null || value === undefined) return '';
    const s = String(value).trim();
    if (!s || s.toUpperCase() === 'NULL') return '';
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
