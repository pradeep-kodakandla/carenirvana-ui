import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CasedocumentsComponent } from './casedocuments.component';

describe('CasedocumentsComponent', () => {
  let component: CasedocumentsComponent;
  let fixture: ComponentFixture<CasedocumentsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CasedocumentsComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CasedocumentsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
