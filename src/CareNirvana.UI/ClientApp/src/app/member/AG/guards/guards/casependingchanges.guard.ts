import { Injectable } from '@angular/core';
import { CanDeactivate } from '@angular/router';
import { CaseUnsavedChangesAwareService } from 'src/app/member/AG/guards/services/caseunsavedchangesaware.service';

@Injectable({ providedIn: 'root' })

export class casependingchangesGuard implements CanDeactivate<CaseUnsavedChangesAwareService>{
  canDeactivate(component: CaseUnsavedChangesAwareService): boolean {
    if (!component?.caseHasUnsavedChanges?.()) return true;
    return confirm('You have unsaved changes. Leave without saving?');
  }
}
