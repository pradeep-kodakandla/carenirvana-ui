import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UmdocumenttypeComponent } from './umdocumenttype.component';

describe('UmdocumenttypeComponent', () => {
  let component: UmdocumenttypeComponent;
  let fixture: ComponentFixture<UmdocumenttypeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UmdocumenttypeComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(UmdocumenttypeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
