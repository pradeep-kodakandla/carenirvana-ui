import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UmadmissionlevelComponent } from './umadmissionlevel.component';

describe('UmadmissionlevelComponent', () => {
  let component: UmadmissionlevelComponent;
  let fixture: ComponentFixture<UmadmissionlevelComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UmadmissionlevelComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(UmadmissionlevelComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
