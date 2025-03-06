import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CmevacuationzoneComponent } from './cmevacuationzone.component';

describe('CmevacuationzoneComponent', () => {
  let component: CmevacuationzoneComponent;
  let fixture: ComponentFixture<CmevacuationzoneComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CmevacuationzoneComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CmevacuationzoneComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
