import { Injectable } from '@angular/core';
import { CanDeactivate } from '@angular/router';
import { CaseUnsavedChangesAwareService } from 'src/app/member/AG/guards/services/caseunsavedchangesaware.service';

@Injectable({ providedIn: 'root' })

export class casependingchangesGuard implements CanDeactivate<CaseUnsavedChangesAwareService>
{
  canDeactivate(
    component: CaseUnsavedChangesAwareService,
  ): boolean | Promise<boolean> {

    // No unsaved changes → allow navigation immediately.
    if (!component?.caseHasUnsavedChanges?.()) {
      return true;
    }

    // Preferred path: component shows its own styled dialog.
    if (typeof component.canLeaveStep === 'function') {
      return component.canLeaveStep();
    }

    // Legacy fallback (should not be reached once all components implement canLeaveStep).
    return window.confirm(
      'You have unsaved changes. Leaving now will discard your modifications.\n\nDo you want to continue?'
    );
  }
}
