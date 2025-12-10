import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UismartdropdownComponent } from './uismartdropdown.component';

describe('UismartdropdownComponent', () => {
  let component: UismartdropdownComponent;
  let fixture: ComponentFixture<UismartdropdownComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UismartdropdownComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(UismartdropdownComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
