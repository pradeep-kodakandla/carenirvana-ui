import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AgdocumenttypeComponent } from './agdocumenttype.component';

describe('AgdocumenttypeComponent', () => {
  let component: AgdocumenttypeComponent;
  let fixture: ComponentFixture<AgdocumenttypeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AgdocumenttypeComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AgdocumenttypeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
