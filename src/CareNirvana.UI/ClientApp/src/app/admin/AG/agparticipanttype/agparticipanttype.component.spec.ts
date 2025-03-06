import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AgparticipanttypeComponent } from './agparticipanttype.component';

describe('AgparticipanttypeComponent', () => {
  let component: AgparticipanttypeComponent;
  let fixture: ComponentFixture<AgparticipanttypeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AgparticipanttypeComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AgparticipanttypeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
