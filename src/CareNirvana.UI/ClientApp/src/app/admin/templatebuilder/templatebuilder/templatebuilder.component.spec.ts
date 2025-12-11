import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TemplatebuilderComponent } from './templatebuilder.component';

describe('TemplatebuilderComponent', () => {
  let component: TemplatebuilderComponent;
  let fixture: ComponentFixture<TemplatebuilderComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TemplatebuilderComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TemplatebuilderComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
