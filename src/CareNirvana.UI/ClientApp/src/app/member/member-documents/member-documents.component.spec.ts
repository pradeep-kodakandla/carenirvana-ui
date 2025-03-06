import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MemberDocumentsComponent } from './member-documents.component';

describe('MemberDocumentsComponent', () => {
  let component: MemberDocumentsComponent;
  let fixture: ComponentFixture<MemberDocumentsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MemberDocumentsComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MemberDocumentsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
