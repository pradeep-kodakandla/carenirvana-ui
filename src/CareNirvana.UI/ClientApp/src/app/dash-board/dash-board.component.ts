import { Component, ViewChild, ViewContainerRef, AfterViewInit, ComponentFactoryResolver } from '@angular/core';
import { MycaseloadComponent } from './mycaseload/mycaseload.component';
import { AssignedauthsComponent } from './assignedauths/assignedauths.component';
import { RequestsComponent } from './requests/requests.component';
import { MyactivitiesComponent } from './myactivities/myactivities.component';
import { AssignedcomplaintsComponent } from './assignedcomplaints/assignedcomplaints.component';
import { FaxesComponent } from './faxes/faxes.component';


@Component({
  selector: 'app-dash-board',
  templateUrl: './dash-board.component.html',
  styleUrl: './dash-board.component.css',
})
export class DashBoardComponent {

  dashboardItems = [
    { number: 65, text: 'My Case Load', icon: 'group' },
    { number: 15, text: 'Authorizations', icon: 'check_circle' },
    { number: 150, text: 'Requests', icon: 'assignment' },
    { number: 70, text: 'My Activities', icon: 'event' },
    { number: 0, text: 'Complaints', icon: 'feedback' },
    { number: 10, text: 'Faxes', icon: 'fax' }
  ];

  /*Div Selection Style change logic*/
  selectedDiv: number | null = 1; // Track the selected div

  // Method to select a div and clear others
  selectDiv(index: number) {
    this.selectedDiv = index; // Set the selected div index
  }

  constructor(private componentFactoryResolver: ComponentFactoryResolver) {
  }

  @ViewChild('dynamicContainer', { read: ViewContainerRef }) dynamicContainer!: ViewContainerRef;


  // Method to load a component dynamically
  loadComponent(component: any) {
    const componentFactory = this.componentFactoryResolver.resolveComponentFactory(component);
    this.dynamicContainer.clear(); // Clear any previous component
    this.dynamicContainer.createComponent(componentFactory); // Load the selected component
  }

  // Method to handle user selection
  onSelect(selection: string) {
    switch (selection) {
      case 'A':
        //this.loadComponent(AuthorizationComponent);
        this.loadComponent(MycaseloadComponent);
        break;
      case 'B':
        this.loadComponent(AssignedauthsComponent);
        break;
      case 'C':
        this.loadComponent(RequestsComponent);
        break;
      case 'D':
        this.loadComponent(MyactivitiesComponent);
        break;
      case 'E':
        this.loadComponent(AssignedcomplaintsComponent);
        break;
      case 'F':
        this.loadComponent(FaxesComponent);
        break;
    }
  }

  ngAfterViewInit() {
    this.loadComponent(MycaseloadComponent); // Load the component after the view initializes
  }

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
