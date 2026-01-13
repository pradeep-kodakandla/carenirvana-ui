import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AuthdecisionComponent } from './authdecision.component';

describe('AuthdecisionComponent', () => {
  let component: AuthdecisionComponent;
  let fixture: ComponentFixture<AuthdecisionComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AuthdecisionComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AuthdecisionComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
