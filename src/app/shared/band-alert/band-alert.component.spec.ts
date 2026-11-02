import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';

import { BandAlertComponent } from './band-alert.component';

describe('BandAlertComponent', () => {
  let fixture: ComponentFixture<BandAlertComponent>;

  const render = (band: any) => {
    fixture = TestBed.createComponent(BandAlertComponent);
    fixture.componentInstance.band = band;
    fixture.detectChanges();
    return fixture.nativeElement.textContent as string;
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [BandAlertComponent],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();
  });

  it('shows who the replaced band belonged to, why, and their band now', () => {
    const text = render({
      state: 'replaced', code: 'E:T1', reason: 'Lost at the stage', currentCode: 'E:T2',
      owner: { name: 'Arjun Mehta', passTypeName: 'Festival Pass', orderId: 1001 }
    });
    expect(text).toContain('Replaced band');
    expect(text).toContain('Arjun Mehta');
    expect(text).toContain('Festival Pass');
    expect(text).toContain('Order 1001');
    expect(text).toContain('Lost at the stage');
    expect(text).toContain('E:T2');
  });

  it('leaves out rows it has nothing for', () => {
    const text = render({ state: 'replaced', code: 'E:T1', owner: { name: 'Arjun Mehta' } });
    expect(text).not.toContain('Reason');
    expect(text).not.toContain('Their band now');
  });
});
