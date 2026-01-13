import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AuthactivityComponent } from './authactivity.component';

describe('AuthactivityComponent', () => {
  let component: AuthactivityComponent;
  let fixture: ComponentFixture<AuthactivityComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AuthactivityComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AuthactivityComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
