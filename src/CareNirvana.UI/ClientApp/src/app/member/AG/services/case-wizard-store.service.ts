import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { CaseAggregateDto, CaseDetailDto } from 'src/app/service/casedetail.service';
import { MatSnackBar } from '@angular/material/snack-bar';
export interface CaseLevelTab {
  levelId: number;
  title: string;           // "Level 1"
  caseDetailId: number;
  caseLevelNumber: string; // "3HTUX2J0ZL2"
}

/**
 * Single source of truth for Case Wizard UI state.
 * - templateId: selected Case Type (template)
 * - aggregate: header + details (levels)
 * - activeLevelId: selected level
 */
@Injectable({ providedIn: 'root' })
export class CaseWizardStoreService {
  // --- case number (header) ---
  private readonly _caseNumber$ = new BehaviorSubject<string | null>(null);
  caseNumber$ = this._caseNumber$.asObservable();

  setCaseNumber(v: string | null): void {
    const next = (v ?? '').trim();
    this._caseNumber$.next(next.length ? next : null);
  }

  getCaseNumber(): string | null {
    return this._caseNumber$.value;
  }

  // --- template / case type (templateId) ---
  private readonly _templateId$ = new BehaviorSubject<number | null>(null);
  templateId$ = this._templateId$.asObservable();

  setTemplateId(v: number | null): void {
    const n = v == null ? NaN : Number(v);
    const next = Number.isFinite(n) && n > 0 ? n : null;
    this._templateId$.next(next);
  }

  getTemplateId(): number | null {
    return this._templateId$.value;
  }

  // --- aggregate (header + details) ---
  private readonly _aggregate$ = new BehaviorSubject<CaseAggregateDto | null>(null);
  aggregate$ = this._aggregate$.asObservable();

  setAggregate(agg: CaseAggregateDto | null): void {
    this._aggregate$.next(agg);
    // keep caseNumber in sync
    const cn = agg?.header?.caseNumber ?? null;
    this.setCaseNumber(cn);
    // keep tabs in sync
    this._tabs$.next(this.buildTabs(agg));
  }

  getAggregate(): CaseAggregateDto | null {
    return this._aggregate$.value;
  }

  // --- tabs ---
  private readonly _tabs$ = new BehaviorSubject<CaseLevelTab[]>([]);
  tabs$ = this._tabs$.asObservable();

  private buildTabs(agg: CaseAggregateDto | null): CaseLevelTab[] {
    const details = (agg?.details ?? []) as CaseDetailDto[];
    return details
      .filter(d => !d.deletedOn)
      .sort((a, b) => (a.caseLevelId ?? 0) - (b.caseLevelId ?? 0))
      .map(d => ({
        levelId: d.caseLevelId ?? 0,
        title: `Level ${d.caseLevelId ?? 0}`,
        caseDetailId: d.caseDetailId ?? 0,
        caseLevelNumber: d.caseLevelNumber ?? ''
      }))
      .filter(t => t.levelId > 0);
  }

  // --- active level ---
  private readonly _activeLevelId$ = new BehaviorSubject<number | null>(null);
  activeLevelId$ = this._activeLevelId$.asObservable();

  setActiveLevel(levelId: number | null): void {
    const n = levelId == null ? NaN : Number(levelId);
    const next = Number.isFinite(n) && n > 0 ? n : null;
    this._activeLevelId$.next(next);
  }

  getActiveLevelId(): number | null {
    return this._activeLevelId$.value;
  }

  resetForNew(): void {
    this.setCaseNumber(null);
    this.setTemplateId(null);
    this.setAggregate(null);
    this._tabs$.next([]);
    this.setActiveLevel(null);
  }

  /** Returns current header id from aggregate. Supports your API shape: agg.header.caseHeaderId */
  getHeaderId(): number | null {
    const agg: any = this._aggregate$.value;
    const raw =
      agg?.header?.caseHeaderId ??
      agg?.caseHeaderId ??
      agg?.caseHeader?.caseHeaderId ??
      agg?.caseHeader?.id ??
      null;

    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  /** Returns the detail object for a given level from your API shape: agg.details[].caseLevelId */
  getDetailForLevel(levelId: number): any | null {
    const agg: any = this._aggregate$.value;
    const details: any[] = agg?.details ?? agg?.caseDetails ?? agg?.caseDetailList ?? [];
    const lvl = Number(levelId);

    return (details ?? []).find(d => Number(d?.caseLevelId ?? d?.levelId) === lvl) ?? null;
  }

  upsertDetailForLevel(levelId: number, newDetail: any): void {
    const agg: any = this._aggregate$.value ?? {};
    const details: any[] = (agg.details ?? []).slice();

    const idx = details.findIndex(d => Number(d?.caseLevelId ?? d?.levelId) === Number(levelId));
    if (idx >= 0) details[idx] = { ...details[idx], ...newDetail };
    else details.push(newDetail);

    const nextAgg = { ...agg, details };
    this.setAggregate(nextAgg);
  }

}

@Injectable({ providedIn: 'root' })
export class CaseWizardNotifyService {
  constructor(private snack: MatSnackBar) { }

  success(message: string, durationMs = 2500): void {
    this.snack.open(message, 'OK', {
      duration: durationMs,
      panelClass: ['success-snackbar'],
      verticalPosition: 'top' // keep it near your wizard header
    });
  }

  error(message: string, durationMs = 4000): void {
    this.snack.open(message, 'Close', {
      duration: durationMs,
      panelClass: ['error-snackbar'],
      verticalPosition: 'top'
    });
  }
}
