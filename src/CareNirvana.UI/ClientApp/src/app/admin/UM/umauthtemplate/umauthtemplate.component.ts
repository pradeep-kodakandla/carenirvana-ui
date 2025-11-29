import { Component, ViewChild, OnInit, ElementRef, ChangeDetectorRef, ViewEncapsulation } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { CrudService } from 'src/app/service/crud.service';
import { MatDialog } from '@angular/material/dialog';
import { SettingsDialogComponent } from 'src/app/admin/UM/settings-dialog/settings-dialog.component';
import { MatSnackBar, MatSnackBarHorizontalPosition, MatSnackBarVerticalPosition } from '@angular/material/snack-bar';
import { MatCheckboxChange } from '@angular/material/checkbox';
import { DialogContentComponent } from 'src/app/admin/UM/dialog-content/dialog-content.component';

@Component({
  selector: 'app-umauthtemplate',
  templateUrl: './umauthtemplate.component.html',
  styleUrl: './umauthtemplate.component.css',
  encapsulation: ViewEncapsulation.None,
})
export class UmauthtemplateComponent implements OnInit {

  dataSource = new MatTableDataSource<any>();
  authClassStatusLookup: any[] = [];
  treatmentTypeLookup: any[] = [];
  placeOfServiceLookup: any[] = [];
  unitTypeLookup: any[] = [];
  providerDetailLookup: any[] = [];
  authBasicDetailLookup: any[] = [];
  diagLookup: any[] = [];
  displayedColumns: string[] = ['id', 'authType', 'authClass', 'maxUnits', 'activeFlag', 'createdBy', 'createdOn', 'actions'];
  isFormVisible: boolean = false;
  formMode: 'add' | 'edit' | 'view' = 'add';
  selectedEntry: any = {};
  visibleColumns: string[] = [];
  documentForm: FormGroup; // Reactive form
  editingRowId: string | null = null;

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;
  @ViewChild('documentTypeInput') documentTypeInput!: ElementRef;

  isFocused = false;

  onFocus() {
    this.isFocused = true;
  }

  onBlur() {
    this.isFocused = false;
  }

  constructor(private crudService: CrudService, private dialog: MatDialog, private cdr: ChangeDetectorRef, private fb: FormBuilder, private snackBar: MatSnackBar
  ) {
    this.documentForm = this.fb.group({
      authClass: ['', [Validators.required]],
      activeFlag: [false],
      authType: [''],
      placeOfServiceName: [''],
      unitType: [''],
      treatmentType:['']
    });
  }

  ngOnInit(): void {
    this.loadAuthClass();
    this.loadPlaceOfService();
    this.loadTreatmentType();
    this.loadUnitType();
    this.loadData();
    
  }

  loadData() {
    this.crudService.getData('um', 'authtemplate').subscribe((response) => {
      this.dataSource.data = response.filter(item => item.deletedOn == null).map((item: any) => ({
        ...item,
        authClass: this.authClassStatusLookup.find(opt => opt.id === item.authClassId)?.value || '',
      }));
      console.log("DataSource", response);
      this.dataSource.paginator = this.paginator;
      this.dataSource.sort = this.sort;
    });
  }
  /*Loading supporting drop down values*/
  loadAuthClass() {
    this.crudService.getData('um', 'authclass').subscribe((response) => {
      const filteredResponse = response.filter((item: any) => item.activeFlag === true);
      // Create a Map from the filtered response.
      this.authClassStatusLookup = filteredResponse.map((item: any) => ({
        id: item.id,
        value: item.authClass,
      }));
    });
  }

  loadTreatmentType() {
    this.crudService.getData('um', 'treatmenttype').subscribe((response) => {
      const filteredResponse = response.filter((item: any) => item.activeFlag === true);
      // Create a Map from the filtered response.
      this.treatmentTypeLookup = filteredResponse.map((item: any) => ({
        id: item.id,
        value: item.treatmentType,
      }));
    });
  }

  loadPlaceOfService() {
    this.crudService.getData('um', 'placeofservice').subscribe((response) => {
      const filteredResponse = response.filter((item: any) => item.activeFlag === true);
      // Create a Map from the filtered response.
      this.placeOfServiceLookup = filteredResponse.map((item: any) => ({
        id: item.id,
        value: item.placeOfServiceName,
      }));
    });
  }

  loadUnitType() {
    this.crudService.getData('um', 'unittype').subscribe((response) => {
      const filteredResponse = response.filter((item: any) => item.activeFlag === true);
      // Create a Map from the filtered response.
      this.unitTypeLookup = filteredResponse.map((item: any) => ({
        id: item.id,
        value: item.unitType,
      }));
    });
  }
  /*Loading supporting drop down values*/

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
    this.selectedEntry = element ? { ...element } : { id: null,  activeFlag: false, authType: '' };

    this.documentForm.patchValue({
      authClass: this.selectedEntry.authClassId || '',
      treatmentType: this.selectedEntry.treatmentTypeId || '',
      activeFlag: this.selectedEntry.activeFlag || false,
      placeOfServiceName: this.selectedEntry.placeOfServiceId || '',
      unitType: this.selectedEntry.unitTypeId || '',
    });

    this.isFormVisible = true;

    setTimeout(() => {
      this.documentTypeInput?.nativeElement.focus();
    }, 0);
  }

  saveEntry() {

    const formValue = this.documentForm.value;

    // Check if Auth Template is empty
    if (!formValue.authType) {
      this.snackBar.open('Auth Template is required!', 'Close', {
        horizontalPosition: 'center',
        verticalPosition: 'top',
        duration: 5000
      });
      return;
    }

    // Check for duplicate Auth Template
    const isDuplicate = this.dataSource.data.some(
      (entry) =>
        entry.authType?.toLowerCase() === formValue.authType.toLowerCase() &&
        entry.id !== (this.selectedEntry?.id || null) // Exclude the current entry being edited
    );

    if (isDuplicate) {
      this.snackBar.open('Auth Template already exists!', 'Close', {
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
        this.selectedEntry.authClassId = formValue.authClass;
        this.selectedEntry.treatmentTypeId = formValue.treatmentType;
        this.selectedEntry.placeOfServiceId = formValue.placeOfServiceName;
        this.selectedEntry.unitTypeId = formValue.unitType;
      } else {
        console.error('Invalid id:', this.selectedEntry?.id);
      }


      // Save new entry
      this.crudService.addData('um', 'authtemplate', this.selectedEntry).subscribe(
        () => {
          this.snackBar.open('Auth Template added successfully!', 'Close', {
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
      this.selectedEntry.authClassId = formValue.authClass;
      this.selectedEntry.treatmentTypeId = formValue.treatmentType;
      this.selectedEntry.placeOfServiceId = formValue.placeOfServiceName;
      this.selectedEntry.unitTypeId = formValue.unitType;

      if (this.selectedEntry && this.selectedEntry.id != null) {
        this.selectedEntry.id = this.selectedEntry.id.toString(); // Safely convert to string
      } else {
        console.error('Invalid id:', this.selectedEntry?.id);
      }
      this.crudService.updateData('um', 'authtemplate', this.selectedEntry.id, this.selectedEntry).subscribe(
        () => {
          this.snackBar.open('Auth Template updated successfully!', 'Close', {
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
      ? `Are you sure you want to activate the "${row.authType}"?`
      : `Are you sure you want to inactivate the "${row.authType}"?`;

    if (confirm(message)) {
      row.activeFlag = event.checked;
      console.log('Checkbox checked:', event.checked);
      this.crudService.updateData('um', 'authtemplate', row.id, row).subscribe(() => {
        this.loadData();
        this.snackBar.open('Auth Template updated successfully!', 'Close', {
          horizontalPosition: 'center',
          verticalPosition: 'top',
          duration: 5000

        });
      },
        (error) => {
          row.activeFlag = !event.checked;
          console.error('Error updating entry:', error);
          this.snackBar.open('Error updating Auth Template!', 'Close', {
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
    const confirmed = window.confirm(`Are you sure you want to delete the document "${element.authType}"?`);
    if (confirmed) {
      // Perform the delete action
      this.deleteRow(element.id);
    }
  }

  deleteRow(id: number) {
    this.crudService.deleteData('um', 'authtemplate', id, 'current_user').subscribe(
      () => {
        this.snackBar.open('Auth Template deleted successfully!', 'Close', {
          horizontalPosition: 'center',
          verticalPosition: 'top',
          duration: 5000
        });
        this.loadData(); // Refresh the table data
      },
      (error) => {
        console.error('Error deleting entry:', error);
        this.snackBar.open('Error deleting Auth Template!', 'Close', {
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
    this.documentForm.reset();
  }

  clearForm() {
    this.documentForm.reset({
      authType: '',
      activeFlag: false,
      authClass: ''
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
    this.displayedColumns = ['id', 'authType', 'authClass', 'maxUnits', 'activeFlag', 'createdBy', 'createdOn', 'actions'];
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
