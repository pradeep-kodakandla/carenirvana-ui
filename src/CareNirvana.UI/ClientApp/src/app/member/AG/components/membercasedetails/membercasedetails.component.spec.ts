import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MembercasedetailsComponent } from './membercasedetails.component';

describe('MembercasedetailsComponent', () => {
  let component: MembercasedetailsComponent;
  let fixture: ComponentFixture<MembercasedetailsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MembercasedetailsComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MembercasedetailsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
