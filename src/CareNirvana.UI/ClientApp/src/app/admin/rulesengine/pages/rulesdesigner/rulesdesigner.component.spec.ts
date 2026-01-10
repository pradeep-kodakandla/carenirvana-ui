import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RulesdesignerComponent } from './rulesdesigner.component';

describe('RulesdesignerComponent', () => {
  let component: RulesdesignerComponent;
  let fixture: ComponentFixture<RulesdesignerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RulesdesignerComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RulesdesignerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
