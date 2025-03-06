import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CmcareplanmatrixComponent } from './cmcareplanmatrix.component';

describe('CmcareplanmatrixComponent', () => {
  let component: CmcareplanmatrixComponent;
  let fixture: ComponentFixture<CmcareplanmatrixComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CmcareplanmatrixComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CmcareplanmatrixComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
