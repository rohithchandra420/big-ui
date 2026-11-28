import { TestBed } from '@angular/core/testing';
import { I18nService } from './i18n';
import { PublicMapArea, PublicMapPin } from './public-api.service';
import { badgeOf, liveBadge, washBadge } from './live-status';
import { MapViewComponent } from '../views/map-view.component';

// Live status on the public map (2026-11-20).

const MIN = 60 * 1000;
const iso = (min: number) => new Date(Date.now() + min * MIN).toISOString();
const square: [number, number][] = [[20.98, 79.35], [20.99, 79.35], [20.99, 79.36]];

describe('live status words', () => {
  let i18n: I18nService;
  beforeEach(() => i18n = TestBed.inject(I18nService));

  it('workshop states: short badge + the full status line', () => {
    const w = (state: any, extra: any = {}) => liveBadge({ what: 'workshop', now: true, title: 'Clay Birds', start: iso(-10), end: iso(50), state, stateAt: null, full: false, ...extra }, i18n);
    expect(w('open')).toEqual(jasmine.objectContaining({ text: 'Walk in', tone: 'good' }));
    expect(w('list').text).toBe('Walk in');
    expect(w('reg')).toEqual(jasmine.objectContaining({ text: 'Reg open', tone: 'warn' }));
    expect(w('reg', { full: true })).toEqual(jasmine.objectContaining({ text: 'Waitlist', tone: 'bad' }));
    expect(w('regclosed').text).toBe('Reg closed');
    expect(w('soon').text).toBe('Reg soon');
    expect(w('full').text).toBe('Full');
    expect(w('closed')).toEqual(jasmine.objectContaining({ text: 'Entry closed', tone: 'off' }));
    expect(w('open').detail).toContain('Now: Clay Birds');
    const next = liveBadge({ what: 'workshop', now: false, title: 'Clay Birds', start: iso(30), end: iso(90), state: 'reg', stateAt: null, full: false }, i18n);
    expect(next.detail).toMatch(/^Next .+: Clay Birds/);
  });

  it('music: who plays now, or next', () => {
    const now = liveBadge({ what: 'music', now: true, act: 'Velvet Monsoon', genre: 'Folk', start: iso(-5), end: iso(40) }, i18n);
    expect(now).toEqual(jasmine.objectContaining({ text: 'Playing: Velvet Monsoon', tone: 'good', icon: 'music_note' }));
    expect(now.detail).toContain('Folk');
    const next = liveBadge({ what: 'music', now: false, act: 'Velvet Monsoon', genre: '', start: iso(20), end: iso(60) }, i18n);
    expect(next.tone).toBe('info');
    expect(next.text).toMatch(/^Next .+ · Velvet Monsoon$/);
  });

  it('Medical Bay and WASH', () => {
    expect(liveBadge({ what: 'medical', open: true }, i18n)).toEqual(jasmine.objectContaining({ text: 'Open', tone: 'good' }));
    expect(liveBadge({ what: 'medical', open: false }, i18n).detail).toContain('112');
    expect(washBadge('cleaned', i18n)).toEqual(jasmine.objectContaining({ text: 'Cleaned', tone: 'good' }));
    expect(washBadge('open', i18n)).toEqual(jasmine.objectContaining({ text: 'Open', tone: 'warn' }));
    expect(washBadge('closed', i18n).tone).toBe('bad');
    expect(washBadge('filled', i18n).text).toBe('Filled');
    // In progress (user, 2026-11-28)
    expect(washBadge('cleaning', i18n)).toEqual(jasmine.objectContaining({ text: 'Being cleaned', tone: 'info' }));
    expect(washBadge('refilling', i18n)).toEqual(jasmine.objectContaining({ text: 'Being refilled', tone: 'info', detail: 'Being refilled right now' }));
    expect(washBadge('empty', i18n).tone).toBe('bad');
  });

  it('badgeOf: Box Office pin, live area, WASH, nothing', () => {
    const bo: PublicMapPin = { id: 'b', name: 'BO', type: 'box_office', lat: 1, lng: 1, open: false, note: 'Back at 2' };
    expect(badgeOf(bo, i18n)).toEqual(jasmine.objectContaining({ text: 'Closed', tone: 'bad', detail: 'Closed · Back at 2' }));
    expect(badgeOf({ id: 'a', name: 'Med', kind: 'medical_camp', points: square, live: { what: 'medical', open: true } }, i18n)!.tone).toBe('good');
    expect(badgeOf({ id: 'w', name: 'Tap', type: 'water', lat: 1, lng: 1, wash: 'empty' }, i18n)!.text).toBe('Empty');
    expect(badgeOf({ id: 'p', name: 'Car park', kind: 'parking', points: square }, i18n)).toBeNull();
  });
});

describe('MapViewComponent — live map', () => {
  const ready = async (c: MapViewComponent) => { for (let i = 0; i < 50 && !c.ready && !c.failed; i++) await new Promise(r => setTimeout(r, 100)); };
  const areas: PublicMapArea[] = [
    { id: 'g', name: 'Ground', kind: 'boundary', points: [[20.97, 79.34], [21.0, 79.34], [21.0, 79.37], [20.97, 79.37]] },
    { id: 'd', name: 'Dome', kind: 'workshop_area', points: square, live: { what: 'workshop', now: true, title: 'Clay <Birds>', start: iso(-10), end: iso(50), state: 'reg', stateAt: null, full: false } },
    { id: 'm', name: 'First aid', kind: 'medical_camp', points: square, live: { what: 'medical', open: true } },
  ];

  it('veils the world outside the boundary and badges each live place (names escaped)', async () => {
    TestBed.configureTestingModule({ imports: [MapViewComponent] });
    const fixture = TestBed.createComponent(MapViewComponent);
    const c = fixture.componentInstance;
    c.areas = areas;
    c.ngOnChanges();
    fixture.detectChanges();
    await ready(c);
    expect(c.ready).toBeTrue();
    const el: HTMLElement = fixture.nativeElement;
    const badges = Array.from(el.querySelectorAll('.pub-badge')).map(b => b.textContent || '');
    expect(badges.length).toBe(2);
    expect(badges.join('|')).toContain('Reg open');
    // Area labels carry the kind's icon; other areas get a round icon.
    expect(badges.some(b => b.includes('palette'))).toBeTrue();
    expect(el.querySelectorAll('.pub-area-ic').length).toBe(0);   // both non-boundary areas have a label
    // Polygon with a hole: the world ring plus the boundary ring.
    const veil = (c as any).layer.getLayers().find((l: any) => l.options && l.options.fillOpacity === 0.42);
    expect(veil).toBeTruthy();
    expect(veil.getLatLngs().length).toBe(2);
    const pop = (c as any).popup('Dome', 'map.workshops', [1, 2], null) as string;
    expect(pop).toContain('Dome');
    fixture.destroy();
  });

  it('an area without a live status gets its kind icon; the boundary and paths none', async () => {
    TestBed.configureTestingModule({ imports: [MapViewComponent] });
    const fixture = TestBed.createComponent(MapViewComponent);
    const c = fixture.componentInstance;
    c.areas = [
      areas[0],
      { id: 'p', name: 'Car park', kind: 'parking', points: square },
      { id: 'c', name: 'Camp', kind: 'camping', points: square },
      { id: 'r', name: 'Path', kind: 'path', points: [[20.98, 79.35], [20.99, 79.36]] },
    ];
    c.ngOnChanges();
    fixture.detectChanges();
    await ready(c);
    const icons = Array.from(fixture.nativeElement.querySelectorAll('.pub-area-ic')).map((e: any) => e.textContent);
    expect(icons).toEqual(['local_parking', 'camping']);
    fixture.destroy();
  });

  it('the Home preview: no controls, a tap opens the Map tab', async () => {
    TestBed.configureTestingModule({ imports: [MapViewComponent] });
    const fixture = TestBed.createComponent(MapViewComponent);
    const c = fixture.componentInstance;
    c.preview = true;
    c.areas = areas;
    c.ngOnChanges();
    fixture.detectChanges();
    await ready(c);
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.map-me')).toBeNull();
    expect(el.querySelector('.leaflet-control-zoom')).toBeNull();
    let opened = false;
    c.openMap.subscribe(() => opened = true);
    (el.querySelector('.map-card') as HTMLButtonElement).click();
    expect(opened).toBeTrue();
    fixture.destroy();
  });
});
