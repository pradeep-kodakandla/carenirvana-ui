import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MemberSummaryaiComponent } from './member-summaryai.component';

describe('MemberSummaryaiComponent', () => {
  let component: MemberSummaryaiComponent;
  let fixture: ComponentFixture<MemberSummaryaiComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MemberSummaryaiComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MemberSummaryaiComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
