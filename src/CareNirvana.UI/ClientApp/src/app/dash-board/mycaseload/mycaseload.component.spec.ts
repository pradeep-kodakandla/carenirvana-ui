import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MycaseloadComponent } from './mycaseload.component';

describe('MycaseloadComponent', () => {
  let component: MycaseloadComponent;
  let fixture: ComponentFixture<MycaseloadComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MycaseloadComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MycaseloadComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
