import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AuthdynamicComponent } from './authdynamic.component';

describe('AuthdynamicComponent', () => {
  let component: AuthdynamicComponent;
  let fixture: ComponentFixture<AuthdynamicComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AuthdynamicComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AuthdynamicComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
