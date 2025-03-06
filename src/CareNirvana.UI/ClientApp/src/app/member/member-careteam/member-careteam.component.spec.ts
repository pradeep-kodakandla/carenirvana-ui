import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MemberCareteamComponent } from './member-careteam.component';

describe('MemberCareteamComponent', () => {
  let component: MemberCareteamComponent;
  let fixture: ComponentFixture<MemberCareteamComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MemberCareteamComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MemberCareteamComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
