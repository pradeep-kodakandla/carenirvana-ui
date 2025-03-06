import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CmgoalclassComponent } from './cmgoalclass.component';

describe('CmgoalclassComponent', () => {
  let component: CmgoalclassComponent;
  let fixture: ComponentFixture<CmgoalclassComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CmgoalclassComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CmgoalclassComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
