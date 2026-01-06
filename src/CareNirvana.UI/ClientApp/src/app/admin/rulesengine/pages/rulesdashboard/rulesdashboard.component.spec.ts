import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RulesdashboardComponent } from './rulesdashboard.component';

describe('RulesdashboardComponent', () => {
  let component: RulesdashboardComponent;
  let fixture: ComponentFixture<RulesdashboardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RulesdashboardComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RulesdashboardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
