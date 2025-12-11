import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TemplatebuilderpropertiesComponent } from './templatebuilderproperties.component';

describe('TemplatebuilderpropertiesComponent', () => {
  let component: TemplatebuilderpropertiesComponent;
  let fixture: ComponentFixture<TemplatebuilderpropertiesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TemplatebuilderpropertiesComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TemplatebuilderpropertiesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
