import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MemberCareplanComponent } from './member-careplan.component';

describe('MemberCareplanComponent', () => {
  let component: MemberCareplanComponent;
  let fixture: ComponentFixture<MemberCareplanComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MemberCareplanComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MemberCareplanComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
