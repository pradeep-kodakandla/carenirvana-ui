import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BretestComponent } from './bretest.component';

describe('BretestComponent', () => {
  let component: BretestComponent;
  let fixture: ComponentFixture<BretestComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BretestComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(BretestComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
