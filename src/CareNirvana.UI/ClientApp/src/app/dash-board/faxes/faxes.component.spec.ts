import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FaxesComponent } from './faxes.component';

describe('FaxesComponent', () => {
  let component: FaxesComponent;
  let fixture: ComponentFixture<FaxesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FaxesComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(FaxesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
