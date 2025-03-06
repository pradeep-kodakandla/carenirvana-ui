import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CmnotetypeComponent } from './cmnotetype.component';

describe('CmnotetypeComponent', () => {
  let component: CmnotetypeComponent;
  let fixture: ComponentFixture<CmnotetypeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CmnotetypeComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CmnotetypeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
