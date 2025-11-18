import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UserdefinedcustomfieldsComponent } from './userdefinedcustomfields.component';

describe('UserdefinedcustomfieldsComponent', () => {
  let component: UserdefinedcustomfieldsComponent;
  let fixture: ComponentFixture<UserdefinedcustomfieldsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UserdefinedcustomfieldsComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(UserdefinedcustomfieldsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
