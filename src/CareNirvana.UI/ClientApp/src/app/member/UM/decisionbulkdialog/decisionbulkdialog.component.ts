import { Component, Inject, OnInit } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

@Component({
  selector: 'app-decisionbulkdialog',
  templateUrl: './decisionbulkdialog.component.html'
})
export class DecisionbulkdialogComponent implements OnInit {

  displayedColumns: string[] = ['serviceCode', 'decisionStatus', 'approved', 'denied', 'requested'];
  dataSource: any[] = [];  // ✅ array to feed the table

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: any,
    private dialogRef: MatDialogRef<DecisionbulkdialogComponent>
  ) { }

  ngOnInit() {
    console.log('DecisionbulkdialogComponent initialized with data:', this.data);
    this.dataSource = this.data?.decisions.decisionDetails?.entries || [];
    console.log('Data source set for table:', this.dataSource);
  }

  onBulkApprove() {
    this.dialogRef.close({
      action: 'approve',
      decisionData: this.dataSource
    });
  }

  onBulkDeny() {
    this.dialogRef.close({
      action: 'deny',
      decisionData: this.dataSource
    });
  }
}
