import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UmnotificationtypeComponent } from './umnotificationtype.component';

describe('UmnotificationtypeComponent', () => {
  let component: UmnotificationtypeComponent;
  let fixture: ComponentFixture<UmnotificationtypeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UmnotificationtypeComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(UmnotificationtypeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
