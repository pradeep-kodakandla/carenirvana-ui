import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DecisiontablebindingComponent } from './decisiontablebinding.component';

describe('DecisiontablebindingComponent', () => {
  let component: DecisiontablebindingComponent;
  let fixture: ComponentFixture<DecisiontablebindingComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DecisiontablebindingComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DecisiontablebindingComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
