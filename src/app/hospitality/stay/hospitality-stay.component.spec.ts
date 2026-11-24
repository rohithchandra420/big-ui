import { ComponentFixture, TestBed, fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { DateTimeComponent } from '../../shared/date-time/date-time.component';
import { FormsModule } from '@angular/forms';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { BehaviorSubject, of } from 'rxjs';
import { HospitalityStayComponent, nightsBetween } from './hospitality-stay.component';
import { EventService } from '../../core/event.service';
import { NotificationService } from '../../core/notification.service';
import { ConfirmationService } from '../../shared/confirm-dialog/confirmation.service';
import { HospitalityService } from '../hospitality.service';
import { StayNightRow, StayOverview, StayUnitItem } from '../hospitality.model';
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

// B-021: the Allocate tab's night table
const nila = { _id: 's1', unit: 'u-A-02', unitName: 'A-02', from: '2026-10-21', to: '2026-10-23', nights: 2, gender: 'Female' as const, note: '', people: 1,
  person: { kind: 'staff' as const, _id: 'p9', name: 'Nila Das' }, movedInAt: null, movedOutAt: null };
const nightRows = (): StayNightRow[] => [
  { kind: 'staff', _id: 'p9', name: 'Nila Das', gender: 'Female', detail: 'Decor', expectedAt: '2026-10-19T05:30:00Z', reportedAt: '2026-10-19T06:00:00Z',
    status: 'booked', stay: { ...nila }, stays: [{ _id: 's1', unit: 'A-02', from: '2026-10-21', to: '2026-10-23' }] },
  { kind: 'staff', _id: 'p7', name: 'Ravi Menon', gender: 'Male', detail: 'Operations', expectedAt: '2026-10-20T05:30:00Z', reportedAt: null,
    status: 'none', stay: null, stays: [] },
  { kind: 'guest', _id: 'g1', name: 'Sound crew', gender: null, detail: 'Guest', status: 'none', stay: null, stays: [] }
];

describe('HospitalityStayComponent', () => {
  let fixture: ComponentFixture<HospitalityStayComponent>;
  let component: HospitalityStayComponent;
  let service: jasmine.SpyObj<HospitalityService>;
  let confirm: jasmine.SpyObj<ConfirmationService>;

  beforeEach(async () => {
    service = jasmine.createSpyObj('HospitalityService', ['getStay', 'addStay', 'addUnits', 'searchStayPeople', 'moveStay', 'getStayNight']);
    service.getStay.and.callFake(() => Promise.resolve(overview()));
    service.getStayNight.and.callFake(() => Promise.resolve({ date: '2026-10-21', rows: nightRows() }));
    confirm = jasmine.createSpyObj('ConfirmationService', ['confirm']);
    await TestBed.configureTestingModule({
      declarations: [DateTimeComponent, HospitalityStayComponent, AppSelectComponent, AppOptionComponent, SlidePanelComponent],
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
      expect(service.getStayNight).not.toHaveBeenCalled();   // B-021: no night table without Manage
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

    it('B-021: Allocate shows the night table for the picked night; the page search is hidden on this tab', fakeAsync(() => {
      start();
      expect(service.getStayNight).toHaveBeenCalledWith('e1', '2026-10-21');
      expect(fixture.nativeElement.querySelector('.hy-bar .hy-search')).toBeNull();
      expect(component.shownRows.map(r => r.name)).toEqual(['Nila Das', 'Ravi Menon', 'Sound crew']);
      const rows = fixture.nativeElement.querySelectorAll('.hy-nt-r:not(.hy-nt-h)');
      expect(rows.length).toBe(3);
      expect(rows[1].textContent).toContain('Expected · late, not reported'); // B-017: clear that he has not reported
      expect(rows[0].textContent).not.toContain('not reported');
    }));

    it('B-021: status chips, Staff / Guests and the search narrow the table', fakeAsync(() => {
      start();
      expect(component.countOf('none')).toBe(2);
      component.setNtStatus('none');
      expect(component.shownRows.map(r => r.name)).toEqual(['Ravi Menon', 'Sound crew']);
      component.setNtKind('guest');
      expect(component.shownRows.map(r => r.name)).toEqual(['Sound crew']);
      component.clearNtFilters();
      component.ntQ = 'a-02';                                                 // by unit
      component.applyNight();
      expect(component.shownRows.map(r => r.name)).toEqual(['Nila Das']);
    }));

    it('B-021: a row with no bed opens Allocate for that night; a row with a stay opens the stay panel', fakeAsync(() => {
      start();
      component.openRow(component.nightRows[1]);
      expect(component.person?.name).toBe('Ravi Menon');
      expect([component.from, component.to]).toEqual(['2026-10-21', '2026-10-22']);
      expect(component.gender).toBe('Male');
      component.closeAllocate();
      component.openRow(component.nightRows[0]);
      expect(component.person).toBeNull();
      expect(component.stayRow?.name).toBe('Nila Das');
      fixture.detectChanges();
      const panel = fixture.nativeElement.querySelector('.hy-nt-stay') as HTMLElement;
      expect(panel.textContent).toContain('A-02');
      // Another range starts the morning this stay ends
      component.allocateAnother(component.stayRow!);
      expect(component.stayRow).toBeNull();
      expect([component.from, component.to]).toEqual(['2026-10-23', '2026-10-24']);
    }));

    it('B-084: "All their stays" lists newest first as cards, the viewed night highlighted, moved status when known', fakeAsync(() => {
      start();
      const row = component.nightRows[0];
      row.stays = [
        { _id: 's0', unit: 'Dome 1', from: '2026-10-18', to: '2026-10-20' },
        { _id: 's1', unit: 'A-02', from: '2026-10-21', to: '2026-10-23' },
        { _id: 's2', unit: 'Cottage 1', from: '2026-10-24', to: '2026-10-25' }
      ];
      component.data!.units[1].stays[0].movedInAt = '2026-10-21T10:00:00Z';
      component.openRow(row);
      const list = component.allStays(row);
      expect(list.map(x => x.unit)).toEqual(['Cottage 1', 'A-02', 'Dome 1']);
      expect(list.map(x => x.when)).toEqual(['next', 'now', 'past']);
      expect(list.map(x => x.nights)).toEqual([1, 2, 2]);
      expect(list[1].moved).toBe('Moved in');
      expect(list[0].moved).toBe('');
      expect(component.allNights(row)).toBe(5);
      expect(component.allStays(row)).toBe(list);                       // same array until something changes
      fixture.detectChanges();
      const cards = Array.from(fixture.nativeElement.querySelectorAll('.hy-all-i')) as HTMLElement[];
      expect(cards.length).toBe(3);
      expect(cards[1].classList).toContain('w-now');
      expect(cards[1].textContent).toContain('This night');
      expect(cards[0].textContent).toContain('Upcoming');
      expect(cards[2].textContent).toContain('Past');
      expect((fixture.nativeElement.querySelector('.hy-all-hd') as HTMLElement).textContent).toContain('3 stays · 5 nights');
    }));

    it('B-084: nightsBetween counts nights from the first night to the leaving morning', () => {
      expect(nightsBetween('2026-10-21', '2026-10-23')).toBe(2);
      expect(nightsBetween('2026-10-31', '2026-11-01')).toBe(1);
      expect(nightsBetween('2026-10-21', '2026-10-21')).toBe(0);
    });

    it('B-021: the stay panel follows a reload; a moved-in stay offers Moved out and Undo', fakeAsync(() => {
      start();
      component.openRow(component.nightRows[0]);
      const moved = nightRows();
      moved[0].status = 'in';
      moved[0].stay = { ...nila, movedInAt: '2026-10-21T10:00:00Z' };
      service.getStayNight.and.callFake(() => Promise.resolve({ date: '2026-10-21', rows: moved }));
      component.load();
      flushMicrotasks();
      fixture.detectChanges();
      expect(component.stayRow?.status).toBe('in');
      const text = (fixture.nativeElement.querySelector('app-slide-panel .hy-nt-acts') as HTMLElement).textContent || '';
      expect(text).toContain('Moved out');
      expect(text).toContain('Undo Moved in');
      expect(text).not.toContain('Cancel stay');
    }));

    it('B-017: the search sends the picked night; staff not reported are tagged', fakeAsync(() => {
      service.searchStayPeople.and.returnValue(Promise.resolve({ people: [] }));
      start();
      component.q = 'ravi';
      component.search();
      flushMicrotasks();
      expect(service.searchStayPeople).toHaveBeenCalledWith('e1', 'ravi', '2026-10-21');
      expect(component.joinTag({ kind: 'staff', _id: 'x', name: 'X', gender: null, detail: '', stays: [], expectedAt: '2099-01-01T05:30:00Z', reportedAt: null })?.label)
        .toBe('Expected · not reported yet');
      expect(component.joinTag({ kind: 'guest', _id: 'g', name: 'G', gender: null, detail: '', stays: [] })).toBeNull();
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
