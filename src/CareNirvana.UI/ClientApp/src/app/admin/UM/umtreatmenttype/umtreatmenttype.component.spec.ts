import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UmtreatmenttypeComponent } from './umtreatmenttype.component';

describe('UmtreatmenttypeComponent', () => {
  let component: UmtreatmenttypeComponent;
  let fixture: ComponentFixture<UmtreatmenttypeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UmtreatmenttypeComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(UmtreatmenttypeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
