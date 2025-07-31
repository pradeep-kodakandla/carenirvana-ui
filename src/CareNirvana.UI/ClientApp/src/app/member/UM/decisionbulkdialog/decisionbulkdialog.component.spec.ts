import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DecisionbulkdialogComponent } from './decisionbulkdialog.component';

describe('DecisionbulkdialogComponent', () => {
  let component: DecisionbulkdialogComponent;
  let fixture: ComponentFixture<DecisionbulkdialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DecisionbulkdialogComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DecisionbulkdialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
