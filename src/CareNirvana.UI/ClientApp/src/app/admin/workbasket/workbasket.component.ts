// src/app/admin/workbasket/workbasket.component.ts
import { Component, OnInit, ViewChild, inject } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatTableDataSource } from '@angular/material/table';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatSelectChange } from '@angular/material/select';

import {
  WorkBasket,
  WorkBasketCreateDto,
  WorkBasketUpdateDto,
  WorkBasketView
} from 'src/app/service/workbasket.service';
import { WorkGroup } from 'src/app/service/workbasket.service';
import { WorkbasketService } from 'src/app/service/workbasket.service';


@Component({
  selector: 'app-workbasket',
  templateUrl: './workbasket.component.html',
  styleUrls: ['./workbasket.component.css']
})
export class WorkbasketComponent implements OnInit {
  displayedColumns: string[] = [
    'workBasketCode',
    'workBasketName',
    'description',
    'workGroups',
    'activeFlag',
    'createdBy',
    'createdOn',
    'actions'
  ];

  dataSource = new MatTableDataSource<WorkBasket>([]);
  allWorkGroups: WorkGroup[] = [];

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;

  form!: FormGroup;
  isFormVisible = false;
  formMode: 'add' | 'edit' = 'add';
  selectedId: number | null = null;      // current WorkBasketId in edit mode
  selectedView?: WorkBasketView | null;  // includes workGroupIds

  private wbService = inject(WorkbasketService);
  private fb = inject(FormBuilder);
  private snackBar = inject(MatSnackBar);

  ngOnInit(): void {
    this.initForm();
    this.loadWorkGroups();
    this.loadBaskets();
  }

  private initForm(): void {
    this.form = this.fb.group({
      workBasketCode: ['', Validators.required],
      workBasketName: ['', Validators.required],
      description: [''],
      activeFlag: [true],
      workGroupIds: [[] as number[]] // multi select
    });
  }

  private loadWorkGroups(): void {
    this.wbService.getwgAll(true).subscribe({
      next: (groups) => (this.allWorkGroups = groups),
      error: () => this.toast('Failed to load WorkGroups', 'error')
    });
  }

  private loadBaskets(): void {
    this.wbService.getAll(true).subscribe({
      next: (list) => {
        this.dataSource.data = list;
        this.dataSource.paginator = this.paginator;
        this.dataSource.sort = this.sort;
      },
      error: () => this.toast('Failed to load WorkBaskets', 'error')
    });
  }

  // For search box
  applyFilter(event: Event): void {
    const val = (event.target as HTMLInputElement).value?.trim().toLowerCase();
    this.dataSource.filter = val;
  }

  // Open add/edit form
  openForm(mode: 'add' | 'edit', wb?: WorkBasket): void {
    this.formMode = mode;
    this.isFormVisible = true;
    this.selectedId = null;
    this.selectedView = null;

    if (mode === 'add') {
      this.form.reset({
        workBasketCode: '',
        workBasketName: '',
        description: '',
        activeFlag: true,
        workGroupIds: []
      });
      return;
    }

    // edit mode: fetch full view (so we have workGroupIds)
    if (wb?.workBasketId) {
      this.selectedId = wb.workBasketId;
      this.wbService.getById(wb.workBasketId).subscribe({
        next: (view) => {
          this.selectedView = view;
          this.form.patchValue({
            workBasketCode: view.workBasketCode,
            workBasketName: view.workBasketName,
            description: view.description ?? '',
            activeFlag: view.activeFlag,
            workGroupIds: view.workGroupIds ?? []
          });
        },
        error: () => this.toast('Failed to load WorkBasket details', 'error')
      });
    }
  }

  cancelForm(): void {
    this.isFormVisible = false;
    this.form.reset();
    this.selectedId = null;
    this.selectedView = null;
  }

  // Create or Update
  save(): void {
    if (this.form.invalid) {
      this.toast('Please fill required fields', 'warning');
      return;
    }
    const val = this.form.value as {
      workBasketCode: string;
      workBasketName: string;
      description?: string | null;
      activeFlag: boolean;
      workGroupIds: number[];
    };

    if (this.formMode === 'add') {
      const dto: WorkBasketCreateDto = {
        workBasketCode: val.workBasketCode,
        workBasketName: val.workBasketName,
        description: val.description ?? '',
        createdBy: 'admin',
        workGroupIds: val.workGroupIds ?? []
      };
      console.log('Creating WorkBasket:', dto);
      this.wbService.create(dto).subscribe({
        next: () => {
          this.toast('WorkBasket created', 'success');
          this.loadBaskets();
          this.cancelForm();
        },
        error: (err) => this.toast(err?.error ?? 'Create failed', 'error')
      });
    } else if (this.formMode === 'edit' && this.selectedId != null) {
      const dto: WorkBasketUpdateDto = {
        workBasketId: this.selectedId,
        workBasketCode: val.workBasketCode,
        workBasketName: val.workBasketName,
        description: val.description ?? '',
        activeFlag: !!val.activeFlag,
        updatedBy: 'admin',
        workGroupIds: val.workGroupIds ?? []
      };
      this.wbService.update(dto).subscribe({
        next: () => {
          this.toast('WorkBasket updated', 'success');
          this.loadBaskets();
          this.cancelForm();
        },
        error: (err) => this.toast(err?.error ?? 'Update failed', 'error')
      });
    }
  }

  // Soft delete
  confirmDelete(wb: WorkBasket): void {
    if (!confirm(`Delete WorkBasket: ${wb.workBasketName}?`)) return;
    this.wbService.softDelete(wb.workBasketId, 'admin').subscribe({
      next: () => {
        this.toast('WorkBasket deleted', 'success');
        this.loadBaskets();
      },
      error: () => this.toast('Delete failed', 'error')
    });
  }

  // Helpers
  getGroupName(id: number): string {
    return this.allWorkGroups.find(g => g.workGroupId === id)?.workGroupName ?? `#${id}`;
  }

  onGroupsChange(e: MatSelectChange): void {
    // no-op; kept for hook usage (e.g. validation or dependent UI)
  }

  private toast(msg: string, type: 'success' | 'error' | 'warning' = 'success') {
    this.snackBar.open(msg, 'Close', { duration: 2500, panelClass: [`${type}-snackbar`] });
  }
}
