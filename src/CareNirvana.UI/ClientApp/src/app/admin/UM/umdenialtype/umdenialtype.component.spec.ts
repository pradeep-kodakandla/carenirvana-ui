import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UmdenialtypeComponent } from './umdenialtype.component';

describe('UmdenialtypeComponent', () => {
  let component: UmdenialtypeComponent;
  let fixture: ComponentFixture<UmdenialtypeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UmdenialtypeComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(UmdenialtypeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
