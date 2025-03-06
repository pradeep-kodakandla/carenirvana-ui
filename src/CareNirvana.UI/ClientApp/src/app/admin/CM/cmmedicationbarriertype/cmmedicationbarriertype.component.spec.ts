import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CmmedicationbarriertypeComponent } from './cmmedicationbarriertype.component';

describe('CmmedicationbarriertypeComponent', () => {
  let component: CmmedicationbarriertypeComponent;
  let fixture: ComponentFixture<CmmedicationbarriertypeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CmmedicationbarriertypeComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CmmedicationbarriertypeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
