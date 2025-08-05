import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MdreviewdashboardComponent } from './mdreviewdashboard.component';

describe('MdreviewdashboardComponent', () => {
  let component: MdreviewdashboardComponent;
  let fixture: ComponentFixture<MdreviewdashboardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MdreviewdashboardComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MdreviewdashboardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
