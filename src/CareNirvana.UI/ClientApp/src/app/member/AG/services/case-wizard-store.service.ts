import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { CaseAggregateDto, CaseDetailDto } from 'src/app/service/casedetail.service';

export interface CaseLevelTab {
  levelId: number;
  title: string;           // "Level 1"
  caseDetailId: number;
  caseLevelNumber: string; // "51471L2"
}

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

  private readonly _caseAgg$ = new BehaviorSubject<CaseAggregateDto | null>(null);
  readonly caseAgg$ = this._caseAgg$.asObservable();

  private readonly _tabs$ = new BehaviorSubject<CaseLevelTab[]>([]);
  readonly tabs$ = this._tabs$.asObservable();

  private readonly _activeLevelId$ = new BehaviorSubject<number>(1);
  readonly activeLevelId$ = this._activeLevelId$.asObservable();

  setAggregate(agg: CaseAggregateDto) {
    this._caseAgg$.next(agg);

    const tabs = (agg.details || [])
      .filter(d => !d.deletedOn)
      .sort((a, b) => (a.caseLevelId ?? 0) - (b.caseLevelId ?? 0))
      .map(d => ({
        levelId: d.caseLevelId,
        title: `Level ${d.caseLevelId}`,
        caseDetailId: d.caseDetailId,
        caseLevelNumber: d.caseLevelNumber
      }));

    this._tabs$.next(tabs);

    // if active not present, fall back to lowest available
    const active = this._activeLevelId$.value;
    if (tabs.length && !tabs.some(t => t.levelId === active)) {
      this._activeLevelId$.next(tabs[0].levelId);
    }
  }

  setActiveLevel(levelId: number) {
    this._activeLevelId$.next(levelId);
  }

  getDetailForLevel(levelId: number): CaseDetailDto | null {
    const agg = this._caseAgg$.value;
    if (!agg?.details?.length) return null;
    return agg.details.find(d => d.caseLevelId === levelId && !d.deletedOn) ?? null;
  }

  getHeaderId(): number | null {
    return this._caseAgg$.value?.header?.caseHeaderId ?? null;
  }

  getCaseNumber(): string | null {
    return this._caseAgg$.value?.header?.caseNumber ?? null;
  }
}
