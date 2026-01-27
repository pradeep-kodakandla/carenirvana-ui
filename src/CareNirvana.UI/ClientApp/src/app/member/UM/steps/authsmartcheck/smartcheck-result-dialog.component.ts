import { Component, Inject, ViewEncapsulation } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

export type SmartCheckDialogAction = 'primary' | 'secondary';

export interface SmartCheckDialogDetail {
  label: string;
  value: string;
}

export interface SmartCheckDialogData {
  title: string;
  message: string;
  details?: SmartCheckDialogDetail[];
  tone?: 'info' | 'warning' | 'success' | 'error';
  primaryText: string;
  secondaryText?: string;
  showSecondary?: boolean;
}

@Component({
  selector: 'app-smartcheck-result-dialog',
  templateUrl: './smartcheck-result-dialog.component.html',
  styleUrls: ['./smartcheck-result-dialog.component.css'],
  // Use None so the panelClass styling can target the mat-dialog container reliably.
  encapsulation: ViewEncapsulation.None,
})
export class SmartCheckResultDialogComponent {
  constructor(
    private dialogRef: MatDialogRef<SmartCheckResultDialogComponent, SmartCheckDialogAction>,
    @Inject(MAT_DIALOG_DATA) public data: SmartCheckDialogData
  ) {}

  get tone(): NonNullable<SmartCheckDialogData['tone']> {
    return (this.data.tone ?? 'info') as any;
  }

  get showSecondary(): boolean {
    if (this.data.showSecondary === false) return false;
    return !!this.data.secondaryText;
  }

  onPrimary(): void {
    this.dialogRef.close('primary');
  }

  onSecondary(): void {
    this.dialogRef.close('secondary');
  }
}
