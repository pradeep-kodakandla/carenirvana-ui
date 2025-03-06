import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CminterventionComponent } from './cmintervention.component';

describe('CminterventionComponent', () => {
  let component: CminterventionComponent;
  let fixture: ComponentFixture<CminterventionComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CminterventionComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CminterventionComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
