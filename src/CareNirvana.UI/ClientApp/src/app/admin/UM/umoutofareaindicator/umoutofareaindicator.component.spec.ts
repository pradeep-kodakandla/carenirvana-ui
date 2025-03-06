import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UmoutofareaindicatorComponent } from './umoutofareaindicator.component';

describe('UmoutofareaindicatorComponent', () => {
  let component: UmoutofareaindicatorComponent;
  let fixture: ComponentFixture<UmoutofareaindicatorComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UmoutofareaindicatorComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(UmoutofareaindicatorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
