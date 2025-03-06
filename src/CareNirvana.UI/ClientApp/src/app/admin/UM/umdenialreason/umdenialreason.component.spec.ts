import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UmdenialreasonComponent } from './umdenialreason.component';

describe('UmdenialreasonComponent', () => {
  let component: UmdenialreasonComponent;
  let fixture: ComponentFixture<UmdenialreasonComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UmdenialreasonComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(UmdenialreasonComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
