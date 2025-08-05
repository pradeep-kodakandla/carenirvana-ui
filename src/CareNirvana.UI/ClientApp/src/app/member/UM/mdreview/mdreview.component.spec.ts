import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MdreviewComponent } from './mdreview.component';

describe('MdreviewComponent', () => {
  let component: MdreviewComponent;
  let fixture: ComponentFixture<MdreviewComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MdreviewComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MdreviewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
