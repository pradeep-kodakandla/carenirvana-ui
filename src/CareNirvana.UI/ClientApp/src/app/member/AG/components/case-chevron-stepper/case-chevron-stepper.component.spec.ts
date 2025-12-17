import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CaseChevronStepperComponent } from './case-chevron-stepper.component';

describe('CaseChevronStepperComponent', () => {
  let component: CaseChevronStepperComponent;
  let fixture: ComponentFixture<CaseChevronStepperComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CaseChevronStepperComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CaseChevronStepperComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
