import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UmqualityindicatorComponent } from './umqualityindicator.component';

describe('UmqualityindicatorComponent', () => {
  let component: UmqualityindicatorComponent;
  let fixture: ComponentFixture<UmqualityindicatorComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UmqualityindicatorComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(UmqualityindicatorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
