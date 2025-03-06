import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DecisiondetailsComponent } from './decisiondetails.component';

describe('DecisiondetailsComponent', () => {
  let component: DecisiondetailsComponent;
  let fixture: ComponentFixture<DecisiondetailsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DecisiondetailsComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DecisiondetailsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
