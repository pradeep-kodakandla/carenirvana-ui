import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CmcareplanstatusComponent } from './cmcareplanstatus.component';

describe('CmcareplanstatusComponent', () => {
  let component: CmcareplanstatusComponent;
  let fixture: ComponentFixture<CmcareplanstatusComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CmcareplanstatusComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CmcareplanstatusComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
