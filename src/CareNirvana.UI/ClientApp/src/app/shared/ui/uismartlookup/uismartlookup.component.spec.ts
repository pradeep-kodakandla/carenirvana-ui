import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UismartlookupComponent } from './uismartlookup.component';

describe('UismartlookupComponent', () => {
  let component: UismartlookupComponent;
  let fixture: ComponentFixture<UismartlookupComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UismartlookupComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(UismartlookupComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
