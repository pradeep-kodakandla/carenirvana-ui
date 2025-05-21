import { Component, ViewChild, OnInit, ViewEncapsulation } from '@angular/core';
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
import { RolepermissionService, CfgRole } from 'src/app/service/rolepermission.service';
import { PermissionManagerComponent } from '../appfeaturesetup/permission-manager/permission-manager.component';

@Component({
  selector: 'app-rolemanagement',
  templateUrl: './rolemanagement.component.html',
  styleUrl: './rolemanagement.component.css',
  encapsulation: ViewEncapsulation.None,
})
export class RolemanagementComponent implements OnInit {

  dataSource = new MatTableDataSource<any>();
  displayedColumns: string[] = ['roleId', 'name', 'managerAccess', 'qocAccess', 'sensitive', 'createdBy', 'createdOn', 'actions'];
  isFormVisible: boolean = false;
  formMode: 'add' | 'edit' | 'view' = 'add';
  selectedEntry: any = {};
  parsedPermissionsJson: any = [];

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;
  @ViewChild(PermissionManagerComponent)
  permissionManagerComponent!: PermissionManagerComponent;

  constructor(private roleService: RolepermissionService) { }

  ngOnInit(): void {
    this.loadData();
  }

  loadData() {
    this.roleService.getRoles().subscribe((response) => {
      const normalized = response
        .filter(item => item.deletedOn == null)
        .map(item => this.toCamelCase(item));

      this.dataSource.data = normalized;
      this.dataSource.paginator = this.paginator;
      this.dataSource.sort = this.sort;
    });
  }


  toCamelCase(obj: any): any {
    const result: any = {};
    for (const key of Object.keys(obj)) {
      const camelKey = key.charAt(0).toLowerCase() + key.slice(1);
      result[camelKey] = obj[key];
    }
    return result;
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

    if (element) {
      const normalized = {
        roleId: element.roleId,
        name: element.name,
        managerAccess: element.managerAccess === 'Yes',
        qocAccess: element.qocAccess === 'Yes',
        sensitive: element.sensitive === 'Yes',
        permissions: element.permissions
      };

      this.selectedEntry = normalized;

      try {
        
        this.parsedPermissionsJson = JSON.parse(normalized.permissions ?? '[]');
      } catch (e) {
        console.error('Invalid permissions JSON', e);
        this.parsedPermissionsJson = [];
      }
    } else {
      this.selectedEntry = {
        name: '',
        managerAccess: false,
        qocAccess: false,
        sensitive: false,
        permissions: ''
      };

      this.parsedPermissionsJson = [];
    }

    this.isFormVisible = true;
  }

  saveEntry() {
    const fullPermissionJson = this.permissionManagerComponent.getFinalPermissionJson();
    this.selectedEntry.permissions = fullPermissionJson;

    const role: CfgRole = {
      ...this.selectedEntry,
      managerAccess: this.selectedEntry.managerAccess ? 'Yes' : '',
      qocAccess: this.selectedEntry.qocAccess ? 'Yes' : '',
      sensitive: this.selectedEntry.sensitive ? 'Yes' : '',
      permissions: JSON.stringify(fullPermissionJson),
      createdBy: 1 // or your actual userId
    };

    if (this.formMode === 'add') {
      this.roleService.addRole(role).subscribe(() => {
        this.loadData();
      });
    } else if (this.formMode === 'edit') {
      this.roleService.updateRole(this.selectedEntry.roleId, role).subscribe(() => {
        this.loadData();
      });
    }
    this.isFormVisible = false;
  }

  deleteRow(id: number) {
    this.roleService.deleteRole(id, 1).subscribe(() => {
      this.loadData();
    });
  }

  cancelForm() {
    this.isFormVisible = false;
  }



}
