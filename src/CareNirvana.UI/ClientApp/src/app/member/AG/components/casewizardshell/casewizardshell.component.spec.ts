import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CasewizardshellComponent } from './casewizardshell.component';

describe('CasewizardshellComponent', () => {
  let component: CasewizardshellComponent;
  let fixture: ComponentFixture<CasewizardshellComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CasewizardshellComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CasewizardshellComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
