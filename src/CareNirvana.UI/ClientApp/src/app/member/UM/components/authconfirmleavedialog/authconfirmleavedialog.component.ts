import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

export interface AuthConfirmLeaveDialogData {
  title?: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
}

@Component({
  selector: 'app-authconfirmleavedialog',
  templateUrl: './authconfirmleavedialog.component.html',
  styleUrls: ['./authconfirmleavedialog.component.css']
})
export class AuthconfirmleavedialogComponent {
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;

  constructor(
    private dialogRef: MatDialogRef<AuthconfirmleavedialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: AuthConfirmLeaveDialogData
  ) {
    this.title = data?.title ?? 'Unsaved Changes';
    this.message = data?.message ?? 'You have unsaved changes. Leaving now will discard your modifications.';
    this.confirmText = data?.confirmText ?? 'Discard & Switch';
    this.cancelText = data?.cancelText ?? 'Stay & Continue Editing';
  }

  stay(): void {
    this.dialogRef.close(false);
  }

  leave(): void {
    this.dialogRef.close(true);
  }
}
