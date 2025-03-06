import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UmdecisionstatuscodeComponent } from './umdecisionstatuscode.component';

describe('UmdecisionstatuscodeComponent', () => {
  let component: UmdecisionstatuscodeComponent;
  let fixture: ComponentFixture<UmdecisionstatuscodeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UmdecisionstatuscodeComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(UmdecisionstatuscodeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
