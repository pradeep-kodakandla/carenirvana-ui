import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UmauthnotesComponent } from './umauthnotes.component';

describe('UmauthnotesComponent', () => {
  let component: UmauthnotesComponent;
  let fixture: ComponentFixture<UmauthnotesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UmauthnotesComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(UmauthnotesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
