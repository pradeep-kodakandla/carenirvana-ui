import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AgcomplaintsubcategoryComponent } from './agcomplaintsubcategory.component';

describe('AgcomplaintsubcategoryComponent', () => {
  let component: AgcomplaintsubcategoryComponent;
  let fixture: ComponentFixture<AgcomplaintsubcategoryComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AgcomplaintsubcategoryComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AgcomplaintsubcategoryComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
