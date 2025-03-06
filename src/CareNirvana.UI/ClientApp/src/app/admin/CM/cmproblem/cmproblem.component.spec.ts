import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CmproblemComponent } from './cmproblem.component';

describe('CmproblemComponent', () => {
  let component: CmproblemComponent;
  let fixture: ComponentFixture<CmproblemComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CmproblemComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CmproblemComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
