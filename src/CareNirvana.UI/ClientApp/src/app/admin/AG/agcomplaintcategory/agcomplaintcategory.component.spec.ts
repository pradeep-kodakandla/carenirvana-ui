import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AgcomplaintcategoryComponent } from './agcomplaintcategory.component';

describe('AgcomplaintcategoryComponent', () => {
  let component: AgcomplaintcategoryComponent;
  let fixture: ComponentFixture<AgcomplaintcategoryComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AgcomplaintcategoryComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AgcomplaintcategoryComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
