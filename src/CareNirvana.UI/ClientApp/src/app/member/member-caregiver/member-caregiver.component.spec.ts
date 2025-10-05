import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MemberCaregiverComponent } from './member-caregiver.component';

describe('MemberCaregiverComponent', () => {
  let component: MemberCaregiverComponent;
  let fixture: ComponentFixture<MemberCaregiverComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MemberCaregiverComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MemberCaregiverComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
