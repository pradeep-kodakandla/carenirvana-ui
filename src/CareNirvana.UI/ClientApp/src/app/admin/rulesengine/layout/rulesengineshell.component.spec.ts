import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RulesengineshellComponent } from './rulesengineshell.component';

describe('RulesengineshellComponent', () => {
  let component: RulesengineshellComponent;
  let fixture: ComponentFixture<RulesengineshellComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RulesengineshellComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RulesengineshellComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
