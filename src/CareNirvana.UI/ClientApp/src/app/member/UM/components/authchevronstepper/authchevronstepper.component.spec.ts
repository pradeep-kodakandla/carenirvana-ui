import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AuthchevronstepperComponent } from './authchevronstepper.component';

describe('AuthchevronstepperComponent', () => {
  let component: AuthchevronstepperComponent;
  let fixture: ComponentFixture<AuthchevronstepperComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AuthchevronstepperComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AuthchevronstepperComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
