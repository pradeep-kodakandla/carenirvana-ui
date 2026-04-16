import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

export interface CaseConfirmLeaveDialogData {
  /** Dialog heading, e.g. "Unsaved Changes" */
  title?: string;
  /** Body copy explaining what will happen on leave */
  message?: string;
  /** Label for the "stay" / cancel button  (default: "Stay & Continue Editing") */
  cancelText?: string;
  /** Label for the "leave" / confirm button (default: "Discard & Leave") */
  confirmText?: string;
}

/**
 * Reusable "confirm leave" dialog for Case workflows.
 *
 * Usage:
 *   const ref = this.dialog.open(CaseConfirmLeaveDialogComponent, {
 *     panelClass:    'leave-dialog-panel',
 *     backdropClass: 'leave-dialog-backdrop',
 *     disableClose:  true,
 *     data: {
 *       title:       'Unsaved Changes',
 *       message:     'You have unsaved changes. Leaving now will discard your modifications.',
 *       cancelText:  'Stay & Continue Editing',
 *       confirmText: 'Discard & Leave',
 *     } satisfies CaseConfirmLeaveDialogData,
 *   });
 *
 *   ref.afterClosed().subscribe((confirmed: boolean) => {
 *     if (confirmed) { // user chose to leave }
 *   });
 *
 * Global styles.css must include:
 *   .leave-dialog-backdrop {
 *     background: rgba(15,23,42,.45) !important;
 *     backdrop-filter: blur(2px);
 *   }
 */
@Component({
  selector: 'app-case-confirm-leave-dialog',
  templateUrl: './case-confirm-leave-dialog.component.html',
  styleUrl: './case-confirm-leave-dialog.component.css',
})
export class CaseConfirmLeaveDialogComponent {

  readonly title: string;
  readonly message: string;
  readonly cancelText: string;
  readonly confirmText: string;

  constructor(
    private dialogRef: MatDialogRef<CaseConfirmLeaveDialogComponent>,
    @Inject(MAT_DIALOG_DATA) data: CaseConfirmLeaveDialogData,
  ) {
    this.title       = data?.title       ?? 'Unsaved Changes';
    this.message     = data?.message     ?? 'You have unsaved changes on this page. Leaving now will discard your modifications.';
    this.cancelText  = data?.cancelText  ?? 'Stay & Continue Editing';
    this.confirmText = data?.confirmText ?? 'Discard & Leave';
  }

  /** User chose to remain on the page — close with false. */
  stay(): void {
    this.dialogRef.close(false);
  }

  /** User confirmed they want to leave — close with true. */
  leave(): void {
    this.dialogRef.close(true);
  }
}
