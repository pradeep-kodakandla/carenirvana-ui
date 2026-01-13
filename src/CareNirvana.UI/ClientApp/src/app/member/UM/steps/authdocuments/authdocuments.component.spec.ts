import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AuthdocumentsComponent } from './authdocuments.component';

describe('AuthdocumentsComponent', () => {
  let component: AuthdocumentsComponent;
  let fixture: ComponentFixture<AuthdocumentsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AuthdocumentsComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AuthdocumentsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
