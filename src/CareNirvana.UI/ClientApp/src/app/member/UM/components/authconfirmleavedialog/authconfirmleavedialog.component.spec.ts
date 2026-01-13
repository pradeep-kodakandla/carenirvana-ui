import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AuthconfirmleavedialogComponent } from './authconfirmleavedialog.component';

describe('AuthconfirmleavedialogComponent', () => {
  let component: AuthconfirmleavedialogComponent;
  let fixture: ComponentFixture<AuthconfirmleavedialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AuthconfirmleavedialogComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AuthconfirmleavedialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
