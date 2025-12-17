import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CasecloseComponent } from './caseclose.component';

describe('CasecloseComponent', () => {
  let component: CasecloseComponent;
  let fixture: ComponentFixture<CasecloseComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CasecloseComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CasecloseComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
