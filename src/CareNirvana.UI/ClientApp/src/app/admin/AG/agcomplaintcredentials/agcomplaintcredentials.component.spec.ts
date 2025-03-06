import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AgcomplaintcredentialsComponent } from './agcomplaintcredentials.component';

describe('AgcomplaintcredentialsComponent', () => {
  let component: AgcomplaintcredentialsComponent;
  let fixture: ComponentFixture<AgcomplaintcredentialsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AgcomplaintcredentialsComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AgcomplaintcredentialsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
