import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UmauthtemplateBuilderComponent } from './umauthtemplate-builder.component';

describe('UmauthtemplateBuilderComponent', () => {
  let component: UmauthtemplateBuilderComponent;
  let fixture: ComponentFixture<UmauthtemplateBuilderComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UmauthtemplateBuilderComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(UmauthtemplateBuilderComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
