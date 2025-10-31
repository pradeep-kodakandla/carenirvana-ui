import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UimulticheckdropdownComponent } from './uimulticheckdropdown.component';

describe('UimulticheckdropdownComponent', () => {
  let component: UimulticheckdropdownComponent;
  let fixture: ComponentFixture<UimulticheckdropdownComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UimulticheckdropdownComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(UimulticheckdropdownComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
