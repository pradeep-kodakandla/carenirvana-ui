import { Component, ViewChild, OnInit, ElementRef, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { animate, state, style, transition, trigger } from '@angular/animations';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatSortModule } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { MatMenu } from '@angular/material/menu';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { MatMenuTrigger } from '@angular/material/menu';
import { CrudService } from 'src/app/service/crud.service';
import { MatDialog } from '@angular/material/dialog';
import { SettingsDialogComponent } from 'src/app/admin/UM/settings-dialog/settings-dialog.component';
import {
  MatSnackBar,
  MatSnackBarHorizontalPosition,
  MatSnackBarVerticalPosition,
} from '@angular/material/snack-bar';
import { MatCheckboxChange } from '@angular/material/checkbox';

import { DialogContentComponent } from 'src/app/admin/UM/dialog-content/dialog-content.component';


@Component({
  selector: 'app-cmnotetype',
  templateUrl: './cmnotetype.component.html',
  styleUrl: './cmnotetype.component.css'
})
export class CmnotetypeComponent implements OnInit {
  dataSource = new MatTableDataSource<any>();
  displayedColumns: string[] = ['id', 'noteType', 'noteTemplate', 'activeFlag', 'createdBy', 'createdOn', 'actions'];
  isFormVisible: boolean = false;
  formMode: 'add' | 'edit' | 'view' = 'add';
  selectedEntry: any = {};
  visibleColumns: string[] = [];
  noteForm: FormGroup; // Reactive form
  editingRowId: string | null = null;
  //horizontalPosition: MatSnackBarHorizontalPosition = 'center';
  //verticalPosition: MatSnackBarVerticalPosition = 'top';
  // All columns including hidden ones

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;
  @ViewChild('noteTypeInput') noteTypeInput!: ElementRef;


  constructor(private crudService: CrudService, private dialog: MatDialog, private cdr: ChangeDetectorRef, private fb: FormBuilder, private snackBar: MatSnackBar
  ) {
    this.noteForm = this.fb.group({
      noteType: ['', [Validators.required]],
      activeFlag: [false],
      comment: ['']
    });
  }

  ngOnInit(): void {
    this.loadData();
  }

  loadData() {
    this.crudService.getData('cm', 'notetype').subscribe((response) => {
      this.dataSource.data = response.filter(item => item.deletedOn == null);
      this.dataSource.paginator = this.paginator;
      this.dataSource.sort = this.sort;
    });
  }

  applyFilter(event: Event) {
    const filterValue = (event.target as HTMLInputElement).value;
    this.dataSource.filter = filterValue.trim().toLowerCase();

    if (this.dataSource.paginator) {
      this.dataSource.paginator.firstPage();
    }
  }

  openForm(mode: 'add' | 'edit' | 'view', element: any = null) {

    if (mode === 'edit') {
      this.editingRowId = element.id; // Disable actions for this row
    }
    this.formMode = mode;
    this.selectedEntry = element ? { ...element } : { id: null, noteType: '', activeFlag: false, noteTemplate: '' };
    this.isFormVisible = true;
    setTimeout(() => {
      this.noteTypeInput?.nativeElement.focus();
    }, 0);
  }

  saveEntry() {
    console.log('Saving row:', this.selectedEntry);
    const formValue = this.noteForm.value;

    // Check if note Type is empty
    if (!formValue.noteType) {
      this.snackBar.open('Note Type is required!', 'Close', {
        horizontalPosition: 'center',
        verticalPosition: 'top',
        duration: 5000
      });
      return;
    }

    // Check for duplicate note Type
    const isDuplicate = this.dataSource.data.some(
      (entry) =>
        entry.noteType?.toLowerCase() === formValue.noteType.toLowerCase() &&
        entry.id !== (this.selectedEntry?.id || null) // Exclude the current entry being edited
    );

    if (isDuplicate) {
      this.snackBar.open('Note Type already exists!', 'Close', {
        horizontalPosition: 'center',
        verticalPosition: 'top',
        duration: 5000
      });
      return;
    }

    // Add or Edit Entry
    if (this.formMode === 'add') {
      // Generate a new ID
      const maxId = this.dataSource.data.reduce(
        (max, item) => Math.max(max, Number(item.id || 0)), // Convert id to number
        0
      );
      if (this.selectedEntry.id == null) {
        this.selectedEntry.id = (maxId + 1).toString(); // Safely convert to string
        this.selectedEntry.activeFlag = true;
      } else {
        console.error('Invalid id:', this.selectedEntry?.id);
      }


      // Save new entry
      this.crudService.addData('cm', 'notetype', this.selectedEntry).subscribe(
        () => {
          this.snackBar.open('Note Type added successfully!', 'Close', {
            horizontalPosition: 'center',
            verticalPosition: 'top',
            duration: 50000,
            panelClass: ['success-snackbar']
          });
          this.loadData(); // Reload data to refresh the table
          this.clearForm(); // Clear form fields
        },
        (error) => {
          console.error('Error saving data:', error);
          this.snackBar.open('Error saving data!', 'Close', {
            horizontalPosition: 'center',
            verticalPosition: 'top',
            duration: 50000,
            panelClass: ['error-snackbar']
          });
        }
      );
    } else if (this.formMode === 'edit') {
      // Update existing entry

      if (this.selectedEntry && this.selectedEntry.id != null) {
        this.selectedEntry.id = this.selectedEntry.id.toString(); // Safely convert to string
      } else {
        console.error('Invalid id:', this.selectedEntry?.id);
      }
      this.crudService.updateData('cm', 'notetype', this.selectedEntry.id, this.selectedEntry).subscribe(
        () => {
          this.snackBar.open('Note Type updated successfully!', 'Close', {
            horizontalPosition: 'center',
            verticalPosition: 'top',
            duration: 50000,
            panelClass: ['mat-mdc-simple-snack-bar']
          });
          this.loadData(); // Reload data to refresh the table
          this.clearForm(); // Clear form fields
        },
        (error) => {
          console.error('Error updating data:', error);
          this.snackBar.open('Error updating data!', 'Close', {
            horizontalPosition: 'center',
            verticalPosition: 'top',
            duration: 50000,
            panelClass: ['error-snackbar']
          });
        }
      );
    }

    // Hide the form after saving
    this.isFormVisible = false;
    this.editingRowId = null;
  }


  saveRow(event: MatCheckboxChange, row: any): void {
    // Update the element's activeFlag value based on the checkbox status
    const isChecked = event.checked;
    const message = isChecked
      ? `Are you sure you want to activate the "${row.noteType}"?`
      : `Are you sure you want to inactivate the "${row.noteType}"?`;

    if (confirm(message)) {
      row.activeFlag = event.checked;
      console.log('Checkbox checked:', event.checked);
      this.crudService.updateData('cm', 'notetype', row.id, row).subscribe(() => {
        this.loadData();
        this.snackBar.open('Note Type updated successfully!', 'Close', {
          horizontalPosition: 'center',
          verticalPosition: 'top',
          duration: 5000

        });
      },
        (error) => {
          row.activeFlag = !event.checked;
          console.error('Error updating entry:', error);
          this.snackBar.open('Error updating Note Type!', 'Close', {
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


  confirmDelete(element: any): void {
    const confirmed = window.confirm(`Are you sure you want to delete the note "${element.noteType}"?`);
    if (confirmed) {
      // Perform the delete action
      this.deleteRow(element.id);
    }
  }

  deleteRow(id: number) {
    this.crudService.deleteData('cm', 'notetype', id, 'current_user').subscribe(
      () => {
        this.snackBar.open('Note Type deleted successfully!', 'Close', {
          horizontalPosition: 'center',
          verticalPosition: 'top',
          duration: 5000
        });
        this.loadData(); // Refresh the table data
      },
      (error) => {
        console.error('Error deleting entry:', error);
        this.snackBar.open('Error deleting Note Type!', 'Close', {
          horizontalPosition: 'center',
          verticalPosition: 'top',
          duration: 5000
        });
      }
    );
  }

  cancelForm() {
    this.isFormVisible = false;
    this.editingRowId = null;
    this.noteForm.reset();
  }

  clearForm() {
    this.noteForm.reset({
      noteType: '',
      activeFlag: false,
      comment: ''
    });
    this.formMode = 'add'; // Reset form to add mode
    this.selectedEntry = null;
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
    this.displayedColumns = ['id', 'noteType', 'noteTemplate', 'activeFlag', 'createdBy', 'createdOn', 'actions'];;
    this.displayedColumns.push(...this.visibleColumns.filter((col) => optionalColumns.includes(col)));
  }

  openTemplateDialog(template: string): void {
    console.log('Template passed to dialog:', template);
    this.dialog.open(DialogContentComponent, {
      width: '500px',
      data: { anyTemplate: template },
      panelClass: 'no-rounded-border',// Pass data explicitly
    });
  }

}
