import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CmholidaysComponent } from './cmholidays.component';

describe('CmholidaysComponent', () => {
  let component: CmholidaysComponent;
  let fixture: ComponentFixture<CmholidaysComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CmholidaysComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CmholidaysComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
