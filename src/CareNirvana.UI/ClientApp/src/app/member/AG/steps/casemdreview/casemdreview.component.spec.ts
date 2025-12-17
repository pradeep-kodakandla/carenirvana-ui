import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CasemdreviewComponent } from './casemdreview.component';

describe('CasemdreviewComponent', () => {
  let component: CasemdreviewComponent;
  let fixture: ComponentFixture<CasemdreviewComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CasemdreviewComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CasemdreviewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
