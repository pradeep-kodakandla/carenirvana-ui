import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DatafieldsComponent } from './datafields.component';

describe('DatafieldsComponent', () => {
  let component: DatafieldsComponent;
  let fixture: ComponentFixture<DatafieldsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DatafieldsComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DatafieldsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
