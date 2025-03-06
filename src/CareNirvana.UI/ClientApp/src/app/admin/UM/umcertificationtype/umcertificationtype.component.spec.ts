import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UmcertificationtypeComponent } from './umcertificationtype.component';

describe('UmcertificationtypeComponent', () => {
  let component: UmcertificationtypeComponent;
  let fixture: ComponentFixture<UmcertificationtypeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UmcertificationtypeComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(UmcertificationtypeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
