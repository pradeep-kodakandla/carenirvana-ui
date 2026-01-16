import { inject } from '@angular/core';
import { CanDeactivateFn } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { Observable, of } from 'rxjs';
import { AuthconfirmleavedialogComponent } from 'src/app/member/UM/components/authconfirmleavedialog/authconfirmleavedialog.component';

export interface AuthPendingChanges {
  hasPendingChanges: () => boolean;
}

export const authpendingchangesGuard: CanDeactivateFn<AuthPendingChanges> = (component) => {
  if (!component || !component.hasPendingChanges || !component.hasPendingChanges()) {
    return true;
  }

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
    .afterClosed() as Observable<boolean>;
};
