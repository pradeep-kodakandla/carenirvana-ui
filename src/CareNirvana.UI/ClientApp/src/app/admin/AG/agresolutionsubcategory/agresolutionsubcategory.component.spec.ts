import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AgresolutionsubcategoryComponent } from './agresolutionsubcategory.component';

describe('AgresolutionsubcategoryComponent', () => {
  let component: AgresolutionsubcategoryComponent;
  let fixture: ComponentFixture<AgresolutionsubcategoryComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AgresolutionsubcategoryComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AgresolutionsubcategoryComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
