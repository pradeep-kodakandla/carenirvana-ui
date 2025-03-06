import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UmactivitypriorityComponent } from './umactivitypriority.component';

describe('UmactivitypriorityComponent', () => {
  let component: UmactivitypriorityComponent;
  let fixture: ComponentFixture<UmactivitypriorityComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UmactivitypriorityComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(UmactivitypriorityComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
