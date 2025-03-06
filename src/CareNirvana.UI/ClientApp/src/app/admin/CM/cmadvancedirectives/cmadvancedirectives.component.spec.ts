import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CmadvancedirectivesComponent } from './cmadvancedirectives.component';

describe('CmadvancedirectivesComponent', () => {
  let component: CmadvancedirectivesComponent;
  let fixture: ComponentFixture<CmadvancedirectivesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CmadvancedirectivesComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CmadvancedirectivesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
