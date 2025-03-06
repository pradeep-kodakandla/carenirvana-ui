import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CmconditionComponent } from './cmcondition.component';

describe('CmconditionComponent', () => {
  let component: CmconditionComponent;
  let fixture: ComponentFixture<CmconditionComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CmconditionComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CmconditionComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
