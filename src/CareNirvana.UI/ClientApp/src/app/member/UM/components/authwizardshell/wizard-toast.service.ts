import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

export type WizardToastType = 'success' | 'error' | 'info';

export interface WizardToastMessage {
  type: WizardToastType;
  text: string;
  ts: number;
}

@Injectable({ providedIn: 'root' })
export class WizardToastService {
  private readonly _toast$ = new Subject<WizardToastMessage>();
  readonly toast$ = this._toast$.asObservable();

  success(text: string): void {
    this._toast$.next({ type: 'success', text, ts: Date.now() });
  }

  error(text: string): void {
    this._toast$.next({ type: 'error', text, ts: Date.now() });
  }

  info(text: string): void {
    this._toast$.next({ type: 'info', text, ts: Date.now() });
  }
}
