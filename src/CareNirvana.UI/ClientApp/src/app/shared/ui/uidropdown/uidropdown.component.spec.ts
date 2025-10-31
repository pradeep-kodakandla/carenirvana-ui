import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UidropdownComponent } from './uidropdown.component';

describe('UidropdownComponent', () => {
  let component: UidropdownComponent;
  let fixture: ComponentFixture<UidropdownComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UidropdownComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(UidropdownComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
