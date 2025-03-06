import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CmplaceofdeathComponent } from './cmplaceofdeath.component';

describe('CmplaceofdeathComponent', () => {
  let component: CmplaceofdeathComponent;
  let fixture: ComponentFixture<CmplaceofdeathComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CmplaceofdeathComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CmplaceofdeathComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
