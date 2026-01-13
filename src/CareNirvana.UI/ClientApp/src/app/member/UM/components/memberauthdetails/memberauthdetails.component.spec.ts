import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MemberauthdetailsComponent } from './memberauthdetails.component';

describe('MemberauthdetailsComponent', () => {
  let component: MemberauthdetailsComponent;
  let fixture: ComponentFixture<MemberauthdetailsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MemberauthdetailsComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MemberauthdetailsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
