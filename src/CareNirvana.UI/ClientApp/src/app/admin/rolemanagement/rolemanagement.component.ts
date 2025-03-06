import { Component, ViewChild, OnInit } from '@angular/core';
import { Router } from '@angular/router';
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

@Component({
  selector: 'app-rolemanagement',
  templateUrl: './rolemanagement.component.html',
  styleUrl: './rolemanagement.component.css'
})
export class RolemanagementComponent implements OnInit {

  dataSource = new MatTableDataSource<any>();
  displayedColumns: string[] = ['id', 'name', 'managerAccess', 'qocAccess', 'sensitive', 'createdBy', 'createdOn', 'actions'];
  isFormVisible: boolean = false;
  formMode: 'add' | 'edit' | 'view' = 'add';
  selectedEntry: any = {};

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;

  constructor(private crudService: CrudService) { }

  ngOnInit(): void {
    this.loadData();
  }

  loadData() {
    this.crudService.getData('admin','role').subscribe((response) => {
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
    this.formMode = mode;
    this.selectedEntry = element ? { ...element } : { name: '', managerAccess: '', qocAccess: '', sensitive: '' };
    this.isFormVisible = true;
  }

  saveEntry() {
    console.log('Saving row:', this.selectedEntry);
    if (this.formMode === 'add') {
      const maxId = this.dataSource.data.reduce(
        (max, item) => Math.max(max, Number(item.id || 0)), // Convert id to number
        0
      );
      this.selectedEntry.id = maxId + 1;
      this.crudService.addData('admin', 'role', this.selectedEntry).subscribe(() => {
        this.loadData();
      });
    } else if (this.formMode === 'edit') {
      this.crudService.updateData('admin', 'role', this.selectedEntry.id, this.selectedEntry).subscribe(() => {
        this.loadData();
      });
    }
    this.isFormVisible = false;
  }

  deleteRow(id: number) {
    this.crudService.deleteData('admin', 'role', id, 'current_user').subscribe(() => {
      this.loadData();
    });
  }

  cancelForm() {
    this.isFormVisible = false;
  }
}
