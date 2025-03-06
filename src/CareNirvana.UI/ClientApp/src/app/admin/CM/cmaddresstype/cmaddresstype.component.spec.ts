import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CmaddresstypeComponent } from './cmaddresstype.component';

describe('CmaddresstypeComponent', () => {
  let component: CmaddresstypeComponent;
  let fixture: ComponentFixture<CmaddresstypeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CmaddresstypeComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CmaddresstypeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
