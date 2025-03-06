import { Component, OnInit, ViewChild, ElementRef, ViewEncapsulation } from '@angular/core';
import { MatTableDataSource } from '@angular/material/table';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatDialog } from '@angular/material/dialog';
import { CrudService } from 'src/app/service/crud.service';
import { SettingsDialogComponent } from 'src/app/admin/UM/settings-dialog/settings-dialog.component';
import {
  MatSnackBar,
  MatSnackBarHorizontalPosition,
  MatSnackBarVerticalPosition,
} from '@angular/material/snack-bar';
import { MatCheckboxChange } from '@angular/material/checkbox';

import { DialogContentComponent } from 'src/app/admin/UM/dialog-content/dialog-content.component';


@Component({
  selector: 'app-cmaddresstype',
  templateUrl: './cmaddresstype.component.html',
  styleUrl: './cmaddresstype.component.css',
  encapsulation: ViewEncapsulation.None,
})
export class CmaddresstypeComponent implements OnInit {
  dataSource = new MatTableDataSource<any>();
  displayedColumns: string[] = ['id', 'entityTypeName', 'addressType', 'activeFlag', 'createdBy', 'createdOn', 'actions'];
  visibleColumns: string[] = [];
  editableRow: any = null;
  editableRows: Set<number> = new Set(); // Track editable rows by their ID
  formMode: 'add' | 'edit' | 'view' = 'add';
  selectedEntry: any = {};
  entityTypeOptions: any[] = []; // Array to store entity type options
  entityLookup: Map<string, string> = new Map(); // Map to store entity ID and entity type value

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;
  @ViewChild('editableInput') editableInput!: ElementRef;

  constructor(private crudService: CrudService, private dialog: MatDialog, private snackBar: MatSnackBar) { }

  ngOnInit(): void {
    this.loadEntityTypeOptions();
    this.loadData();
  }

  loadData() {
    this.crudService.getData('cm', 'addresstype').subscribe((response) => {
      this.dataSource.data = response.filter(item => item.deletedOn == null).map((item: any) => ({
        ...item,
        entityTypeName: this.entityLookup.get(item.entityTypeId) || '', // Map entityType to its value
      }))
      this.dataSource.paginator = this.paginator;
      this.dataSource.sort = this.sort;
    });
  }
  loadEntityTypeOptions() {
    this.crudService.getData('cm', 'entitytype').subscribe(
      (response: any) => {
        if (response && Array.isArray(response)) {
          // Map the response directly to entityTypeOptions
          this.entityTypeOptions = response.filter(item => item.activeFlag == true).map((item: any) => ({
            id: item.id,
            value: item.entityType || item.entityTypeName, // Handle both 'entityType' and 'entityTypeName' keys
          }));
          // Create a lookup map for quick ID-to-value mapping
          this.entityLookup = new Map(
            this.entityTypeOptions.map(option => [option.id, option.value])
          );
        } else {
          console.error('Unexpected response structure:', response);
          this.snackBar.open('Error: Invalid entity type data structure!', 'Close', {
            horizontalPosition: 'center',
            verticalPosition: 'top',
            duration: 5000,
          });
        }
      },
      (error) => {
        console.error('Error loading entity type options:', error);
        this.snackBar.open('Error loading entity type options!', 'Close', {
          horizontalPosition: 'center',
          verticalPosition: 'top',
          duration: 5000,
        });
      }
    );
  }
  applyFilter(event: Event) {
    const filterValue = (event.target as HTMLInputElement).value;
    this.dataSource.filter = filterValue.trim().toLowerCase();

    if (this.dataSource.paginator) {
      this.dataSource.paginator.firstPage();
    }
  }

  openSettingsDialog() {
    // Open dialog for column visibility settings
    const dialogRef = this.dialog.open(SettingsDialogComponent, {
      width: '400px',
      data: { visibleColumns: this.visibleColumns }
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.visibleColumns = result;
        this.updateDisplayedColumns();
      }
    });
  }

  updateDisplayedColumns() {
    const optionalColumns = ['updatedBy', 'updatedOn', 'deletedBy', 'deletedOn'];
    this.displayedColumns = ['id', 'entityTypeName', 'addressType', 'activeFlag', 'createdBy', 'createdOn', 'actions'];
    this.displayedColumns.push(...this.visibleColumns.filter((col) => optionalColumns.includes(col)));
  }

  onRowDoubleClick(row: any, event: MouseEvent) {
    this.editableRows.clear();
    event.stopPropagation(); // Prevent event from propagating to the Activity
    this.editableRow = row;
    this.editableRows.add(row.id);
    this.formMode = 'edit';
    setTimeout(() => this.focusEditableInput(), 0); // Delay to allow DOM to update
  }


  focusEditableInput() {
    if (this.editableInput) {
      this.editableInput.nativeElement.focus();
    }
  }

  addRow(): void {
    const newRow = {
      id: this.generateId(), // Auto-generate ID
      entityTypeId: null, // Empty input for Entity Type ID
      addressType: '', // Empty input for Address Type
      activeFlag: true, // Default to checked
      createdBy: 'current_user', // Default user
      createdOn: new Date().toISOString(), // Current date and time
    };
    this.editableRows.clear();

    this.dataSource.data = [newRow, ...this.dataSource.data]; // Add new row to the top
    this.editableRow = newRow;
    this.editableRows.add(newRow.id);
    this.formMode = 'add';
    setTimeout(() => this.focusEditableInput(), 0);
  }

  // Helper function to generate a new unique ID
  private generateId(): number {

    const maxId = this.dataSource.data.reduce(
      (max, item) => Math.max(max, Number(item.id || 0)), // Convert id to number
      0
    );
    return maxId + 1;
  }

  saveRow(event: MatCheckboxChange, row: any): void {
    // Update the element's activeFlag value based on the checkbox status
    const isChecked = event.checked;
    const message = isChecked
      ? `Are you sure you want to activate the "${row.addressType}"?`
      : `Are you sure you want to inactivate the "${row.addressType}"?`;

    if (confirm(message)) {
      row.activeFlag = event.checked;
      console.log('Checkbox checked:', event.checked);
      this.crudService.updateData('cm', 'addresstype', row.id, row).subscribe(() => {
        this.loadData();
        this.snackBar.open('Address Type updated successfully!', 'Close', {
          horizontalPosition: 'center',
          verticalPosition: 'top',
          duration: 5000

        });
      },
        (error) => {
          row.activeFlag = !event.checked;
          console.error('Error updating entry:', error);
          this.snackBar.open('Error updating Address Type!', 'Close', {
            horizontalPosition: 'center',
            verticalPosition: 'top',
            duration: 5000
          });
        }
      );
    }
    else {
      event.checked = !isChecked;
    }// Revert the checkbox if canceled
    this.loadData();
  }

  onRowBlur(row: any) {
    if (this.editableRow === row) {

      console.log('Row blur:', row);
      /*this.saveRow(row); // Save changes*/
      this.saveEntry(row);
      this.editableRow = null; // Exit edit mode
    }
  }

  saveEntry(row: any) {

    console.log('formMode:', this.formMode);
    this.selectedEntry = row;
    console.log('Saving row:', row);
    const formValue = this.selectedEntry.value;
    

    // Check if Address Type is empty
    if (!row.addressType || !row.entityTypeId) {
      this.snackBar.open('Address and Entity Type fields are required!', 'Close', {
        horizontalPosition: 'center',
        verticalPosition: 'top',
        duration: 5000
      });
      return;
    }
    // Check for duplicate Address Type
    console.log('Address Type:', row.addressType);
    console.log('Entity Type:', row);
    const isDuplicate = this.dataSource.data.some(
      (entry) =>
        entry.addressType?.toLowerCase() === row.addressType.toLowerCase() &&
        entry.entityTypeId?.toLowerCase() === row.entityTypeId.toLowerCase() &&
        entry.id !== (this.selectedEntry?.id || null) // Exclude the current entry being edited
    );


    if (isDuplicate) {
      this.snackBar.open('Address Type already exists!', 'Close', {
        horizontalPosition: 'center',
        verticalPosition: 'top',
        duration: 5000
      });
      return;
    }
    // Add or Edit Entry
    if (this.formMode === 'add') {

      // Save new entry
      if (this.selectedEntry && this.selectedEntry.id != null) {
        this.selectedEntry.id = this.selectedEntry.id.toString(); // Safely convert to string
      }
      this.crudService.addData('cm', 'addresstype', this.selectedEntry).subscribe(
        () => {
          this.snackBar.open('Address Type added successfully!', 'Close', {
            horizontalPosition: 'center',
            verticalPosition: 'top',
            duration: 5000,
            panelClass: ['success-snackbar']
          });
          this.loadData(); // Reload data to refresh the table

        },
        (error) => {
          console.error('Error saving data:', error);
          this.snackBar.open('Error saving data!', 'Close', {
            horizontalPosition: 'center',
            verticalPosition: 'top',
            duration: 5000,
            panelClass: ['error-snackbar']
          });
        }
      );
    } else if (this.formMode === 'edit') {
      // Update existing entry
      console.log('EditValue:', this.selectedEntry);
      if (this.selectedEntry && this.selectedEntry.id != null) {
        this.selectedEntry.id = this.selectedEntry.id.toString(); // Safely convert to string
      } else {
        console.error('Invalid id:', this.selectedEntry?.id);
      }
      this.crudService.updateData('cm', 'addresstype', this.selectedEntry.id, this.selectedEntry).subscribe(
        () => {
          this.snackBar.open('Address Type updated successfully!', 'Close', {
            horizontalPosition: 'center',
            verticalPosition: 'top',
            duration: 5000,
            panelClass: ['mat-mdc-simple-snack-bar']
          });
          this.editableRow = null;
          this.editableRows.clear();
          this.loadData(); // Reload data to refresh the table
        },
        (error) => {
          console.error('Error updating data:', error);
          this.snackBar.open('Error updating data!', 'Close', {
            horizontalPosition: 'center',
            verticalPosition: 'top',
            duration: 5000,
            panelClass: ['error-snackbar']
          });
        }
      );
    }
    // Hide the form after saving
  }

  handleKeydown(event: KeyboardEvent, row: any) {
    if (event.key === 'Tab' || event.key === 'Enter') {
      this.saveEntry(row); // Save the entry on Tab or Enter
      this.editableRows.clear(); // Exit edit mode
      event.preventDefault(); // Prevent default tab behavior
    }
  }

  confirmDelete(element: any): void {
    const confirmed = window.confirm(`Are you sure you want to delete the "${element.addressType}"?`);
    if (confirmed) {
      // Perform the delete action
      this.deleteRow(element.id);
    }
  }

  deleteRow(id: number) {
    this.crudService.deleteData('cm', 'addresstype', id, 'current_user').subscribe(
      () => {
        this.snackBar.open('Address Type deleted successfully!', 'Close', {
          horizontalPosition: 'center',
          verticalPosition: 'top',
          duration: 5000
        });
        this.loadData(); // Refresh the table data
      },
      (error) => {
        console.error('Error deleting entry:', error);
        this.snackBar.open('Error deleting Address Type!', 'Close', {
          horizontalPosition: 'center',
          verticalPosition: 'top',
          duration: 5000
        });
      }
    );
  }

}

