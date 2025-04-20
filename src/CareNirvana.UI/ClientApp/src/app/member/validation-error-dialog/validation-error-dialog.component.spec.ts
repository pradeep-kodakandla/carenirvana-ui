import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ValidationErrorDialogComponent } from './validation-error-dialog.component';

describe('ValidationErrorDialogComponent', () => {
  let component: ValidationErrorDialogComponent;
  let fixture: ComponentFixture<ValidationErrorDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ValidationErrorDialogComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ValidationErrorDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
