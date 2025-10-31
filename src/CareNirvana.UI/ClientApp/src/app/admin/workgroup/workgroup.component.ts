// src/app/admin/workgroup/workgroup.component.ts
import { Component, OnInit, ViewChild } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatTableDataSource } from '@angular/material/table';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatSnackBar } from '@angular/material/snack-bar';
import { WorkGroup, WorkbasketService } from 'src/app/service/workbasket.service';


@Component({
  selector: 'app-workgroup',
  templateUrl: './workgroup.component.html',
  styleUrls: ['./workgroup.component.css']
})
export class WorkgroupComponent implements OnInit {
  displayedColumns: string[] = [
    'workGroupCode',
    'workGroupName',
    'description',
    'isFax',
    'isProviderPortal',
    'activeFlag',
    'createdBy',
    'createdOn',
    'actions'
  ];

  dataSource = new MatTableDataSource<WorkGroup>([]);
  visibleColumns: string[] = ['updatedBy', 'updatedOn', 'deletedBy', 'deletedOn'];

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;

  workgroupForm!: FormGroup;
  selectedEntry!: WorkGroup;
  isFormVisible = false;
  formMode: 'add' | 'edit' | 'view' = 'add';
  editingRowId: number | null = null;

  constructor(
    private fb: FormBuilder,
    private service: WorkbasketService,
    private snackBar: MatSnackBar
  ) { }

  ngOnInit(): void {
    this.loadData();
    this.initForm();
  }

  initForm(): void {
    this.workgroupForm = this.fb.group({
      workGroupCode: ['', Validators.required],
      workGroupName: ['', Validators.required],
      description: [''],
      isFax: [false],
      isProviderPortal: [false],
      activeFlag: [true]
    });
  }

  loadData(): void {
    this.service.getwgAll(true).subscribe({
      next: res => {
        this.dataSource.data = res;
        this.dataSource.paginator = this.paginator;
        this.dataSource.sort = this.sort;
      },
      error: () => this.showMessage('Failed to load Workgroups', 'error')
    });
  }

  applyFilter(event: Event): void {
    const filterValue = (event.target as HTMLInputElement).value.trim().toLowerCase();
    this.dataSource.filter = filterValue;
  }

  openForm(mode: 'add' | 'edit' | 'view', entry?: WorkGroup): void {
    this.formMode = mode;
    this.isFormVisible = true;

    if (mode === 'add') {
      this.selectedEntry = {} as WorkGroup;
      this.workgroupForm.reset({
        workGroupCode: '',
        workGroupName: '',
        description: '',
        isFax: false,
        isProviderPortal: false,
        activeFlag: true
      });
    } else if (entry) {
      this.selectedEntry = { ...entry };
      this.workgroupForm.patchValue(entry);
    }
  }

  cancelForm(): void {
    this.isFormVisible = false;
    this.workgroupForm.reset();
  }

  saveEntry(): void {
    if (this.workgroupForm.invalid) {
      this.showMessage('Please fill required fields', 'warning');
      return;
    }

    const formValue = this.workgroupForm.value as WorkGroup;

    if (this.formMode === 'add') {
      const newItem: any = {
        ...formValue,
        createdBy: 'admin'
      };

      this.service.createwg(newItem).subscribe({
        next: () => {
          this.showMessage('Workgroup created successfully', 'success');
          this.loadData();
          this.cancelForm();
        },
        error: () => this.showMessage('Failed to create Workgroup', 'error')
      });
    } else if (this.formMode === 'edit' && this.selectedEntry) {
      const updated: any = {
        ...this.selectedEntry,
        ...formValue,
        updatedBy: 'admin'
      };

      this.service.updatewg(updated).subscribe({
        next: () => {
          this.showMessage('Workgroup updated successfully', 'success');
          this.loadData();
          this.cancelForm();
        },
        error: () => this.showMessage('Failed to update Workgroup', 'error')
      });
    }
  }

  confirmDelete(entry: WorkGroup): void {
    if (!confirm(`Delete Workgroup: ${entry.workGroupName}?`)) return;
    this.service.softDeletewg(entry.workGroupId, 'admin').subscribe({
      next: () => {
        this.showMessage('Workgroup deleted', 'success');
        this.loadData();
      },
      error: () => this.showMessage('Delete failed', 'error')
    });
  }

  showMessage(msg: string, type: 'success' | 'error' | 'warning'): void {
    this.snackBar.open(msg, 'Close', {
      duration: 3000,
      panelClass: [`${type}-snackbar`]
    });
  }
}
