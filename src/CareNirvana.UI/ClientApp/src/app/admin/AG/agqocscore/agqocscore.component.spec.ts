import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AgqocscoreComponent } from './agqocscore.component';

describe('AgqocscoreComponent', () => {
  let component: AgqocscoreComponent;
  let fixture: ComponentFixture<AgqocscoreComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AgqocscoreComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AgqocscoreComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
