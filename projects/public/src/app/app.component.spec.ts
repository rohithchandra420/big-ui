import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { AppComponent } from './app.component';
import { PublicApiService, PublicEventAnswer, PublicSession } from './core/public-api.service';

export const session = (over: Partial<PublicSession> = {}): PublicSession => ({
  id: 's1', title: 'Hand Drumming', category: { name: 'Music', colour: '#7c3aed', icon: 'music_note' }, venue: 'Bamboo Dome',
  start: '2026-12-11T05:30:00Z', end: '2026-12-11T06:30:00Z', facilitators: ['Ira Monsoon'], description: 'Rhythm for everyone',
  ageLimit: '8+', language: 'English', bringYourOwn: '', itemsRequired: '', state: 'open', stateAt: null, full: false, placesLeft: 12,
  ...over
});

const during: PublicEventAnswer = {
  off: false, name: 'BiG 7.0', startDate: '2026-12-10', endDate: '2026-12-12', today: '2026-12-11',
  phase: 'during', days: ['2026-12-10', '2026-12-11', '2026-12-12']
};

describe('AppComponent (public shell)', () => {
  let fixture: ComponentFixture<AppComponent>;
  let component: AppComponent;
  let apiSpy: jasmine.SpyObj<PublicApiService>;

  const create = () => {
    fixture = TestBed.createComponent(AppComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  };
  const text = () => (fixture.nativeElement as HTMLElement).textContent || '';

  beforeEach(async () => {
    history.replaceState(null, '', location.pathname);
    apiSpy = jasmine.createSpyObj('PublicApiService', ['event', 'sessions']);
    apiSpy.event.and.returnValue(of({ data: during, at: Date.now(), offline: false }));
    apiSpy.sessions.and.returnValue(of({ data: { off: false, sessions: [] }, at: Date.now(), offline: false }));
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [{ provide: PublicApiService, useValue: apiSpy }]
    }).compileComponents();
  });
  afterEach(() => {
    fixture?.destroy();
    history.replaceState(null, '', location.pathname);
  });

  it('during the festival: day number, event name and the days strip', () => {
    create();
    expect(text()).toContain('Day 2 is');
    expect(text()).toContain('Welcome to BiG 7.0');
    const days = fixture.nativeElement.querySelectorAll('.day');
    expect(days.length).toBe(3);
    expect(days[1].classList).toContain('on');
    expect(days[0].classList).toContain('past');
  });

  it('before: a countdown instead of the days', () => {
    apiSpy.event.and.returnValue(of({ data: { ...during, phase: 'before', today: '2026-12-01' } as PublicEventAnswer, at: Date.now(), offline: false }));
    create();
    expect(text()).toContain('Almost time to');
    expect(fixture.nativeElement.querySelector('.countdown')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.days')).toBeNull();
  });

  it('after: a thank-you', () => {
    apiSpy.event.and.returnValue(of({ data: { ...during, phase: 'after', today: '2026-12-14' } as PublicEventAnswer, at: Date.now(), offline: false }));
    create();
    expect(text()).toContain('Thank you,');
  });

  it('switched off: the resting screen, nothing else', () => {
    apiSpy.event.and.returnValue(of({ data: { off: true } as PublicEventAnswer, at: Date.now(), offline: false }));
    create();
    expect(text()).toContain('The festival page is resting');
    expect(fixture.nativeElement.querySelector('.hero')).toBeNull();
  });

  it('unreachable with nothing saved: the offline screen with Try again', () => {
    apiSpy.event.and.returnValue(throwError(() => new Error('offline')));
    create();
    expect(text()).toContain("You're offline");
    apiSpy.event.and.returnValue(of({ data: during, at: Date.now(), offline: false }));
    (fixture.nativeElement.querySelector('.cta') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(text()).toContain('Day 2 is');
  });

  it('offline with a saved copy: shows it with the time it was updated', () => {
    apiSpy.event.and.returnValue(of({ data: during, at: Date.parse('2026-12-11T05:12:00Z'), offline: true }));
    create();
    expect(component.freshText).toBe('Offline · updated 10:42');
  });

  it('switches views by #hash and opens on the view in the address', () => {
    location.hash = 'map';
    create();
    expect(component.view).toBe('map');
    component.go('news');
    fixture.detectChanges();
    expect(location.hash).toBe('#news');
    expect(text()).toContain('News and updates from the organisers');
    component.go('home');
    expect(component.view).toBe('home');
  });

  it('a failing schedule does not hide the page', () => {
    apiSpy.sessions.and.returnValue(throwError(() => new Error('500')));
    create();
    expect(text()).toContain('Day 2 is');
    expect(component.sessions).toEqual([]);
  });

  it('opens and closes a session\'s details', () => {
    const now = Date.now();
    const s = session({ start: new Date(now - 600000).toISOString(), end: new Date(now + 3000000).toISOString() });
    apiSpy.sessions.and.returnValue(of({ data: { off: false, sessions: [s] }, at: now, offline: false }));
    create();
    (fixture.nativeElement.querySelector('.live-card') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.sheet h3').textContent).toContain('Hand Drumming');
    expect(text()).toContain('With Ira Monsoon');
    (fixture.nativeElement.querySelector('.sheet-x') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.sheet')).toBeNull();
  });

  it('unknown #hash opens Home', () => {
    location.hash = 'admin';
    create();
    expect(component.view).toBe('home');
  });
});
