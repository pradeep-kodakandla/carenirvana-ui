import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MemberjourneyComponent } from './memberjourney.component';

describe('MemberjourneyComponent', () => {
  let component: MemberjourneyComponent;
  let fixture: ComponentFixture<MemberjourneyComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MemberjourneyComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MemberjourneyComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
