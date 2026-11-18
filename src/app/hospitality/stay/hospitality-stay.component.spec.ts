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
import { SlidePanelComponent } from '../../shared/slide-panel/slide-panel.component';

const night = (date: string, taken = 0, open = true) => ({ date, taken, open });
const unit = (name: string, beds: number, nights: { date: string; taken: number; open: boolean }[], extra: Partial<StayUnitItem> = {}): StayUnitItem => ({
  _id: 'u-' + name, name, beds, notes: '', type: { _id: 't1', name: 'Dorm', icon: 'bed' }, area: null, available: [], nights, stays: [], ...extra
});
const overview = (): StayOverview => ({
  messDates: { opensOn: '2026-10-20', closesOn: '2026-10-25' }, from: '2026-10-20', to: '2026-10-25', today: '2026-10-21',
  types: [{ _id: 't1', name: 'Dorm', icon: 'bed', units: 3 }], icons: ['bed'], areas: [],
  nightStats: { date: '2026-10-21', staffInBed: 3, guestsInBed: 0, movedIn: 1, staffTotal: 5, withoutBed: [{ _id: 'p7', name: 'Ravi Menon', gender: 'Male', detail: 'Operations' }, { _id: 'p8', name: 'Tess Jacob', gender: null, detail: 'Stage Crew' }] },
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
      declarations: [HospitalityStayComponent, AppSelectComponent, AppOptionComponent, SlidePanelComponent],
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

  it('a unit opens its details in the slide panel, with its stays and actions', fakeAsync(() => {
    start();
    component.setTab('units');
    fixture.detectChanges();
    const heads = fixture.nativeElement.querySelectorAll('.hy-uhead');
    (heads[1] as HTMLButtonElement).click();
    fixture.detectChanges();
    const panel = fixture.nativeElement.querySelector('.sp-panel') as HTMLElement;
    expect(panel.querySelector('.sp-title')!.textContent!.trim()).toBe('A-02');
    expect(panel.querySelector('.sp-sub')!.textContent!.trim()).toBe('Dorm · 2 beds');
    expect(panel.textContent).toContain('Nila Das');
    expect(panel.textContent).not.toContain('Delete');           // has a stay
    expect(heads[1].classList).toContain('sel');
    (panel.querySelector('.sp-x') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(component.expanded).toBe('');
    expect(fixture.nativeElement.querySelector('.sp-panel')).toBeNull();
  }));

  it('One unit opens its form in the slide panel; Back to today on the night and calendar steppers', fakeAsync(() => {
    start();
    component.newUnit(false);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.sp-title').textContent.trim()).toBe('New unit');
    expect(fixture.nativeElement.querySelector('.sp-panel #hy-b')).toBeTruthy();
    (fixture.nativeElement.querySelector('.sp-x') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(component.form).toBeNull();

    expect(fixture.nativeElement.querySelector('.hy-night .day-nav-today')).toBeNull();   // tonight already
    component.shiftCal(1);
    expect(component.calFrom).toBe('2026-10-22');
    component.calToToday();
    expect(component.calFrom).toBe('2026-10-21');
    component.statsNight = '2026-10-23';
    component.statsToToday();
    expect(component.statsNight).toBe('2026-10-21');
  }));

  it('free units: a bed every night, open nights only; units keep their own order (a different gender is a warning, not a move)', fakeAsync(() => {
    start();
    pickNila();
    component.from = '2026-10-21';
    component.to = '2026-10-23';
    component.buildFree();
    // A-01 is full on the 21st; V-1 is closed on the 21st; A-02 has a bed but a woman stays there.
    expect(component.freeUnits.map(f => [f.unit.name, f.free, f.mixed])).toEqual([['A-02', 1, true]]);
    component.from = '2026-10-22';
    component.buildFree();
    // the units' own order, whatever is free or mixed (user, 2026-11-18)
    expect(component.freeUnits.map(f => [f.unit.name, f.mixed])).toEqual([['A-01', false], ['A-02', true], ['V-1', false]]);
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
    expect(fixture.nativeElement.textContent).toContain('2 staff without a bed');
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
    component.stayQ = 'nila';                                            // the Stays list has its own search
    component.applyFilter();
    expect(component.shownStays.map(s => s.person.name)).toEqual(['Nila Das']);
    component.stayQ = '';
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

  describe('1.63.0 (B-013 / B-016 / B-011 / B-012, slide panels)', () => {
    const tabs = () => Array.from(fixture.nativeElement.querySelectorAll('.hy-tabs button')).map((b: any) => b.textContent.replace(/person_add|calendar_view_week|bed/g, '').trim());

    it('B-013: tabs are Allocate · Calendar · Units and Allocate opens first', fakeAsync(() => {
      start();
      expect(tabs()).toEqual(['Allocate', 'Calendar', 'Units']);
      expect(component.tab).toBe('allocate');
      expect(fixture.nativeElement.querySelector('.hy-tabs button.on').textContent).toContain('Allocate');
    }));

    it('B-013: a read-only view opens on Calendar (no Allocate tab)', fakeAsync(() => {
      service.getStay.and.callFake(() => Promise.resolve({ ...overview(), canManage: false } as any));
      start();
      expect(component.readOnly).toBeTrue();
      expect(component.tab).toBe('calendar');
      expect(tabs()).toEqual(['Calendar', 'Units']);
    }));

    it('B-016: a new unit starts with today → tomorrow morning; dates are required; one range always stays', fakeAsync(() => {
      start();
      component.newUnit(false);
      expect(component.form!.ranges).toEqual([{ from: '2026-10-21', to: '2026-10-22' }]);
      expect(component.rangeNights(component.form!.ranges[0])).toBe(1);
      component.removeRange(0);
      expect(component.form!.ranges.length).toBe(1);                         // a unit keeps its dates
      const r = component.form!.ranges[0];
      r.from = '2026-10-23';
      component.fixRange(r);                                                 // the morning moves along
      expect(r.to).toBe('2026-10-24');
      expect(component.lastMorning).toBe('2026-10-26');                      // the day after the last mess night

      service.addUnit = jasmine.createSpy('addUnit');
      component.form!.ranges = [];
      component.form!.name = 'Z-1';
      component.saveUnit();
      expect(service.addUnit).not.toHaveBeenCalled();
    }));

    it('B-016: an older unit with no dates gets the mess period to the morning after; the text says "morning"', fakeAsync(() => {
      start();
      const u = component.data!.units[0];
      component.editUnit(u);
      expect(component.form!.ranges).toEqual([{ from: '2026-10-20', to: '2026-10-26' }]);
      expect(component.availText({ ...u, available: [{ from: '2026-10-21', to: '2026-10-23' }] })).toContain('morning');
    }));

    it('B-011: the profile gender is used and not asked; asked only when missing', fakeAsync(() => {
      start();
      component.allocateFor(component.data!.nightStats.withoutBed[0]);        // Ravi: Male on the profile
      fixture.detectChanges();
      expect(component.gender).toBe('Male');
      expect(component.genderFromProfile).toBeTrue();
      expect(fixture.nativeElement.querySelector('.hy-gfixed').textContent).toContain('Male');
      expect(fixture.nativeElement.querySelector('.sp-panel .food-opts')).toBeNull();

      component.allocateFor(component.data!.nightStats.withoutBed[1]);        // Tess: none yet
      fixture.detectChanges();
      expect(component.genderFromProfile).toBeFalse();
      expect(fixture.nativeElement.querySelector('.sp-panel .food-opts')).not.toBeNull();
      expect(fixture.nativeElement.querySelector('.sp-panel').textContent).toContain('saved there with the stay');
    }));

    it('picking opens the Allocate slide panel; closing clears it', fakeAsync(() => {
      start();
      pickNila();
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.sp-title').textContent.trim()).toBe('Kiran Rao');
      component.closeAllocate();
      fixture.detectChanges();
      expect(component.person).toBeNull();
      expect(fixture.nativeElement.querySelector('.sp-panel')).toBeNull();
    }));

    it('Fill a vacant bed from a unit: the panel opens locked to that unit and the picked night; Show all units unlocks', fakeAsync(() => {
      start();
      component.setTab('units');
      const a02 = component.data!.units[1];
      component.openUnit(a02);
      fixture.detectChanges();
      expect(component.freeOn(a02, '2026-10-21')).toBe(1);
      expect(fixture.nativeElement.querySelector('.sp-panel .hy-fill').textContent).toContain('Ravi Menon');   // quick picks
      component.choose(component.asPerson(component.data!.nightStats.withoutBed[0]), 'fill');
      expect(component.expanded).toBe('');
      expect(component.lockUnit).toBe('u-A-02');
      expect([component.from, component.to]).toEqual(['2026-10-21', '2026-10-22']);
      expect(component.freeUnits.map(f => f.unit.name)).toEqual(['A-02']);
      component.unlockUnit();
      expect(component.lockUnit).toBe('');
      component.closeAllocate();
      expect(component.lockUnit).toBe('');
    }));

    it('the Allocate panel has its own Type + search; the order never changes', fakeAsync(() => {
      start();
      pickNila();
      component.from = '2026-10-22';
      component.to = '2026-10-23';
      component.buildFree();
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.sp-panel .hy-ftools input[aria-label="Find a unit"]')).not.toBeNull();
      component.freeQ = 'a-0';
      component.buildFree();
      expect(component.freeUnits.map(f => f.unit.name)).toEqual(['A-01', 'A-02']);
      component.freeType = 't-none';
      component.buildFree();
      fixture.detectChanges();
      expect(component.freeUnits.length).toBe(0);
      expect(fixture.nativeElement.querySelector('.sp-panel').textContent).toContain('No unit matches these filters');
      component.clearFreeFilters();
      expect(component.freeUnits.map(f => f.unit.name)).toEqual(['A-01', 'A-02', 'V-1']);
      // The page's Type filter is where the panel's starts
      component.typeFilter = 't1';
      pickNila();
      expect(component.freeType).toBe('t1');
    }));

    it('Allocate › Stays: own search, status chips and "Night of"; the page search is hidden on this tab', fakeAsync(() => {
      const two = overview();
      two.units[0].stays = [
        { _id: 's2', unit: 'u-A-01', from: '2026-10-20', to: '2026-10-21', nights: 1, gender: 'Male', note: '', people: 1, person: { kind: 'staff', _id: 'p3', name: 'Omar Sheth' }, movedInAt: '2026-10-20T10:00:00Z', movedOutAt: '2026-10-21T05:00:00Z' },
        { _id: 's3', unit: 'u-A-01', from: '2026-10-21', to: '2026-10-24', nights: 3, gender: 'Male', note: '', people: 1, person: { kind: 'staff', _id: 'p4', name: 'Ajay Rao' }, movedInAt: '2026-10-21T10:00:00Z', movedOutAt: null }
      ];
      service.getStay.and.callFake(() => Promise.resolve(two));
      start();
      expect(fixture.nativeElement.querySelector('.hy-bar .hy-search')).toBeNull();
      expect(fixture.nativeElement.querySelector('.hy-stools input')).not.toBeNull();
      expect(component.shownStays.length).toBe(3);
      component.setStayStatus('in');
      expect(component.shownStays.map(s => s.person.name)).toEqual(['Ajay Rao']);
      component.setStayStatus('booked');
      expect(component.shownStays.map(s => s.person.name)).toEqual(['Nila Das']);
      component.setStayStatus('');
      component.stayTonight = true;                                          // night of 21 Oct
      component.applyFilter();
      expect(component.shownStays.map(s => s.person.name)).toEqual(['Ajay Rao', 'Nila Das']);
      component.clearStayFilters();
      expect(component.shownStays.length).toBe(3);
    }));

    it('unit details: stays by date with Before / That night / Later; beds taken that night instead of a stay count', fakeAsync(() => {
      const u = overview();
      u.units[0].stays = [
        { _id: 'z1', unit: 'u-A-01', from: '2026-10-23', to: '2026-10-25', nights: 2, gender: 'Male', note: '', people: 1, person: { kind: 'staff', _id: 'p5', name: 'Bea Late' }, movedInAt: null, movedOutAt: null },
        { _id: 'z2', unit: 'u-A-01', from: '2026-10-20', to: '2026-10-21', nights: 1, gender: 'Male', note: '', people: 1, person: { kind: 'staff', _id: 'p6', name: 'Zed Early' }, movedInAt: null, movedOutAt: null },
        { _id: 'z3', unit: 'u-A-01', from: '2026-10-21', to: '2026-10-22', nights: 1, gender: 'Male', note: '', people: 1, person: { kind: 'staff', _id: 'p7', name: 'Cy Now' }, movedInAt: null, movedOutAt: null }
      ];
      service.getStay.and.callFake(() => Promise.resolve(u));
      start();
      component.setTab('units');
      component.openUnit(component.data!.units[0]);
      fixture.detectChanges();
      expect(component.unitStays.map(s => s.person.name)).toEqual(['Zed Early', 'Cy Now', 'Bea Late']);
      expect(component.unitStays.map(s => component.phase(s))).toEqual(['past', 'now', 'next']);
      const panel = fixture.nativeElement.querySelector('.sp-panel').textContent as string;
      expect(panel).toContain('2 of 2 beds taken');
      expect(panel).not.toContain('Stays:');
    }));

    it('an empty "No bed" list says everyone has a bed (instead of showing nothing)', fakeAsync(() => {
      service.getStay.and.callFake(() => Promise.resolve({ ...overview(), nightStats: { ...overview().nightStats, withoutBed: [] } }));
      start();
      component.setTab('units');
      component.openUnit(component.data!.units[1]);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.sp-panel .hy-allbed').textContent).toContain('Every staff member has a bed');
      expect(fixture.nativeElement.querySelector('.sp-panel .hy-quick')).toBeNull();
    }));

    it('Calendar: a tapped night opens its panel (no side card); quick picks only for the picked night; 7 / 14 / 30 days', fakeAsync(() => {
      start();
      component.setTab('calendar');
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.hy-celldet')).toBeNull();
      const a01 = component.data!.units[0];
      component.openCell(a01, '2026-10-22');
      fixture.detectChanges();
      expect(component.cell!.free).toBe(1);
      expect(fixture.nativeElement.querySelector('.sp-title').textContent.trim()).toBe('A-01');
      expect(fixture.nativeElement.querySelector('.sp-panel .hy-quick')).toBeNull();     // not the picked night
      expect(fixture.nativeElement.querySelector('.sp-panel').textContent).toContain('Show who has no bed this night');
      component.choose({ kind: 'staff', _id: 'p1', name: 'Kiran Rao', gender: 'Male', detail: 'Operations', stays: [] }, 'fill');
      expect(component.cell).toBeNull();
      expect(component.lockUnit).toBe('u-A-01');
      expect([component.from, component.to]).toEqual(['2026-10-22', '2026-10-23']);

      component.setCalDays(7);
      expect(component.calDays).toBe(7);
      component.setCalDays(9);                                               // not offered
      expect(component.calDays).toBe(7);
      component.setCalDays(30);
      expect(component.calDates.length).toBe(5);                             // the mess ends on the 25th
    }));
  });

  it('batch preview names', fakeAsync(() => {
    start();
    component.newUnit(true);
    component.form!.prefix = 'B-';
    component.form!.start = 7;
    component.form!.count = 4;
    expect(component.batchPreview).toBe('B-07 … B-10');
  }));
});
