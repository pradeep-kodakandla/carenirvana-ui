import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AgqocinvestigationreasonComponent } from './agqocinvestigationreason.component';

describe('AgqocinvestigationreasonComponent', () => {
  let component: AgqocinvestigationreasonComponent;
  let fixture: ComponentFixture<AgqocinvestigationreasonComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AgqocinvestigationreasonComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AgqocinvestigationreasonComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
