import { provideHttpClient } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SimpleChange } from '@angular/core';
import { HomeViewComponent } from './home-view.component';
import { ScheduleViewComponent } from './schedule-view.component';
import { PublicEvent, PublicSession } from '../core/public-api.service';

const NOW = Date.parse('2026-12-11T06:00:00Z'); // 11:30 India time, day 2
const ev = (over: Partial<PublicEvent> = {}): PublicEvent => ({
  off: false, name: 'BiG 7.0', startDate: '2026-12-10', endDate: '2026-12-12', today: '2026-12-11', phase: 'during',
  days: ['2026-12-10', '2026-12-11', '2026-12-12'], ...over
});
const s = (id: string, start: string, end: string, over: Partial<PublicSession> = {}): PublicSession => ({
  id, title: id, category: { name: 'Art', colour: '#ea580c', icon: 'palette' }, venue: 'Dome', start, end, facilitators: [],
  description: '', ageLimit: '', language: '', bringYourOwn: '', itemsRequired: '', state: 'open', stateAt: null, full: false,
  placesLeft: null, ...over
});
const SESSIONS = [
  s('day1', '2026-12-10T05:30:00Z', '2026-12-10T06:30:00Z'),
  s('running', '2026-12-11T05:30:00Z', '2026-12-11T06:30:00Z'),
  s('later', '2026-12-11T09:30:00Z', '2026-12-11T10:30:00Z', { category: { name: 'Music', colour: '#7c3aed', icon: 'music_note' } }),
  s('earlier', '2026-12-11T03:30:00Z', '2026-12-11T04:30:00Z', { state: 'ended' }),
  s('day3', '2026-12-12T05:30:00Z', '2026-12-12T06:30:00Z'),
];

describe('HomeViewComponent', () => {
  let fixture: ComponentFixture<HomeViewComponent>;
  let c: HomeViewComponent;
  const render = (event: PublicEvent) => {
    fixture = TestBed.createComponent(HomeViewComponent);
    c = fixture.componentInstance;
    c.event = event; c.sessions = SESSIONS; c.now = NOW;
    c.ngOnChanges();
    fixture.detectChanges();
  };
  beforeEach(() => TestBed.configureTestingModule({ imports: [HomeViewComponent], providers: [provideHttpClient()] }));

  it('during: live now + the rest of today', () => {
    render(ev());
    expect(c.live.map(x => x.id)).toEqual(['running']);
    expect(c.shown.map(x => x.id)).toEqual(['later']);
    expect(fixture.nativeElement.textContent).toContain('Live now');
  });

  it('filters Up next by category', () => {
    render(ev());
    c.setCategory('Art');
    expect(c.shown).toEqual([]);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Nothing else in this category today.');
  });

  it('before: the first day as a preview, nothing live', () => {
    render(ev({ phase: 'before', today: '2026-12-01' }));
    expect(c.live).toEqual([]);
    expect(c.shown.map(x => x.id)).toEqual(['day1']);
    expect(fixture.nativeElement.textContent).toContain('Day 1 preview');
  });

  it('after: no sessions on Home', () => {
    render(ev({ phase: 'after', today: '2026-12-13' }));
    expect(fixture.nativeElement.querySelector('pub-session-row')).toBeNull();
    expect(fixture.nativeElement.querySelector('pub-live-card')).toBeNull();
  });
});

describe('ScheduleViewComponent', () => {
  let fixture: ComponentFixture<ScheduleViewComponent>;
  let c: ScheduleViewComponent;
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [ScheduleViewComponent], providers: [provideHttpClient()] });
    fixture = TestBed.createComponent(ScheduleViewComponent);
    c = fixture.componentInstance;
    c.event = ev(); c.sessions = SESSIONS; c.now = NOW;
    c.ngOnChanges({ sessions: new SimpleChange(null, SESSIONS, true) });
    fixture.detectChanges();
  });

  it('opens on today, the whole day in order (ended ones too, greyed)', () => {
    expect(c.day).toBe('2026-12-11');
    expect(c.shown.map(x => x.id)).toEqual(['earlier', 'running', 'later']);
    expect(fixture.nativeElement.querySelectorAll('.tl-row.over').length).toBe(1);
  });

  it('switches day and category', () => {
    c.setDay('2026-12-12');
    expect(c.shown.map(x => x.id)).toEqual(['day3']);
    c.setDay('2026-12-11');
    c.setCategory('Music');
    expect(c.shown.map(x => x.id)).toEqual(['later']);
  });

  it('a day with nothing says so', () => {
    c.sessions = [];
    c.ngOnChanges({ sessions: new SimpleChange(SESSIONS, [], false) });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No sessions on this day.');
  });
});
