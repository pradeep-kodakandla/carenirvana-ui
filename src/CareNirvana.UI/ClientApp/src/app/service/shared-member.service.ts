import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class MemberService {
  private isCollapseSubject = new BehaviorSubject<boolean>(false);
  private _showAuthorization = new BehaviorSubject<boolean>(false);
  isCollapse$ = this.isCollapseSubject.asObservable();
  readonly showAuthorization$ = this._showAuthorization.asObservable();

  setIsCollapse(value: boolean) {
    this.isCollapseSubject.next(value);
  }

  setShowAuthorization(show: boolean) {
    this._showAuthorization.next(show);
  }
}
