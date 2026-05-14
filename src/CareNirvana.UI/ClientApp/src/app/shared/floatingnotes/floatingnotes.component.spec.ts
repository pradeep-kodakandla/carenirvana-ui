import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FloatingnotesComponent } from './floatingnotes.component';

describe('FloatingnotesComponent', () => {
  let component: FloatingnotesComponent;
  let fixture: ComponentFixture<FloatingnotesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FloatingnotesComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(FloatingnotesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
