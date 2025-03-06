import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CmclinicalindicatorsComponent } from './cmclinicalindicators.component';

describe('CmclinicalindicatorsComponent', () => {
  let component: CmclinicalindicatorsComponent;
  let fixture: ComponentFixture<CmclinicalindicatorsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CmclinicalindicatorsComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CmclinicalindicatorsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
