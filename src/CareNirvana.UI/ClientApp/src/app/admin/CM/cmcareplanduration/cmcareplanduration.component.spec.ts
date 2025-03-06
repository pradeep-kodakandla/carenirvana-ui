import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CmcareplandurationComponent } from './cmcareplanduration.component';

describe('CmcareplandurationComponent', () => {
  let component: CmcareplandurationComponent;
  let fixture: ComponentFixture<CmcareplandurationComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CmcareplandurationComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CmcareplandurationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
