import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AgcoordinatortypeComponent } from './agcoordinatortype.component';

describe('AgcoordinatortypeComponent', () => {
  let component: AgcoordinatortypeComponent;
  let fixture: ComponentFixture<AgcoordinatortypeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AgcoordinatortypeComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AgcoordinatortypeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
