import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UmadmissiontypeComponent } from './umadmissiontype.component';

describe('UmadmissiontypeComponent', () => {
  let component: UmadmissiontypeComponent;
  let fixture: ComponentFixture<UmadmissiontypeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UmadmissiontypeComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(UmadmissiontypeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
