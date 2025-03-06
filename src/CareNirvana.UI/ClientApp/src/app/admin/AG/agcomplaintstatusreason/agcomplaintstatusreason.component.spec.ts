import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AgcomplaintstatusreasonComponent } from './agcomplaintstatusreason.component';

describe('AgcomplaintstatusreasonComponent', () => {
  let component: AgcomplaintstatusreasonComponent;
  let fixture: ComponentFixture<AgcomplaintstatusreasonComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AgcomplaintstatusreasonComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AgcomplaintstatusreasonComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
