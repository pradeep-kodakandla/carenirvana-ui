import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UismartdatetimeComponent } from './uismartdatetime.component';

describe('UismartdatetimeComponent', () => {
  let component: UismartdatetimeComponent;
  let fixture: ComponentFixture<UismartdatetimeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UismartdatetimeComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(UismartdatetimeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
