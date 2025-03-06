import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CmmedicationdosageunitsComponent } from './cmmedicationdosageunits.component';

describe('CmmedicationdosageunitsComponent', () => {
  let component: CmmedicationdosageunitsComponent;
  let fixture: ComponentFixture<CmmedicationdosageunitsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CmmedicationdosageunitsComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CmmedicationdosageunitsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
