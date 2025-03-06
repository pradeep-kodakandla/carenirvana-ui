import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class MemberService {
  private isCollapseSubject = new BehaviorSubject<boolean>(false);
  isCollapse$ = this.isCollapseSubject.asObservable();

  setIsCollapse(value: boolean) {
    this.isCollapseSubject.next(value);
  }
}
