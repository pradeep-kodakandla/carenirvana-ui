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
        title: 'Leave this page?',
        message: 'You have unsaved changes. If you leave now, your changes will be lost.',
        confirmText: 'Leave',
        cancelText: 'Stay',
      },
    })
    .afterClosed()
    .pipe(map(result => result === true)) as Observable<boolean>;
};
