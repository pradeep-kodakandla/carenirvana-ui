import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AgcomplaintclassComponent } from './agcomplaintclass.component';

describe('AgcomplaintclassComponent', () => {
  let component: AgcomplaintclassComponent;
  let fixture: ComponentFixture<AgcomplaintclassComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AgcomplaintclassComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AgcomplaintclassComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
