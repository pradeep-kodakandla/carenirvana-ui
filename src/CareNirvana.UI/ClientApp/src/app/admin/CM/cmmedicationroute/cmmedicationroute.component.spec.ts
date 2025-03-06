import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CmmedicationrouteComponent } from './cmmedicationroute.component';

describe('CmmedicationrouteComponent', () => {
  let component: CmmedicationrouteComponent;
  let fixture: ComponentFixture<CmmedicationrouteComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CmmedicationrouteComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CmmedicationrouteComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
