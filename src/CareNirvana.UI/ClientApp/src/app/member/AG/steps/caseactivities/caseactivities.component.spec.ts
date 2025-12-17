import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CaseactivitiesComponent } from './caseactivities.component';

describe('CaseactivitiesComponent', () => {
  let component: CaseactivitiesComponent;
  let fixture: ComponentFixture<CaseactivitiesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CaseactivitiesComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CaseactivitiesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
