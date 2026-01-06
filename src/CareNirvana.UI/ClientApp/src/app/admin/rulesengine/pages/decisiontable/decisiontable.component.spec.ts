import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DecisiontableComponent } from './decisiontable.component';

describe('DecisiontableComponent', () => {
  let component: DecisiontableComponent;
  let fixture: ComponentFixture<DecisiontableComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DecisiontableComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DecisiontableComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
