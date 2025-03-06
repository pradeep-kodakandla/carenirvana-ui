import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CmgoalComponent } from './cmgoal.component';

describe('CmgoalComponent', () => {
  let component: CmgoalComponent;
  let fixture: ComponentFixture<CmgoalComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CmgoalComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CmgoalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
