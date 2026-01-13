import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AuthmdreviewComponent } from './authmdreview.component';

describe('AuthmdreviewComponent', () => {
  let component: AuthmdreviewComponent;
  let fixture: ComponentFixture<AuthmdreviewComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AuthmdreviewComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AuthmdreviewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
