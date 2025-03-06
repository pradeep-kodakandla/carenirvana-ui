import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MemberAlertsComponent } from './member-alerts.component';

describe('MemberAlertsComponent', () => {
  let component: MemberAlertsComponent;
  let fixture: ComponentFixture<MemberAlertsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MemberAlertsComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MemberAlertsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
