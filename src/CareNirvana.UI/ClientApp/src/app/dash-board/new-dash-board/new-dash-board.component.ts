import { Component } from '@angular/core';

@Component({
  selector: 'app-new-dash-board',
  templateUrl: './new-dash-board.component.html',
  styleUrl: './new-dash-board.component.css',

})
export class NewDashBoardComponent {

  /*Div Selection Style change logic*/
  selectedDiv: number | null = 1; // Track the selected div

  // Method to select a div and clear others
  selectDiv(index: number) {
    this.selectedDiv = index; // Set the selected div index
  }

  //Navigation Pill
  selectedIndex: number = 0;

  tabs = [
    {
      label: 'Assigned Members',
      icon: 'people',
      number: '65',
      content: ''
    },
    {
      label: 'High Risk Members',
      icon: 'people',
      number: '20',
      content: ''
    },
    {
      label: 'Medium Risk Members',
      icon: 'people',
      number: '5',
      content: ''
    },
    {
      label: 'Low Risk Members',
      icon: 'people',
      number: '40',
      content: ''
    }
  ];

  selectTab(index: number): void {
    this.selectedIndex = index;
  }
}
