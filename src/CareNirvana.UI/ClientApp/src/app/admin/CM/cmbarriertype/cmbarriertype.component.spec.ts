import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CmbarriertypeComponent } from './cmbarriertype.component';

describe('CmbarriertypeComponent', () => {
  let component: CmbarriertypeComponent;
  let fixture: ComponentFixture<CmbarriertypeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CmbarriertypeComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CmbarriertypeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
