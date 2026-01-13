import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AuthwizardshellComponent } from './authwizardshell.component';

describe('AuthwizardshellComponent', () => {
  let component: AuthwizardshellComponent;
  let fixture: ComponentFixture<AuthwizardshellComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AuthwizardshellComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AuthwizardshellComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
