import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CmappointmenttypeComponent } from './cmappointmenttype.component';

describe('CmappointmenttypeComponent', () => {
  let component: CmappointmenttypeComponent;
  let fixture: ComponentFixture<CmappointmenttypeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CmappointmenttypeComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CmappointmenttypeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
