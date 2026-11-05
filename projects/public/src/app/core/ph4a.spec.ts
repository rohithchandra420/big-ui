import { of } from 'rxjs';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PublicApiService, PublicMapArea, PublicMapPin } from './public-api.service';
import { centreOf, metresBetween, nearest, placesFor, walkMinutes } from './map-data';
import { MyLocationService } from './my-location.service';
import { FindWayComponent } from '../ui/find-way.component';
import { EmergencyComponent, smsOf, telOf, whatsappOf } from '../ui/emergency.component';
import { MapViewComponent } from '../views/map-view.component';

// PH4a: public map helpers, Find your way, Emergency, Map tab.

const pins: PublicMapPin[] = [
  { id: 'w1', name: 'Tap near Gate', type: 'water', lat: 20.980, lng: 79.350 },
  { id: 'w2', name: 'Tap by the Dome', type: 'water', lat: 20.990, lng: 79.360 },
  { id: 't1', name: 'Toilets A', type: 'toilets', lat: 20.985, lng: 79.355 },
  { id: 'bo', name: 'Box Office', type: 'box_office', lat: 20.981, lng: 79.351, open: true, note: 'Queue <10 min' },
];
const areas: PublicMapArea[] = [
  { id: 'm1', name: 'Medical camp', kind: 'medical_camp', points: [[20.982, 79.352], [20.983, 79.352], [20.983, 79.353]] },
  { id: 'r1', name: 'Exit route', kind: 'emergency', points: [[20.98, 79.35], [20.99, 79.36], [21.0, 79.37]] },
  { id: 'b', name: '<b>Ground</b>', kind: 'boundary', points: [[20.97, 79.34], [21.0, 79.34], [21.0, 79.37]] },
];

describe('public map helpers', () => {
  it('distance and walking minutes', () => {
    const m = metresBetween([20.98, 79.35], [20.99, 79.35]);
    expect(m).toBeGreaterThan(1100);
    expect(m).toBeLessThan(1120);
    expect(walkMinutes(m)).toBe(15);
    expect(walkMinutes(10)).toBe(1);
  });

  it('centre of an area, halfway point of a line', () => {
    expect(centreOf(areas[0])[0]).toBeCloseTo(20.98267, 4);
    expect(centreOf(areas[1])).toEqual([20.99, 79.36]);
  });

  it('places for each shortcut, nearest to the phone', () => {
    expect(placesFor('water', pins, areas).map(p => p.id)).toEqual(['w1', 'w2']);
    expect(placesFor('firstAid', pins, areas).map(p => p.id)).toEqual(['m1']);
    expect(placesFor('toilets', pins, [...areas, { id: 'wa', name: 'Washrooms', kind: 'washroom', points: areas[0].points }]).map(p => p.id)).toEqual(['t1', 'wa']);
    expect(nearest(placesFor('water', pins, areas), [20.991, 79.361])!.place.id).toBe('w2');
    expect(nearest(placesFor('water', pins, areas), null)).toEqual({ place: jasmine.objectContaining({ id: 'w1' }), metres: null });
    expect(nearest([], null)).toBeNull();
  });

  it('call / SMS / WhatsApp links', () => {
    expect(telOf('+91 98765-43210')).toBe('tel:+919876543210');
    expect(smsOf('+91 98765 43210', 'Help at x')).toBe('sms:+919876543210?&body=Help%20at%20x');
    expect(whatsappOf('+91 98765 43210', 'Hi')).toBe('https://wa.me/919876543210?text=Hi');
  });
});

describe('FindWayComponent', () => {
  let fixture: ComponentFixture<FindWayComponent>;
  let c: FindWayComponent;
  let me: MyLocationService;
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [FindWayComponent] });
    me = TestBed.inject(MyLocationService);
    fixture = TestBed.createComponent(FindWayComponent);
    c = fixture.componentInstance;
    c.pins = pins; c.areas = areas;
    c.help = [{ icon: 'support_agent', title: 'Helpdesk', text: 'Near Gate 1' }];
    c.ngOnChanges();
    fixture.detectChanges();
  });

  it('shows the four shortcuts; a missing kind is disabled', () => {
    expect(c.rows.map(r => r.placeId)).toEqual(['w1', 'm1', 't1', 'bo']);
    c.pins = pins.filter(p => p.type !== 'box_office');
    c.ngOnChanges();
    expect(c.rows[3].placeId).toBeNull();
  });

  it('walking minutes once the location is known', () => {
    expect(c.rows[0].minutes).toBeNull();
    me.location$.next({ at: [20.9905, 79.3605], accuracy: 10 });
    expect(c.rows[0].placeId).toBe('w2');
    expect(c.rows[0].minutes).toBe(1);
  });

  it('tap opens the map on the place; help tiles open their text', () => {
    let opened: string | null | undefined;
    c.openMap.subscribe(v => opened = v);
    (fixture.nativeElement.querySelector('.near button') as HTMLButtonElement).click();
    expect(opened).toBe('w1');
    let help: any;
    c.openHelp.subscribe(h => help = h);
    (fixture.nativeElement.querySelector('.help button') as HTMLButtonElement).click();
    expect(help.title).toBe('Helpdesk');
  });

  it('hides Find your way when the map has nothing', () => {
    c.pins = []; c.areas = [];
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.near')).toBeNull();
  });
});

describe('EmergencyComponent', () => {
  let fixture: ComponentFixture<EmergencyComponent>;
  let c: EmergencyComponent;
  let me: MyLocationService;
  const open = () => { (fixture.nativeElement.querySelector('.sos') as HTMLButtonElement).click(); fixture.detectChanges(); };
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [EmergencyComponent], providers: [{ provide: PublicApiService, useValue: { sendSos: () => of({ ok: true, id: 'x' }) } }] });
    me = TestBed.inject(MyLocationService);
    fixture = TestBed.createComponent(EmergencyComponent);
    c = fixture.componentInstance;
    c.pins = pins; c.areas = areas;
  });

  it('main line first, other contacts, nearest first aid and 112', () => {
    c.contacts = [{ label: 'Festival line', phone: '+91 98765 43210' }, { label: 'Medical tent', phone: '0712 555' }];
    fixture.detectChanges();
    open();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Call Festival line');
    expect(text).toContain('Call Medical tent');
    expect(text).toContain('Nearest first aid');
    expect(text).toContain('Call 112');
    expect((fixture.nativeElement.querySelector('.sos-btn.primary') as HTMLAnchorElement).getAttribute('href')).toBe('tel:+919876543210');
  });

  it('generic wording with no contacts; 112 still there', () => {
    fixture.detectChanges();
    open();
    expect(fixture.nativeElement.textContent).toContain('The festival emergency line will appear here.');
    expect(fixture.nativeElement.textContent).toContain('Call 112');
  });

  it('nearest first aid opens the map there', () => {
    fixture.detectChanges();
    open();
    let at: string | undefined;
    c.openMap.subscribe(v => at = v);
    c.goFirstAid();
    expect(at).toBe('m1');
    expect(c.open).toBeFalse();
  });

  it('share: says so when the location is refused', async () => {
    c.contacts = [{ label: 'Line', phone: '112233' }];
    spyOn(me, 'request').and.callFake(async () => { me.problem = 'denied'; return null; });
    await c.share('sms');
    expect(c.locProblem).toBe('denied');
  });
});

describe('MapViewComponent', () => {
  it('draws the pins and areas, escapes names, and builds the legend', async () => {
    TestBed.configureTestingModule({ imports: [MapViewComponent] });
    const fixture = TestBed.createComponent(MapViewComponent);
    const c = fixture.componentInstance;
    c.pins = pins; c.areas = areas;
    c.ngOnChanges();
    fixture.detectChanges();
    for (let i = 0; i < 50 && !c.ready && !c.failed; i++) await new Promise(r => setTimeout(r, 100));
    expect(c.ready).toBeTrue();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelectorAll('.pub-pin').length).toBe(4);
    expect(el.querySelector('.pub-pin b.open')).toBeTruthy();   // Box Office open dot
    expect(c.legend.map(l => l.word)).toEqual(['map.water', 'map.toilets', 'map.boxOffice', 'map.firstAid', 'map.emergencyRoute']);
    expect((c as any).popup('<b>x</b>', 'map.boundary', [1, 2])).toContain('&lt;b&gt;x&lt;/b&gt;');
    fixture.destroy();
  });
});
