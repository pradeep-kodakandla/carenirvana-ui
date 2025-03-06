import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CmdocumenttypeComponent } from './cmdocumenttype.component';

describe('CmdocumenttypeComponent', () => {
  let component: CmdocumenttypeComponent;
  let fixture: ComponentFixture<CmdocumenttypeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CmdocumenttypeComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CmdocumenttypeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
