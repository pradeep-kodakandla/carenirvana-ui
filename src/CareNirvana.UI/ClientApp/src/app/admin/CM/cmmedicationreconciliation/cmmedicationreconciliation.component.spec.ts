import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CmmedicationreconciliationComponent } from './cmmedicationreconciliation.component';

describe('CmmedicationreconciliationComponent', () => {
  let component: CmmedicationreconciliationComponent;
  let fixture: ComponentFixture<CmmedicationreconciliationComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CmmedicationreconciliationComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CmmedicationreconciliationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
