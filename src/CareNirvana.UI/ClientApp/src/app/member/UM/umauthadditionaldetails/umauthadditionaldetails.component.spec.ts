import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UmauthadditionaldetailsComponent } from './umauthadditionaldetails.component';

describe('UmauthadditionaldetailsComponent', () => {
  let component: UmauthadditionaldetailsComponent;
  let fixture: ComponentFixture<UmauthadditionaldetailsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UmauthadditionaldetailsComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(UmauthadditionaldetailsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
