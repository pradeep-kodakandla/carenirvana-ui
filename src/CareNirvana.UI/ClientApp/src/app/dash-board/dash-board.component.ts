import { Component, ViewChild, ViewContainerRef, AfterViewInit, ComponentFactoryResolver } from '@angular/core';
import { MycaseloadComponent } from './mycaseload/mycaseload.component';
import { AssignedauthsComponent } from './assignedauths/assignedauths.component';
import { RequestsComponent } from './requests/requests.component';
import { MyactivitiesComponent } from './myactivities/myactivities.component';
import { AssignedcomplaintsComponent } from './assignedcomplaints/assignedcomplaints.component';
import { FaxesComponent } from './faxes/faxes.component';
import { RolepermissionService, CfgRole } from 'src/app/service/rolepermission.service';


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
  selector: 'app-dash-board',
  templateUrl: './dash-board.component.html',
  styleUrl: './dash-board.component.css',
})
export class DashBoardComponent {

  roleConfig: PermissionConfig = {};

  dashboardWidgets: any[] = [];
  defaultWidget: string = '';

  //dashboardItems = [
  //  { number: 65, text: 'My Case Load', icon: 'group' },
  //  { number: 15, text: 'Authorizations', icon: 'check_circle' },
  //  { number: 150, text: 'Requests', icon: 'assignment' },
  //  { number: 70, text: 'My Activities', icon: 'event' },
  //  { number: 0, text: 'Complaints', icon: 'feedback' },
  //  { number: 10, text: 'Faxes', icon: 'fax' }
  //];

  /*Div Selection Style change logic*/
  selectedDiv: number | null = 1; // Track the selected div

  // Method to select a div and clear others
  selectDiv(index: number) {
    this.selectedDiv = index; // Set the selected div index
  }

  constructor(private componentFactoryResolver: ComponentFactoryResolver, private roleService: RolepermissionService) {
  }

  @ViewChild('dynamicContainer', { read: ViewContainerRef }) dynamicContainer!: ViewContainerRef;

  handleWidgetClick(index: number, key: string): void {

    this.selectDiv(index);
    this.onSelect(key);
    this.defaultWidget = key;
  }


  ngOnInit(): void {
    // Replace with your actual source (from API/session storage etc.)
    this.fetchRoleData(4);
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
        //this.loadComponent(AuthorizationComponent);
        this.loadComponent(MycaseloadComponent);
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
      case 'assignedComplaints':
        this.loadComponent(AssignedcomplaintsComponent);
        break;
      case 'faxes':
        this.loadComponent(FaxesComponent);
        break;
    }
  }

  //ngAfterViewInit() {
  //  this.loadComponent(MycaseloadComponent); // Load the component after the view initializes
  //}

  items = [
    {
      photo: 'assets/item1.jpg',
      header: 'JOHN SMITH',
      content: 'DOB: 10/22/2024'
    },
    {
      photo: 'assets/item1.jpg',
      header: 'JOHN SMITH',
      content: 'DOB: 10/22/2024'
    },
    {
      photo: 'assets/item1.jpg',
      header: 'JOHN SMITH',
      content: 'DOB: 10/22/2024'
    },
    {
      photo: 'assets/item1.jpg',
      header: 'JOHN SMITH',
      content: 'DOB: 10/22/2024'
    },
    {
      photo: 'assets/item1.jpg',
      header: 'JOHN SMITH',
      content: 'DOB: 10/22/2024'
    },
    {
      photo: 'assets/item1.jpg',
      header: 'JOHN SMITH',
      content: 'DOB: 10/22/2024'
    },
    {
      photo: 'assets/item1.jpg',
      header: 'JOHN SMITH',
      content: 'DOB: 10/22/2024'
    },
    {
      photo: 'assets/item1.jpg',
      header: 'JOHN SMITH',
      content: 'DOB: 10/22/2024'
    }
  ];

}
