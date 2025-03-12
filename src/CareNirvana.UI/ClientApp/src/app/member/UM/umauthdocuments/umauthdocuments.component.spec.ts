import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UmauthdocumentsComponent } from './umauthdocuments.component';

describe('UmauthdocumentsComponent', () => {
  let component: UmauthdocumentsComponent;
  let fixture: ComponentFixture<UmauthdocumentsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UmauthdocumentsComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(UmauthdocumentsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
