import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ExternallinksComponent } from './externallinks.component';

describe('ExternallinksComponent', () => {
  let component: ExternallinksComponent;
  let fixture: ComponentFixture<ExternallinksComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ExternallinksComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ExternallinksComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
