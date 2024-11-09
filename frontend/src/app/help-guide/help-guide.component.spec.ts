import { ComponentFixture, TestBed } from '@angular/core/testing';

import { HelpGuideComponent } from './help-guide.component';

describe('HelpQuideComponent', () => {
  let component: HelpGuideComponent;
  let fixture: ComponentFixture<HelpGuideComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HelpGuideComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(HelpGuideComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
