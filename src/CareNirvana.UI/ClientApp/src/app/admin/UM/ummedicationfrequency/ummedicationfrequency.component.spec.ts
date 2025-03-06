import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UmmedicationfrequencyComponent } from './ummedicationfrequency.component';

describe('UmmedicationfrequencyComponent', () => {
  let component: UmmedicationfrequencyComponent;
  let fixture: ComponentFixture<UmmedicationfrequencyComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UmmedicationfrequencyComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(UmmedicationfrequencyComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
