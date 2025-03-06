import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AssignedcomplaintsComponent } from './assignedcomplaints.component';

describe('AssignedcomplaintsComponent', () => {
  let component: AssignedcomplaintsComponent;
  let fixture: ComponentFixture<AssignedcomplaintsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AssignedcomplaintsComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AssignedcomplaintsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
