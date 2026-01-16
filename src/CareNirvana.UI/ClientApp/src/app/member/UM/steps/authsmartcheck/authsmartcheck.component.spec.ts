import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AuthsmartcheckComponent } from './authsmartcheck.component';

describe('AuthsmartcheckComponent', () => {
  let component: AuthsmartcheckComponent;
  let fixture: ComponentFixture<AuthsmartcheckComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AuthsmartcheckComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AuthsmartcheckComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
