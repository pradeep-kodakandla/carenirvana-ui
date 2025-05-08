import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PermissionManagerComponent } from './permission-manager.component';

describe('PermissionManagerComponent', () => {
  let component: PermissionManagerComponent;
  let fixture: ComponentFixture<PermissionManagerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PermissionManagerComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PermissionManagerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
