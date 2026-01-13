import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AuthnotesComponent } from './authnotes.component';

describe('AuthnotesComponent', () => {
  let component: AuthnotesComponent;
  let fixture: ComponentFixture<AuthnotesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AuthnotesComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AuthnotesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
