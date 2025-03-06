import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UmauthtemplateComponent } from './umauthtemplate.component';

describe('UmauthtemplateComponent', () => {
  let component: UmauthtemplateComponent;
  let fixture: ComponentFixture<UmauthtemplateComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UmauthtemplateComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(UmauthtemplateComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
