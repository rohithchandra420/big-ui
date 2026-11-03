import { ComponentFixture, TestBed, fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { HospitalitySetupComponent } from './hospitality-setup.component';
import { EventService } from '../../core/event.service';
import { NotificationService } from '../../core/notification.service';
import { HospitalityService } from '../hospitality.service';
import { MessSetup } from '../hospitality.model';
import { AppSelectComponent } from '../../shared/app-select/app-select.component';
import { AppOptionComponent } from '../../shared/app-select/app-option.component';

const defaults = { times: { breakfast: '07:30', lunch: '12:30', snacks: '16:30', dinner: '20:00' }, openMinutes: 150, snacksBasis: 'morning' as const, countDueAfterMin: 45 };
const empty = (): MessSetup => ({ plan: null, messHalls: [], messStatus: null, defaults });

describe('HospitalitySetupComponent', () => {
  let fixture: ComponentFixture<HospitalitySetupComponent>;
  let component: HospitalitySetupComponent;
  let service: jasmine.SpyObj<HospitalityService>;

  beforeEach(async () => {
    service = jasmine.createSpyObj('HospitalityService', ['getSetup', 'saveSetup']);
    service.getSetup.and.callFake(() => Promise.resolve(empty()));
    service.saveSetup.and.returnValue(Promise.resolve({ plan: null }));
    await TestBed.configureTestingModule({
      declarations: [HospitalitySetupComponent, AppSelectComponent, AppOptionComponent],
      imports: [FormsModule],
      providers: [
        { provide: EventService, useValue: { activeEvent: new BehaviorSubject<any>({ _id: 'e1', name: 'BiG 7.0' }) } },
        { provide: NotificationService, useValue: jasmine.createSpyObj('NotificationService', ['openSucessSnackBar', 'openErrorSnackBar']) },
        { provide: HospitalityService, useValue: service }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();
    fixture = TestBed.createComponent(HospitalitySetupComponent);
    component = fixture.componentInstance;
  });

  const start = () => { fixture.detectChanges(); flushMicrotasks(); fixture.detectChanges(); };

  it('starts from the defaults when there is no plan', fakeAsync(() => {
    start();
    expect(component.times.lunch).toBe('12:30');
    expect(component.openHours).toBe(2.5);
    expect(fixture.nativeElement.textContent).toContain('Add a location of type "Mess Hall"');
    expect(fixture.nativeElement.textContent).toContain('Not on the map yet');
  }));

  it('fills the form from a saved plan', fakeAsync(() => {
    service.getSetup.and.returnValue(Promise.resolve({
      ...empty(),
      plan: { _id: 'p1', event: 'e1', opensOn: '2026-10-20T00:00:00.000Z', closesOn: '2026-11-19T00:00:00.000Z', times: { ...defaults.times, lunch: '13:00' }, openMinutes: 120, snacksBasis: 'afternoon', countDueAfterMin: 30, messHall: 'l1' },
      messHalls: [{ _id: 'l1', name: 'Mess Hall' }]
    }));
    start();
    expect(component.opensOn).toBe('2026-10-20');
    expect(component.messDays).toBe(31);
    expect(component.times.lunch).toBe('13:00');
    expect(component.snacksBasis).toBe('afternoon');
    expect(component.messHall).toBe('l1');
    expect(component.strip.length).toBe(31);
  }));

  it('checks the dates before saving', fakeAsync(() => {
    start();
    component.save();
    expect(component.error).toContain('Pick the days');
    component.opensOn = '2026-11-19';
    component.closesOn = '2026-11-01';
    component.save();
    expect(component.error).toContain('on or after');
    expect(service.saveSetup).not.toHaveBeenCalled();
  }));

  it('saves minutes, not hours, and null for no Mess Hall', fakeAsync(() => {
    start();
    component.opensOn = '2026-10-20';
    component.closesOn = '2026-11-19';
    component.openHours = 2;
    component.save();
    flushMicrotasks();
    expect(service.saveSetup).toHaveBeenCalledWith(jasmine.objectContaining({ event: 'e1', openMinutes: 120, messHall: null, snacksBasis: 'morning' }));
  }));
});
