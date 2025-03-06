import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CmstrengthtypeComponent } from './cmstrengthtype.component';

describe('CmstrengthtypeComponent', () => {
  let component: CmstrengthtypeComponent;
  let fixture: ComponentFixture<CmstrengthtypeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CmstrengthtypeComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CmstrengthtypeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
