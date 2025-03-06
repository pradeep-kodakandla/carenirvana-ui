import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CmmedicationtypeComponent } from './cmmedicationtype.component';

describe('CmmedicationtypeComponent', () => {
  let component: CmmedicationtypeComponent;
  let fixture: ComponentFixture<CmmedicationtypeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CmmedicationtypeComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CmmedicationtypeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
