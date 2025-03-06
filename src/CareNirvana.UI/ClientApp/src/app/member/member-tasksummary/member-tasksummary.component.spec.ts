import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MemberTasksummaryComponent } from './member-tasksummary.component';

describe('MemberTasksummaryComponent', () => {
  let component: MemberTasksummaryComponent;
  let fixture: ComponentFixture<MemberTasksummaryComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MemberTasksummaryComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MemberTasksummaryComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
