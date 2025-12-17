import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CasedispositionComponent } from './casedisposition.component';

describe('CasedispositionComponent', () => {
  let component: CasedispositionComponent;
  let fixture: ComponentFixture<CasedispositionComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CasedispositionComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CasedispositionComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
