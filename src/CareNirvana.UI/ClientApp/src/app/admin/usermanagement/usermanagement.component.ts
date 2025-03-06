import { Component, ViewChild, ViewEncapsulation } from '@angular/core';
import { animate, state, style, transition, trigger } from '@angular/animations';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatSortModule } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { MatMenu } from '@angular/material/menu';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { Router } from '@angular/router';


@Component({
  selector: 'app-usermanagement',
  templateUrl: './usermanagement.component.html',
  styleUrl: './usermanagement.component.css',
  encapsulation: ViewEncapsulation.None,
})
export class UsermanagementComponent {

  displayedColumns: string[] = ['UN', 'FN', 'Role', 'Dept', 'WB', 'actions'];
  dataSource = [
    { UN: 'Value 1', FN: 'Value 2', Role: 'Value 3', Dept: 'Value 4', WB: 'Value 5' },
    { UN: 'Value A', FN: 'Value B', Role: 'Value C', Dept: 'Value D', WB: 'Value E' },
  ];

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;


  ngAfterViewInit() {
    this.paginator = this.paginator;
    this.sort = this.sort;
  }

  selectedRecord: any = null; // Stores the record for view/edit
  isEditing: boolean = false; // Tracks whether in edit mode
  recordKeys: string[] = []; // Keys for the form inputs

  // View record details
  viewRecord(record: any) {
    this.selectedRecord = { ...record }; // Clone record for immutability
    this.isEditing = false;
    this.recordKeys = Object.keys(record);
    this.mode = 'view';
  }

  // Edit record
  editRecord(record: any) {
    this.selectedRecord = { ...record }; // Clone record for immutability
    this.isEditing = true;
    this.recordKeys = Object.keys(record);
    this.mode = 'update';
  }

  toggleAddMode() {
    this.selectedRecord = { };
    this.mode = 'add';
  }

  // Save the edited record
  saveRecord() {
    const index = this.dataSource.findIndex((r) => JSON.stringify(r) === JSON.stringify(this.selectedRecord));
    if (index !== -1) {
      this.dataSource[index] = { ...this.selectedRecord }; // Update the record
    }
    this.clearSelection(); // Clear the form after save
  }

  // Delete record
  deleteRecord(record: any) {
    if (confirm('Are you sure you want to delete this record?')) {
      this.dataSource = this.dataSource.filter((r) => r !== record);
    }
  }

  // Clear selected record
  clearSelection() {
    this.selectedRecord = null;
    this.isEditing = false;
  }



  applyFilter(event: Event) {
    const filterValue = (event.target as HTMLInputElement).value;
    //this.filter = filterValue.trim().toLowerCase();

    if (this.paginator) {
      this.paginator.firstPage();
    }
  }

  mode: 'view' | 'add' | 'update' = 'view';

  user = {
    username: 'Jsmith',
    passwordHint: 'Born in which city?',
    passwordHintAnswer: 'Chicago',
    passwordExpiry: 'No',
    role: 'Care Manager',
    dataAttributes: 'Medicare',
    title: 'Mr.',
    firstName: 'John',
    lastName: 'Smith',
    city: 'Jacksonville',
    state: 'VA',
    country: 'USA',
    primaryPhone: '(123) 123-1234',
    email: 'jsmith@yahoo.com',
    workBasket: ' ',
    manager: ' ',
    addressLine1: ' ',
    addressLine2: ' ',
    zip: ' ',
    timezone: ' ',
    credentials: ' ',
    extension: ' ',
    alternatePhone: ' ',
    cellPhone: ' '
  };

  save() {
    if (this.mode === 'add') {
      console.log('User added:', this.user);
    } else if (this.mode === 'update') {
      console.log('User updated:', this.user);
    }
  }

  cancel() {
    console.log('Action canceled.');
    this.selectedRecord = null;
    this.isEditing = false;
  }
}

