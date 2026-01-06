import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RulegroupsComponent } from './rulegroups.component';

describe('RulegroupsComponent', () => {
  let component: RulegroupsComponent;
  let fixture: ComponentFixture<RulegroupsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RulegroupsComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RulegroupsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
