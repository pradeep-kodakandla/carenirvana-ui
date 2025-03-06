import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UmnotetypeComponent } from './umnotetype.component';

describe('UmnotetypeComponent', () => {
  let component: UmnotetypeComponent;
  let fixture: ComponentFixture<UmnotetypeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UmnotetypeComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(UmnotetypeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
