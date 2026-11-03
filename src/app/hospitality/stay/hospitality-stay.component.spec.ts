import { ComponentFixture, TestBed, fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { BehaviorSubject, of } from 'rxjs';
import { HospitalityStayComponent } from './hospitality-stay.component';
import { EventService } from '../../core/event.service';
import { NotificationService } from '../../core/notification.service';
import { ConfirmationService } from '../../shared/confirm-dialog/confirmation.service';
import { HospitalityService } from '../hospitality.service';
import { StayOverview, StayUnitItem } from '../hospitality.model';
import { AppSelectComponent } from '../../shared/app-select/app-select.component';
import { AppOptionComponent } from '../../shared/app-select/app-option.component';

const night = (date: string, taken = 0, open = true) => ({ date, taken, open });
const unit = (name: string, beds: number, nights: { date: string; taken: number; open: boolean }[], extra: Partial<StayUnitItem> = {}): StayUnitItem => ({
  _id: 'u-' + name, name, beds, notes: '', type: { _id: 't1', name: 'Dorm', icon: 'bed' }, area: null, available: [], nights, stays: [], ...extra
});
const overview = (): StayOverview => ({
  messDates: { opensOn: '2026-10-20', closesOn: '2026-10-25' }, from: '2026-10-20', to: '2026-10-25', today: '2026-10-21',
  types: [{ _id: 't1', name: 'Dorm', icon: 'bed', units: 3 }], icons: ['bed'], areas: [],
  nightStats: { date: '2026-10-21', staffInBed: 3, guestsInBed: 0, movedIn: 1, staffTotal: 5, withoutBed: [{ _id: 'p7', name: 'Ravi Menon', detail: 'Operations' }, { _id: 'p8', name: 'Tess Jacob', detail: 'Stage Crew' }] },
  units: [
    unit('A-01', 2, [night('2026-10-20'), night('2026-10-21', 2), night('2026-10-22', 1)]),
    unit('A-02', 2, [night('2026-10-20'), night('2026-10-21', 1), night('2026-10-22', 1)], {
      stays: [{ _id: 's1', unit: 'u-A-02', from: '2026-10-21', to: '2026-10-23', nights: 2, gender: 'Female', note: '', people: 1, person: { kind: 'staff', _id: 'p9', name: 'Nila Das' }, movedInAt: null, movedOutAt: null }]
    }),
    unit('V-1', 4, [night('2026-10-20', 0, false), night('2026-10-21', 0, false), night('2026-10-22')])
  ]
});

describe('HospitalityStayComponent', () => {
  let fixture: ComponentFixture<HospitalityStayComponent>;
  let component: HospitalityStayComponent;
  let service: jasmine.SpyObj<HospitalityService>;
  let confirm: jasmine.SpyObj<ConfirmationService>;

  beforeEach(async () => {
    service = jasmine.createSpyObj('HospitalityService', ['getStay', 'addStay', 'addUnits', 'searchStayPeople', 'moveStay']);
    service.getStay.and.callFake(() => Promise.resolve(overview()));
    confirm = jasmine.createSpyObj('ConfirmationService', ['confirm']);
    await TestBed.configureTestingModule({
      declarations: [HospitalityStayComponent, AppSelectComponent, AppOptionComponent],
      imports: [FormsModule],
      providers: [
        { provide: EventService, useValue: { activeEvent: new BehaviorSubject<any>({ _id: 'e1', name: 'BiG 7.0' }) } },
        { provide: NotificationService, useValue: jasmine.createSpyObj('NotificationService', ['openSucessSnackBar', 'openErrorSnackBar']) },
        { provide: ConfirmationService, useValue: confirm },
        { provide: HospitalityService, useValue: service }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();
    fixture = TestBed.createComponent(HospitalityStayComponent);
    component = fixture.componentInstance;
  });

  const start = () => { fixture.detectChanges(); flushMicrotasks(); fixture.detectChanges(); };
  const pickNila = () => component.pick({ kind: 'staff', _id: 'p1', name: 'Kiran Rao', gender: 'Male', detail: 'Operations', stays: [] });

  it('lists units with their busiest night and makes the calendar window', fakeAsync(() => {
    start();
    expect(component.peak(component.data!.units[0])).toBe(2);
    expect(component.calFrom).toBe('2026-10-21');           // today, inside the mess dates
    expect(component.calDates[0]).toBe('2026-10-21');
    expect(component.calDates[component.calDates.length - 1]).toBe('2026-10-25');
  }));

  it('free units: a bed every night, open nights only; a different gender sorts last with a warning', fakeAsync(() => {
    start();
    pickNila();
    component.from = '2026-10-21';
    component.to = '2026-10-23';
    component.buildFree();
    // A-01 is full on the 21st; V-1 is closed on the 21st; A-02 has a bed but a woman stays there.
    expect(component.freeUnits.map(f => [f.unit.name, f.free, f.mixed])).toEqual([['A-02', 1, true]]);
    component.from = '2026-10-22';
    component.buildFree();
    // no mismatch first (most free first), the mismatched one last
    expect(component.freeUnits.map(f => f.unit.name)).toEqual(['V-1', 'A-01', 'A-02']);
  }));

  it('a gender mismatch asks to confirm, then allocates with confirmGender', fakeAsync(() => {
    start();
    pickNila();
    component.from = '2026-10-21';
    component.to = '2026-10-23';
    component.buildFree();
    service.addStay.and.returnValues(
      Promise.reject({ error: { code: 'GENDER_MISMATCH', message: 'A-02 has someone of a different gender' } }),
      Promise.resolve({} as any)
    );
    confirm.confirm.and.returnValue(of(true));
    component.assign(component.freeUnits[0]);
    flushMicrotasks();
    expect(confirm.confirm).toHaveBeenCalled();
    expect(service.addStay.calls.mostRecent().args[1]).toEqual(jasmine.objectContaining({ unit: 'u-A-02', person: 'p1', from: '2026-10-21', to: '2026-10-23', gender: 'Male', confirmGender: true }));
  }));

  it('a guest group needs that many free beds; No bed → Allocate opens with the night picked', fakeAsync(() => {
    start();
    component.pick({ kind: 'guest', _id: 'g1', name: 'Pretam + band', gender: 'Male', detail: 'Guest', stays: [] });
    component.from = '2026-10-22';
    component.to = '2026-10-23';
    component.groupCount = 3;
    component.buildFree();
    expect(component.freeUnits.map(f => f.unit.name)).toEqual(['V-1']);      // only V-1 has 3 free beds that night
    expect(fixture.nativeElement.textContent).toContain('2 without a bed');
    component.allocateFor({ _id: 'p7', name: 'Ravi Menon', detail: 'Operations' });
    expect(component.tab).toBe('allocate');
    expect(component.person?.name).toBe('Ravi Menon');
    expect([component.from, component.to]).toEqual(['2026-10-21', '2026-10-22']);
    expect(component.groupSize).toBe(1);
  }));

  it('the search filters units (by name, type or who sleeps there) and stays (by person or unit)', fakeAsync(() => {
    start();
    component.filter = 'v-1';
    component.applyFilter();
    expect(component.shownUnits.map(u => u.name)).toEqual(['V-1']);
    component.filter = 'nila';
    component.applyFilter();
    expect(component.shownUnits.map(u => u.name)).toEqual(['A-02']);
    expect(component.shownStays.map(s => s.person.name)).toEqual(['Nila Das']);
    component.filter = '';
    component.applyFilter();
    expect(component.shownUnits.length).toBe(3);
  }));

  it('a person matches only on the dates looked at; Type and On-the-night filters', fakeAsync(() => {
    start();
    // Units tab: the picked night is 21 Oct — Nila (21–23) is there; on the 24th she isn't
    component.filter = 'nila';
    component.applyFilter();
    expect(component.shownUnits.map(u => u.name)).toEqual(['A-02']);
    component.statsNight = '2026-10-24';
    component.applyFilter();
    expect(component.shownUnits.length).toBe(0);
    // Calendar: the week on screen (21–25) includes her stay
    component.setTab('calendar');
    expect(component.shownUnits.map(u => u.name)).toEqual(['A-02']);

    component.filter = '';
    component.statsNight = '2026-10-21';
    component.setTab('units');
    component.nightFilter = 'full';
    component.applyFilter();
    expect(component.shownUnits.map(u => u.name)).toEqual(['A-01']);
    component.nightFilter = 'closed';
    component.applyFilter();
    expect(component.shownUnits.map(u => u.name)).toEqual(['V-1']);
    component.nightFilter = 'room';
    component.applyFilter();
    expect(component.shownUnits.map(u => u.name)).toEqual(['A-02']);
    component.clearFilters();
    component.typeFilter = 't-none';
    component.applyFilter();
    expect(component.shownUnits.length).toBe(0);
    // Allocate: the type filter narrows the free units and the stays too
    pickNila();
    component.from = '2026-10-22';
    component.to = '2026-10-23';
    component.onTypeFilter();
    expect(component.freeUnits.length).toBe(0);
    expect(component.shownStays.length).toBe(0);
    component.typeFilter = 't1';
    component.onTypeFilter();
    expect(component.freeUnits.length).toBe(3);
  }));

  it('batch preview names', fakeAsync(() => {
    start();
    component.newUnit(true);
    component.form!.prefix = 'B-';
    component.form!.start = 7;
    component.form!.count = 4;
    expect(component.batchPreview).toBe('B-07 … B-10');
  }));
});
