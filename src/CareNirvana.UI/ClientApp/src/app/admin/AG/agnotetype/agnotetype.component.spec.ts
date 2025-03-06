import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AgnotetypeComponent } from './agnotetype.component';

describe('AgnotetypeComponent', () => {
  let component: AgnotetypeComponent;
  let fixture: ComponentFixture<AgnotetypeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AgnotetypeComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AgnotetypeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
