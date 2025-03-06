import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AssignedauthsComponent } from './assignedauths.component';

describe('AssignedauthsComponent', () => {
  let component: AssignedauthsComponent;
  let fixture: ComponentFixture<AssignedauthsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AssignedauthsComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AssignedauthsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
