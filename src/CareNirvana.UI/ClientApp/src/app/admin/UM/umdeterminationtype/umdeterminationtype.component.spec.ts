import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UmdeterminationtypeComponent } from './umdeterminationtype.component';

describe('UmdeterminationtypeComponent', () => {
  let component: UmdeterminationtypeComponent;
  let fixture: ComponentFixture<UmdeterminationtypeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UmdeterminationtypeComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(UmdeterminationtypeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
