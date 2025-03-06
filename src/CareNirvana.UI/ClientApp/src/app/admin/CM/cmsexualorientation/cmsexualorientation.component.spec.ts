import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CmsexualorientationComponent } from './cmsexualorientation.component';

describe('CmsexualorientationComponent', () => {
  let component: CmsexualorientationComponent;
  let fixture: ComponentFixture<CmsexualorientationComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CmsexualorientationComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CmsexualorientationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
