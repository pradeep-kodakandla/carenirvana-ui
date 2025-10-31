import { ComponentFixture, TestBed } from '@angular/core/testing';

import { WorkbasketComponent } from './workbasket.component';

describe('WorkbasketComponent', () => {
  let component: WorkbasketComponent;
  let fixture: ComponentFixture<WorkbasketComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WorkbasketComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(WorkbasketComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
