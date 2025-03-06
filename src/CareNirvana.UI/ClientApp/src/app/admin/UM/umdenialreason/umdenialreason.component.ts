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
  selector: 'app-umdenialreason',
  templateUrl: './umdenialreason.component.html',
  styleUrl: './umdenialreason.component.css',
  encapsulation: ViewEncapsulation.None,
})
export class UmdenialreasonComponent implements OnInit {

  dataSource = new MatTableDataSource<any>();
  displayedColumns: string[] = ['id', 'denialType', 'denialReason', 'memberNote', 'providerNote', 'activeFlag', 'createdBy', 'createdOn',  'actions'];
  isFormVisible: boolean = false;
  formMode: 'add' | 'edit' | 'view' = 'add';
  selectedEntry: any = {};
  visibleColumns: string[] = [];
  documentForm: FormGroup; // Reactive form
  editingRowId: string | null = null;
  denialTypeOptions: any[] = []; // Array to store denial types options
  statusLookup: Map<string, string> = new Map(); // Map to store status ID and status value

  // All columns including hidden ones

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;
  @ViewChild('denialReasonSelect') denialReasonSelect!: ElementRef;


  constructor(private crudService: CrudService, private dialog: MatDialog, private cdr: ChangeDetectorRef, private fb: FormBuilder, private snackBar: MatSnackBar
  ) {
    this.documentForm = this.fb.group({
      denialReason: ['', [Validators.required]],
      activeFlag: [false],
      denialType: ['', [Validators.required]],
      memberNote: [''],
      providerNote: ['']
    });
  }

  ngOnInit(): void {
    this.loadDenialTypeOptions();
    this.loadData();
  }

  loadData() {
    this.crudService.getData('um', 'denialreason').subscribe((response) => {
      this.dataSource.data = response.filter(item => item.deletedOn == null).map((item: any) => ({
        ...item,
        denialType: this.statusLookup.get(item.denialTypeId) || '', // Map decisionStatus to its value
      }));
      this.dataSource.paginator = this.paginator;
      this.dataSource.sort = this.sort;
    });
  }

  loadDenialTypeOptions() {
    this.crudService.getData('um', 'denialtype').subscribe(
      (response: any) => {
        if (response && Array.isArray(response)) {
          // Map the response directly to decisionStatusOptions
          this.denialTypeOptions = response.filter(item => item.activeFlag == true && item.deletedOn == null).map((item: any) => ({
            id: item.id,
            value: item.denialType || item.denialType, // Handle both 'status' and 'decisionStatus' keys
          }));
          // Create a lookup map for quick ID-to-value mapping
          this.statusLookup = new Map(
            this.denialTypeOptions.map(option => [option.id, option.value])
          );
          console.log('Status Lookup:', this.statusLookup);
        } else {
          console.error('Unexpected response structure:', response);
          this.snackBar.open('Error: Invalid status data structure!', 'Close', {
            horizontalPosition: 'center',
            verticalPosition: 'top',
            duration: 5000,
          });
        }
      },
      (error) => {
        console.error('Error loading status options:', error);
        this.snackBar.open('Error loading status options!', 'Close', {
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

  openForm(mode: 'add' | 'edit' | 'view', element: any = null) {

    if (mode === 'edit') {
      this.editingRowId = element.id; // Disable actions for this row
    }
    this.formMode = mode;
    this.selectedEntry = element ? { ...element } : { id: null, denialTypeId: null, denialReason: '', activeFlag: false, memberNote: '', providerNote: '' };
    this.documentForm.patchValue({
      denialType: this.selectedEntry.denialTypeId || null,
      denialReason: this.selectedEntry.denialReason || '',
      activeFlag: this.selectedEntry.activeFlag || false,
      memberNote: this.selectedEntry.memberNote || '',
      providerNote: this.selectedEntry.providerNote || '',
    });
    this.isFormVisible = true;
    setTimeout(() => {
      this.denialReasonSelect?.nativeElement.focus();
    }, 0);

    console.log('Element', element);
    console.log('SelectedEntry', this.selectedEntry);

    // Patch the form values for editing


    console.log('After Element', element);
    console.log('After SelectedEntry', this.selectedEntry);
  }

  saveEntry() {
    console.log('Saving row:', this.selectedEntry);
    const formValue = this.documentForm.value;

    // Check if Denial Reason is empty
    if (!formValue.denialReason) {
      this.snackBar.open('Denial Reason is required!', 'Close', {
        horizontalPosition: 'center',
        verticalPosition: 'top',
        duration: 5000
      });
      return;
    }

    // Check for duplicate Denial Reason
    const isDuplicate = this.dataSource.data.some(
      (entry) =>
        entry.denialReason?.toLowerCase() === formValue.denialReason.toLowerCase() &&
        entry.id !== (this.selectedEntry?.id || null) // Exclude the current entry being edited
    );

    if (isDuplicate) {
      this.snackBar.open('Denial Reason already exists!', 'Close', {
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
        this.selectedEntry.denialTypeId = formValue.denialType;
      } else {
        console.error('Invalid id:', this.selectedEntry?.id);
      }
 
      // Save new entry
      this.crudService.addData('um', 'denialreason', this.selectedEntry).subscribe(
        () => {
          this.snackBar.open('Denial Reason added successfully!', 'Close', {
            horizontalPosition: 'center',
            verticalPosition: 'top',
            duration: 5000,
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
            duration: 5000,
            panelClass: ['error-snackbar']
          });
        }
      );
    } else if (this.formMode === 'edit') {
      // Update existing entry


      this.selectedEntry.denialTypeId = formValue.denialType;

      if (this.selectedEntry && this.selectedEntry.id != null) {
        this.selectedEntry.id = this.selectedEntry.id.toString(); // Safely convert to string
      } else {
        console.error('Invalid id:', this.selectedEntry?.id);
      }
      this.crudService.updateData('um', 'denialreason', this.selectedEntry.id, this.selectedEntry).subscribe(
        () => {
          this.snackBar.open('Denial Reason updated successfully!', 'Close', {
            horizontalPosition: 'center',
            verticalPosition: 'top',
            duration: 5000,
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
            duration: 5000,
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
      ? `Are you sure you want to activate the "${row.denialReason}"?`
      : `Are you sure you want to inactivate the "${row.denialReason}"?`;

    if (confirm(message)) {
      row.activeFlag = event.checked;
      console.log('Checkbox checked:', event.checked);
      this.crudService.updateData('um', 'denialreason', row.id, row).subscribe(() => {
        this.loadData();
        this.snackBar.open('Denial Reason updated successfully!', 'Close', {
          horizontalPosition: 'center',
          verticalPosition: 'top',
          duration: 5000

        });
      },
        (error) => {
          row.activeFlag = !event.checked;
          console.error('Error updating entry:', error);
          this.snackBar.open('Error updating Denial Reason!', 'Close', {
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
    const confirmed = window.confirm(`Are you sure you want to delete the document "${element.denialReason}"?`);
    if (confirmed) {
      // Perform the delete action
      this.deleteRow(element.id);
    }
  }

  deleteRow(id: number) {
    this.crudService.deleteData('um', 'denialreason', id, 'current_user').subscribe(
      () => {
        this.snackBar.open('Denial Reason deleted successfully!', 'Close', {
          horizontalPosition: 'center',
          verticalPosition: 'top',
          duration: 5000
        });
        this.loadData(); // Refresh the table data
      },
      (error) => {
        console.error('Error deleting entry:', error);
        this.snackBar.open('Error deleting Denial Reason!', 'Close', {
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
      denialReason: '',
      activeFlag: false,
      denialType: null
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
    this.displayedColumns = ['id', 'denialType', 'denialReason', 'memberNote', 'providerNote', 'activeFlag', 'createdBy', 'createdOn', 'actions'];;
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
