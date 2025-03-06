import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MemberEnrollmentComponent } from './member-enrollment.component';

describe('MemberEnrollmentComponent', () => {
  let component: MemberEnrollmentComponent;
  let fixture: ComponentFixture<MemberEnrollmentComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MemberEnrollmentComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MemberEnrollmentComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
