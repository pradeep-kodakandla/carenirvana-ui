import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CmcauseofdeathComponent } from './cmcauseofdeath.component';

describe('CmcauseofdeathComponent', () => {
  let component: CmcauseofdeathComponent;
  let fixture: ComponentFixture<CmcauseofdeathComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CmcauseofdeathComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CmcauseofdeathComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
