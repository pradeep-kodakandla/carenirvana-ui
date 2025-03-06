import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UmplaceofserviceComponent } from './umplaceofservice.component';

describe('UmplaceofserviceComponent', () => {
  let component: UmplaceofserviceComponent;
  let fixture: ComponentFixture<UmplaceofserviceComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UmplaceofserviceComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(UmplaceofserviceComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
