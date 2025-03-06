import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AgresolutioncategoryComponent } from './agresolutioncategory.component';

describe('AgresolutioncategoryComponent', () => {
  let component: AgresolutioncategoryComponent;
  let fixture: ComponentFixture<AgresolutioncategoryComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AgresolutioncategoryComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AgresolutioncategoryComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
