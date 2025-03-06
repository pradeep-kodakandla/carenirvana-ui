import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AppfeaturesetupComponent } from './appfeaturesetup.component';

describe('AppfeaturesetupComponent', () => {
  let component: AppfeaturesetupComponent;
  let fixture: ComponentFixture<AppfeaturesetupComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppfeaturesetupComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AppfeaturesetupComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
