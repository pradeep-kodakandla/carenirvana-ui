import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

@Component({
  selector: 'app-validation-error-dialog',
  styleUrl: './validation-error-dialog.component.css',
  templateUrl: './validation-error-dialog.component.html',
})

/**/
export class ValidationErrorDialogComponent {
  constructor(
    public dialogRef: MatDialogRef<ValidationErrorDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: {
      title: string;
      messages: { msg: string; type: 'error' | 'warning' }[];
      allowContinue?: boolean;
    }
  ) { }
}
