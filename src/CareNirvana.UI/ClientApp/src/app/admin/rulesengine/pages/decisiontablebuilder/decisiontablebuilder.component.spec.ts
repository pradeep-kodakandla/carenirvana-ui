import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DecisiontablebuilderComponent } from './decisiontablebuilder.component';

describe('DecisiontablebuilderComponent', () => {
  let component: DecisiontablebuilderComponent;
  let fixture: ComponentFixture<DecisiontablebuilderComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DecisiontablebuilderComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DecisiontablebuilderComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
