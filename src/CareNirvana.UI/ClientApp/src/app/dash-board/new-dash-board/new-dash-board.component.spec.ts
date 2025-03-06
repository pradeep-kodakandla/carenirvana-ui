import { ComponentFixture, TestBed } from '@angular/core/testing';

import { NewDashBoardComponent } from './new-dash-board.component';

describe('NewDashBoardComponent', () => {
  let component: NewDashBoardComponent;
  let fixture: ComponentFixture<NewDashBoardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NewDashBoardComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(NewDashBoardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
