import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UmunittypeComponent } from './umunittype.component';

describe('UmunittypeComponent', () => {
  let component: UmunittypeComponent;
  let fixture: ComponentFixture<UmunittypeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UmunittypeComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(UmunittypeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
