import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MemberProgramComponent } from './member-program.component';

describe('MemberProgramComponent', () => {
  let component: MemberProgramComponent;
  let fixture: ComponentFixture<MemberProgramComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MemberProgramComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MemberProgramComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
