import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UmauthtemplateFieldPropertiesComponent } from './umauthtemplate-field-properties.component';

describe('UmauthtemplateFieldPropertiesComponent', () => {
  let component: UmauthtemplateFieldPropertiesComponent;
  let fixture: ComponentFixture<UmauthtemplateFieldPropertiesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UmauthtemplateFieldPropertiesComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(UmauthtemplateFieldPropertiesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
