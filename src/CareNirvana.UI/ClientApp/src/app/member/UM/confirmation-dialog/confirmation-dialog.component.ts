// confirmation-dialog.component.ts
import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

@Component({
  selector: 'app-confirmation-dialog',
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content [innerHTML]="data.message"></mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="onCancel()">Cancel</button>
      <button mat-raised-button color="primary" (click)="onContinue()">Continue</button>
    </mat-dialog-actions>
  `,
  styles: [`
    mat-dialog-content { font-size: 14px; color: #374151; }
    mat-dialog-actions button { min-width: 100px; }
  `]
})
export class ConfirmationDialogComponent {
  constructor(
    public dialogRef: MatDialogRef<ConfirmationDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any
  ) { }

  onCancel() { this.dialogRef.close('cancel'); }
  onContinue() { this.dialogRef.close('continue'); }
}
