import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UmtransportationtriptypeComponent } from './umtransportationtriptype.component';

describe('UmtransportationtriptypeComponent', () => {
  let component: UmtransportationtriptypeComponent;
  let fixture: ComponentFixture<UmtransportationtriptypeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UmtransportationtriptypeComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(UmtransportationtriptypeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
