import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CasenotesComponent } from './casenotes.component';

describe('CasenotesComponent', () => {
  let component: CasenotesComponent;
  let fixture: ComponentFixture<CasenotesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CasenotesComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CasenotesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
