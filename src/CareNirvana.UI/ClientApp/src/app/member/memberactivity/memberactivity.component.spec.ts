import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MemberactivityComponent } from './memberactivity.component';

describe('MemberactivityComponent', () => {
  let component: MemberactivityComponent;
  let fixture: ComponentFixture<MemberactivityComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MemberactivityComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MemberactivityComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
