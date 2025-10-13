import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { onMainContentChange } from 'src/app/animations/animations.service'
import { TabService } from 'src/app/service/tab.service';
import { MemberService } from 'src/app/service/shared-member.service';
import { DashboardServiceService } from 'src/app/service/dashboard.service.service';

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
  member: any;
  constructor(private route: ActivatedRoute, private router: Router, private tabService: TabService, private memberService: MemberService, private dashboard: DashboardServiceService) { }

  toggleSidebar() {
    this.isCollapse = !this.isCollapse;
  }

  tabs: { title: string, memberId: string }[] = [];
  selectedTabIndex = 0;
  tabs1: { id: number; name: string; content: string }[] = [];
  selectedTabId: number | null = null;

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
      this.isCollapse = value;
    });

    this.dashboard.getpatientsummary(sessionStorage.getItem('selectedMemberDetailsId')).subscribe((data) => {
      if (data && Array.isArray(data)) {
        this.member = data[0];
      }
    }, error => {
      console.error('Error fetching member summary', error);
    });

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
}
