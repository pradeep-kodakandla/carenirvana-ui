import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class CaseWizardStoreService {

  private caseIdSubject = new BehaviorSubject<number | null>(null);
  caseId$ = this.caseIdSubject.asObservable();

  private draftSubject = new BehaviorSubject<any>({});
  draft$ = this.draftSubject.asObservable();

  setCaseId(caseId: number) { this.caseIdSubject.next(caseId); }
  patchDraft(patch: any) { this.draftSubject.next({ ...this.draftSubject.value, ...patch }); }
}
