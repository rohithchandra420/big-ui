// UAT-RESET: remove before Production (whole folder).
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { UatResetComponent } from './uat-reset.component';
import { UatResetCounts, UatResetService } from '../../core/uat-reset.service';
import { EventService } from '../../core/event.service';
import { AppSelectComponent } from '../../shared/app-select/app-select.component';
import { AppOptionComponent } from '../../shared/app-select/app-option.component';

const COUNTS: UatResetCounts = {
  attendance: { records: 12 },
  bands: { bands: 4, admitted: 3 }, workshops: { entries: 7 }, map: { locations: 2, areas: 1 },
  hospitality: { mealsServed: 5, mealDays: 1, mealPasses: 0, stays: 2 }
};

describe('UatResetComponent', () => {
  let fixture: ComponentFixture<UatResetComponent>;
  let c: UatResetComponent;
  let uat: jasmine.SpyObj<UatResetService>;

  const create = (available = true) => {
    uat.available.and.returnValue(of(available));
    fixture = TestBed.createComponent(UatResetComponent);
    c = fixture.componentInstance;
    fixture.detectChanges();
  };

  beforeEach(async () => {
    uat = jasmine.createSpyObj('UatResetService', ['available', 'preview', 'reset']);
    uat.preview.and.returnValue(of({ event: { _id: 'ev1', name: 'BiG 7.0' }, counts: COUNTS }));
    await TestBed.configureTestingModule({
      declarations: [UatResetComponent, AppSelectComponent, AppOptionComponent],
      imports: [FormsModule],
      providers: [
        { provide: UatResetService, useValue: uat },
        { provide: EventService, useValue: { events: new BehaviorSubject([{ _id: 'ev1', name: 'BiG 7.0', status: 'active' }]) } }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();
  });

  it('says so when the server has it switched off', () => {
    create(false);
    expect(fixture.nativeElement.textContent).toContain('switched off on this server');
    expect(fixture.nativeElement.querySelector('.ur-card')).toBeNull();
  });

  it('shows the counts once an event is picked', () => {
    create();
    c.pickEvent('ev1');
    fixture.detectChanges();
    expect(uat.preview).toHaveBeenCalledWith('ev1');
    expect(c.countText('bands')).toBe('4 bands · 3 admitted');
    expect(c.countText('map')).toBe('2 pins · 1 areas');
  });

  it('needs a group and the exact event name before Reset works', () => {
    create();
    c.pickEvent('ev1');
    expect(c.canReset).toBeFalse();
    c.toggle('bands');
    expect(c.canReset).toBeFalse();
    c.confirmText = 'BiG 7';
    expect(c.canReset).toBeFalse();
    c.confirmText = 'BiG 7.0';
    expect(c.canReset).toBeTrue();
  });

  it('resets the picked groups in a fixed order and shows what was deleted', () => {
    create();
    c.pickEvent('ev1');
    c.toggle('map');
    c.toggle('bands');
    c.confirmText = 'BiG 7.0';
    uat.reset.and.returnValue(of({ event: { _id: 'ev1', name: 'BiG 7.0' }, deleted: { bands: { bands: 4, admitted: 3 }, map: { locations: 2, areas: 1 } } }));
    c.reset();
    expect(uat.reset).toHaveBeenCalledWith('ev1', ['bands', 'map'], 'BiG 7.0');
    expect(c.doneText('bands')).toBe('4 bands removed · 3 passes un-admitted');
    expect(c.picked.size).toBe(0);
    expect(c.confirmText).toBe('');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Reset done');
  });

  it('staff attendance: counted for a dated event, greyed out for one without dates', () => {
    create();
    c.pickEvent('ev1');
    expect(c.countText('attendance')).toBe('12 marked slots');
    c.toggle('attendance');
    expect(c.picked.has('attendance')).toBeTrue();

    uat.preview.and.returnValue(of({ event: { _id: 'ev1', name: 'BiG 7.0' }, counts: { ...COUNTS, attendance: { records: null } } }));
    c.pickEvent('ev1');
    c.picked.clear();
    expect(c.unavailable('attendance')).toBeTrue();
    expect(c.countText('attendance')).toBe('This event has no dates');
    c.toggle('attendance');
    expect(c.picked.has('attendance')).toBeFalse();
  });

  it('shows the server message when the reset is refused', () => {
    create();
    c.pickEvent('ev1');
    c.toggle('bands');
    c.confirmText = 'BiG 7.0';
    uat.reset.and.returnValue(throwError(() => ({ error: { message: 'The typed name does not match the event' } })));
    c.reset();
    expect(c.error).toBe('The typed name does not match the event');
    expect(c.resetting).toBeFalse();
  });
});
