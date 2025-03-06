import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UmadmitreasonComponent } from './umadmitreason.component';

describe('UmadmitreasonComponent', () => {
  let component: UmadmitreasonComponent;
  let fixture: ComponentFixture<UmadmitreasonComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UmadmitreasonComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(UmadmitreasonComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
