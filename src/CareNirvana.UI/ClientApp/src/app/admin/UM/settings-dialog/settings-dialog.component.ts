import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

@Component({
  selector: 'app-settings-dialog',
  templateUrl: './settings-dialog.component.html',
  styleUrl: './settings-dialog.component.css'
})
export class SettingsDialogComponent {
  allColumns = ['updatedBy', 'updatedOn', 'deletedBy', 'deletedOn'];

  constructor(
    public dialogRef: MatDialogRef<SettingsDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any
  ) { }

  toggleColumn(column: string) {
    const index = this.data.visibleColumns.indexOf(column);
    if (index === -1) {
      this.data.visibleColumns.push(column);
    } else {
      this.data.visibleColumns.splice(index, 1);
    }
  }

  close() {
    this.dialogRef.close(this.data.visibleColumns);
  }
}
