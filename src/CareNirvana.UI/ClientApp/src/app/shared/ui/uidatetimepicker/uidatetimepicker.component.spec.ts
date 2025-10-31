import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UidatetimepickerComponent } from './uidatetimepicker.component';

describe('UidatetimepickerComponent', () => {
  let component: UidatetimepickerComponent;
  let fixture: ComponentFixture<UidatetimepickerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UidatetimepickerComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(UidatetimepickerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
