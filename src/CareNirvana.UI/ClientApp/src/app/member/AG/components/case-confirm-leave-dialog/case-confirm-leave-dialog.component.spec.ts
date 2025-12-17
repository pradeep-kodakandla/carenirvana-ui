import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CaseConfirmLeaveDialogComponent } from './case-confirm-leave-dialog.component';

describe('CaseConfirmLeaveDialogComponent', () => {
  let component: CaseConfirmLeaveDialogComponent;
  let fixture: ComponentFixture<CaseConfirmLeaveDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CaseConfirmLeaveDialogComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CaseConfirmLeaveDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
