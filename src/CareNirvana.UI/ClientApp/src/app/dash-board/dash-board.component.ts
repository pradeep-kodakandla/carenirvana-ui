import { Component, ViewChild, ViewContainerRef, ComponentFactoryResolver } from '@angular/core';
import { MycaseloadComponent } from './mycaseload/mycaseload.component';
import { AssignedauthsComponent } from './assignedauths/assignedauths.component';
import { RequestsComponent } from './requests/requests.component';
import { MyactivitiesComponent } from './myactivities/myactivities.component';
import { AssignedcomplaintsComponent } from './assignedcomplaints/assignedcomplaints.component';
import { FaxesComponent } from './faxes/faxes.component';
import { RolepermissionService, CfgRole } from 'src/app/service/rolepermission.service';
import { MdreviewdashboardComponent } from './mdreviewdashboard/MdreviewdashboardComponent';
import { DashboardServiceService } from 'src/app/service/dashboard.service.service';
import { NewDashBoardComponent } from './new-dash-board/new-dash-board.component';
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

interface DashboardCounts {
  myMemberCount: number;
  authCount: number;
  requestCount: number;
  complaintCount: number;
  faxCount: number;
  wqCount: number;
  activityCount: number;
}

@Component({
  selector: 'app-dash-board',
  templateUrl: './dash-board.component.html',
  styleUrl: './dash-board.component.css',
})
export class DashBoardComponent {

  roleConfig: PermissionConfig = {};

  dashboardWidgets: any[] = [];
  defaultWidget: string = '';
  dashboardCounts?: DashboardCounts;

  // Mapping of widget keys to DashboardCounts properties
  private widgetToProp: Record<string, keyof DashboardCounts> = {
    myCaseLoad: 'myMemberCount',
    assignedAuthorizations: 'authCount',
    requests: 'requestCount',
    myActivities: 'activityCount',
    assignedComplaints: 'complaintCount',
    faxes: 'faxCount',
    mdreview: 'wqCount'         // or change if MD Review should map differently
  };

  /*Div Selection Style change logic*/
  selectedDiv: number | null = 1; // Track the selected div

  // Method to select a div and clear others
  selectDiv(index: number) {
    this.selectedDiv = index; // Set the selected div index
  }
  constructor(private componentFactoryResolver: ComponentFactoryResolver, private roleService: RolepermissionService,
    private dashboard: DashboardServiceService) {
  }

  @ViewChild('dynamicContainer', { read: ViewContainerRef }) dynamicContainer!: ViewContainerRef;

  handleWidgetClick(index: number, key: string): void {
    this.selectDiv(index);
    this.onSelect(key);
    this.defaultWidget = key;
  }

  ngOnInit(): void {
    // Replace with your actual source (from API/session storage etc.)
    this.loadCounts();
    this.fetchRoleData(4);
  }

  private loadCounts(): void {

    this.dashboard.getdashboardCounts(sessionStorage.getItem('loggedInUserid'))
      .subscribe({

        next: (res: DashboardCounts) => { this.dashboardCounts = res; },
        error: (err) => { console.error('Failed to load dashboard counts', err); }
      });
    console.log('Loading counts...');
    console.log('Counts', this.dashboardCounts);
  }

  getCountForWidget(key: string): number {
    if (!this.dashboardCounts) return 0;
    const prop = this.widgetToProp[key];
    return prop ? (this.dashboardCounts[prop] ?? 0) : 0;
  }

  fetchRoleData(roleId: number) {
    this.roleService.getRoleById(roleId).subscribe((role: any) => {
      const rawPermissions = role.Permissions || role.permissions;

      const parsed: PermissionConfig = typeof rawPermissions === 'string'
        ? JSON.parse(rawPermissions)
        : rawPermissions;

      this.roleConfig = parsed;

      if (parsed.dashboardWidgets?.widgets?.length) {
        this.dashboardWidgets = parsed.dashboardWidgets.widgets.filter((w: any) => w.enabled);
        this.defaultWidget = parsed.dashboardWidgets.defaultWidget;
        // ✅ Automatically load the default component
        if (this.defaultWidget) {
          const index = this.dashboardWidgets.findIndex(w => w.key === this.defaultWidget);
          this.selectDiv(index + 1); // highlight the selected box
          this.onSelect(this.defaultWidget); // load the component
        }
      } else {
        this.dashboardWidgets = [];
        this.defaultWidget = '';
      }
    });
  }

  getIconForWidget(key: string): string {
    const iconMap: any = {
      myCaseLoad: 'people',
      assignedAuthorizations: 'assignment_turned_in',
      requests: 'assignment_add',
      myActivities: 'event',
      assignedComplaints: 'assignment',
      faxes: 'fax'
    };
    return iconMap[key] || 'dashboard';
  }

  // Method to load a component dynamically
  loadComponent(component: any) {
    const componentFactory = this.componentFactoryResolver.resolveComponentFactory(component);
    this.dynamicContainer.clear(); // Clear any previous component
    this.dynamicContainer.createComponent(componentFactory); // Load the selected component
  }

  // Method to handle user selection
  onSelect(selection: string) {

    switch (selection) {
      case 'myCaseLoad':
        this.loadComponent(NewDashBoardComponent);
        //this.loadComponent(MycaseloadComponent);
        break;
      case 'assignedAuthorizations':
        this.loadComponent(AssignedauthsComponent);
        break;
      case 'requests':
        this.loadComponent(RequestsComponent);
        break;
      case 'myActivities':
        this.loadComponent(MyactivitiesComponent);
        break;
      case 'assignedComplaints': {
        this.loadComponent(AssignedcomplaintsComponent);// CasewizardshellComponent);
        break;
      }
      case 'faxes':
        this.loadComponent(FaxesComponent);
        break;
      case 'mdreview':
        this.loadComponent(MdreviewdashboardComponent);
        break;

    }
  }

}
