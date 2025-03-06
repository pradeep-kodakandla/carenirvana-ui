import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UmprescriptionquantityComponent } from './umprescriptionquantity.component';

describe('UmprescriptionquantityComponent', () => {
  let component: UmprescriptionquantityComponent;
  let fixture: ComponentFixture<UmprescriptionquantityComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UmprescriptionquantityComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(UmprescriptionquantityComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
