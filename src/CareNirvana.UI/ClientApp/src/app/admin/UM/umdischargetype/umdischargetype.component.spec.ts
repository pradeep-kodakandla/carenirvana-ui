import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UmdischargetypeComponent } from './umdischargetype.component';

describe('UmdischargetypeComponent', () => {
  let component: UmdischargetypeComponent;
  let fixture: ComponentFixture<UmdischargetypeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UmdischargetypeComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(UmdischargetypeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
