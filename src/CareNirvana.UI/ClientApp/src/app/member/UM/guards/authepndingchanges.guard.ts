import { inject } from '@angular/core';
import { CanDeactivateFn } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { AuthconfirmleavedialogComponent } from 'src/app/member/UM/components/authconfirmleavedialog/authconfirmleavedialog.component';

export const authpendingchangesGuard: CanDeactivateFn<any> = (component) => {
  const c: any = component;

  // Support multiple naming styles across wizard steps/shell
  const hasChanges = !!(
    c?.hasPendingChanges?.() ??
    c?.authHasUnsavedChanges?.() ??
    c?.hasUnsavedChanges?.() ??
    false
  );

  if (!hasChanges) return true;

  const dialog = inject(MatDialog);

  return dialog
    .open(AuthconfirmleavedialogComponent, {
      width: '420px',
      disableClose: true,
      data: {
        title: 'Unsaved Changes',
        message: 'You have unsaved changes on this page. Switching now will discard your modifications.',
        cancelText: 'Stay & Continue Editing',
        confirmText: 'Discard & Switch'
      },
    })
    .afterClosed()
    .pipe(map(result => result === true)) as Observable<boolean>;
};
