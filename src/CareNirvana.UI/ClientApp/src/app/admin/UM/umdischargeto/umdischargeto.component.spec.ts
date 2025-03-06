import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UmdischargetoComponent } from './umdischargeto.component';

describe('UmdischargetoComponent', () => {
  let component: UmdischargetoComponent;
  let fixture: ComponentFixture<UmdischargetoComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UmdischargetoComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(UmdischargetoComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
