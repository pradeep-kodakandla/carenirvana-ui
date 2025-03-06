import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RolemanagementComponent } from './rolemanagement.component';

describe('RolemanagementComponent', () => {
  let component: RolemanagementComponent;
  let fixture: ComponentFixture<RolemanagementComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RolemanagementComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RolemanagementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
