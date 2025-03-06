import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UmauthstatusreasonComponent } from './umauthstatusreason.component';

describe('UmauthstatusreasonComponent', () => {
  let component: UmauthstatusreasonComponent;
  let fixture: ComponentFixture<UmauthstatusreasonComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UmauthstatusreasonComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(UmauthstatusreasonComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
