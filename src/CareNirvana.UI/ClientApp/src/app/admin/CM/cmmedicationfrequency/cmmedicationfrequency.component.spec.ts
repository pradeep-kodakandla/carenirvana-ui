import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CmmedicationfrequencyComponent } from './cmmedicationfrequency.component';

describe('CmmedicationfrequencyComponent', () => {
  let component: CmmedicationfrequencyComponent;
  let fixture: ComponentFixture<CmmedicationfrequencyComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CmmedicationfrequencyComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CmmedicationfrequencyComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
