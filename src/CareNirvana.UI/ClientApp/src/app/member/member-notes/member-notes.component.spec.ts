import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MemberNotesComponent } from './member-notes.component';

describe('MemberNotesComponent', () => {
  let component: MemberNotesComponent;
  let fixture: ComponentFixture<MemberNotesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MemberNotesComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MemberNotesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
