import { Injectable } from '@angular/core';
import { CanDeactivate } from '@angular/router';
import { AuthunsavedchangesawareService } from 'src/app/member/UM/services/authunsavedchangesaware.service';

@Injectable({ providedIn: 'root' })

export class authepndingchangesGuard implements CanDeactivate<AuthunsavedchangesawareService>{
  canDeactivate(component: AuthunsavedchangesawareService): boolean {
    if (!component?.caseHasUnsavedChanges?.()) return true;
    return confirm('You have unsaved changes. Leave without saving?');
  }
}
