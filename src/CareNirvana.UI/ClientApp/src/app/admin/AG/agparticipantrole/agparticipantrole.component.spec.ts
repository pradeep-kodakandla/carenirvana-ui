import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AgparticipantroleComponent } from './agparticipantrole.component';

describe('AgparticipantroleComponent', () => {
  let component: AgparticipantroleComponent;
  let fixture: ComponentFixture<AgparticipantroleComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AgparticipantroleComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AgparticipantroleComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
