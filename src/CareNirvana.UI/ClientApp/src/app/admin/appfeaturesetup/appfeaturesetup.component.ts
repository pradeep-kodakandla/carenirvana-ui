import { Component, OnInit } from '@angular/core';
import { CrudService } from 'src/app/service/crud.service';

@Component({
  selector: 'app-appfeaturesetup',
  templateUrl: './appfeaturesetup.component.html',
  styleUrl: './appfeaturesetup.component.css'
})
export class AppfeaturesetupComponent implements OnInit {
  data: any[] = [];
  isFormVisible: boolean = false;
  formMode: 'add' | 'edit' | 'view' = 'add';
  selectedEntry: any = {};

  constructor(private crudService: CrudService) { }

  ngOnInit(): void {
    this.loadData();
  }

  loadData() {
    this.crudService.getData('admin', 'data').subscribe((response) => {
      this.data = response.filter(item => item.deletedOn == null);
    });
  }

  addEntry() {
    this.formMode = 'add';
    this.selectedEntry = { name: '', email: '', role: '' };
    this.isFormVisible = true;
  }

  editEntry(item: any) {
    this.formMode = 'edit';
    this.selectedEntry = { ...item };
    this.isFormVisible = true;
  }

  viewEntry(item: any) {
    this.formMode = 'view';
    this.selectedEntry = { ...item };
    this.isFormVisible = true;
  }

  deleteEntry(id: number) {
    this.crudService.deleteData('admin', 'data', id, 'current_user').subscribe(() => {
      this.loadData();
    });
  }

  saveEntry() {
    if (this.formMode === 'add') {
      this.crudService.addData('admin', 'data', this.selectedEntry).subscribe(() => {
        this.loadData();
      });
    } else if (this.formMode === 'edit') {
      this.crudService.updateData('admin', 'data', this.selectedEntry.id, this.selectedEntry).subscribe(() => {
        this.loadData();
      });
    }
    this.isFormVisible = false;
  }

  cancelForm() {
    this.isFormVisible = false;
  }
}
