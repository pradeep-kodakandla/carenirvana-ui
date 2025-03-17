import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { onMainContentChange } from 'src/app/animations/animations.service'
import { TabService } from 'src/app/service/tab.service';
import { MemberService } from 'src/app/service/shared-member.service';


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

  isCollapse: boolean = false;

  constructor(private route: ActivatedRoute, private router: Router, private tabService: TabService, private memberService: MemberService) { }

  toggleSidebar() {
    this.isCollapse = !this.isCollapse;
  }


  tabs: { title: string, memberId: string }[] = [];
  selectedTabIndex = 0;
  tabs1: { id: number; name: string; content: string }[] = [];
  selectedTabId: number | null = null;



  ngOnInit(): void {
    // Subscribe to route params to handle new member selection
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






  tabs2 = [
    { title: 'New Tab 1', content: 'This is the content for Tab 1.' },
    { title: 'New Tab 2', content: 'This is the content for Tab 2.' },
    { title: 'New Tab 3', content: 'This is the content for Tab 3.' },
  ];
  activeTab = 0;

  setActiveTab(index: number): void {
    this.activeTab = index;
  }

  closeTab1(index: number, event: MouseEvent): void {
    event.stopPropagation();
    this.tabs.splice(index, 1);

    // Adjust activeTab if the active tab is closed
    if (this.activeTab === index && this.tabs.length > 0) {
      this.activeTab = Math.max(0, index - 1);
    } else if (this.tabs.length === 0) {
      this.activeTab = -1; // No active tab if all are closed
    }
  }



}
//export class MemberInfoComponent {
//  showFiller = true;
//  public sideNavState: boolean = false;

//  onSinenavToggle() {
//    this.sideNavState = !this.sideNavState;
//  }

//}



