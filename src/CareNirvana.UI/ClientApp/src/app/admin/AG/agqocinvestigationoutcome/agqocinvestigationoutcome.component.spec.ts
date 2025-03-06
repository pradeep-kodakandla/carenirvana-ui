import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AgqocinvestigationoutcomeComponent } from './agqocinvestigationoutcome.component';

describe('AgqocinvestigationoutcomeComponent', () => {
  let component: AgqocinvestigationoutcomeComponent;
  let fixture: ComponentFixture<AgqocinvestigationoutcomeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AgqocinvestigationoutcomeComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AgqocinvestigationoutcomeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
