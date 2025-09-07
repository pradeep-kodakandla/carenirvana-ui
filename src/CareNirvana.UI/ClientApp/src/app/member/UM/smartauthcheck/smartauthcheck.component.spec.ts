import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SmartauthcheckComponent } from './smartauthcheck.component';

describe('SmartauthcheckComponent', () => {
  let component: SmartauthcheckComponent;
  let fixture: ComponentFixture<SmartauthcheckComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SmartauthcheckComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SmartauthcheckComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
