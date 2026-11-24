import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { CheckinViewComponent, CheckinDraft, cleanPhone, fieldError } from './checkin-view.component';
import { CheckinAnswer, CheckinApiService, CheckinPage, checkinTokenFromHash, isCheckinHash } from '../core/checkin-api.service';

// Early Check-In page (EC3). Invented sample people only.

const TOKEN = 'a'.repeat(43);
const page = (over: Partial<CheckinPage> = {}): CheckinPage => ({
  state: 'open',
  event: { name: 'BiG 7.0', startDate: '2026-12-20T00:00:00Z', endDate: '2026-12-23T00:00:00Z' },
  booking: 'BK-7781',
  expiresAt: '2026-12-07T10:00:00Z',
  fields: ['name', 'phone_no', 'email', 'gender'],
  genders: ['Male', 'Female', 'Prefer not to say'],
  nameMin: 2, nameMax: 60,
  passes: [
    { id: 'p1', passType: 'Festival Pass', name: 'Linnea Corrow', phone_no: '9833300001', email: 'linnea@example.com', gender: 'Female', locked: false },
    { id: 'p2', passType: 'Festival Pass', name: '', phone_no: '', email: '', gender: null, locked: false },
    { id: 'p3', passType: 'Festival Pass', name: 'Bram Oakhurst', phone_no: '9833300003', email: 'bram@example.com', gender: 'Male', locked: true },
  ],
  ...over
});
const draft = (over: Partial<CheckinDraft> = {}): CheckinDraft => ({
  id: 'x', passType: 'Festival Pass', locked: false, name: 'Ada Pembry', phone_no: '9833300009', email: 'ada@example.com', gender: 'Female', ...over
});

describe('Early Check-In helpers', () => {
  it('reads the link from the address hash', () => {
    expect(checkinTokenFromHash('#check-in/' + TOKEN)).toBe(TOKEN);
    expect(checkinTokenFromHash('#check-in/')).toBeNull();
    expect(checkinTokenFromHash('#check-in/bad link!')).toBeNull();
    expect(checkinTokenFromHash('#map')).toBeNull();
    expect(isCheckinHash('#check-in/whatever')).toBeTrue();
    expect(isCheckinHash('#check-in')).toBeTrue();
    expect(isCheckinHash('#map')).toBeFalse();
  });

  it('phone rule matches the server', () => {
    expect(cleanPhone('+91 98333-00001')).toBe('+919833300001');
    expect(cleanPhone('12345')).toBeNull();
    expect(cleanPhone('call me')).toBeNull();
  });

  it('field rules', () => {
    expect(fieldError(draft(), 'name')).toBeNull();
    expect(fieldError(draft({ name: '' }), 'name')).toBe('ci.err.required');
    expect(fieldError(draft({ name: 'A' }), 'name')).toBe('ci.err.name');
    expect(fieldError(draft({ name: 'x'.repeat(61) }), 'name')).toBe('ci.err.name');
    expect(fieldError(draft({ phone_no: '123' }), 'phone_no')).toBe('ci.err.phone');
    expect(fieldError(draft({ email: 'nope' }), 'email')).toBe('ci.err.email');
    expect(fieldError(draft({ gender: null }), 'gender')).toBe('ci.err.gender');
    expect(fieldError(draft({ locked: true, name: '' }), 'name')).toBeNull();
  });
});

describe('CheckinViewComponent', () => {
  let fixture: ComponentFixture<CheckinViewComponent>;
  let component: CheckinViewComponent;
  let api: jasmine.SpyObj<CheckinApiService>;
  const text = () => (fixture.nativeElement as HTMLElement).textContent || '';
  const el = (sel: string) => (fixture.nativeElement as HTMLElement).querySelector(sel) as HTMLElement;
  const all = (sel: string) => Array.from((fixture.nativeElement as HTMLElement).querySelectorAll(sel)) as HTMLElement[];

  const create = (answer: CheckinAnswer, token: string | null = TOKEN) => {
    api.open.and.returnValue(of(answer));
    fixture = TestBed.createComponent(CheckinViewComponent);
    component = fixture.componentInstance;
    component.token = token;
    fixture.detectChanges();
  };

  beforeEach(async () => {
    api = jasmine.createSpyObj('CheckinApiService', ['open', 'submit']);
    await TestBed.configureTestingModule({
      imports: [CheckinViewComponent],
      providers: [{ provide: CheckinApiService, useValue: api }]
    }).compileComponents();
  });
  afterEach(() => fixture?.destroy());

  it('shows the event, one card per pass, an admitted pass read-only', () => {
    create(page());
    expect(api.open).toHaveBeenCalledWith(TOKEN);
    expect(text()).toContain('BiG 7.0');
    expect(text()).toContain('Booking BK-7781');
    expect(all('.ci-pass').length).toBe(3);
    expect(all('.ci-pass.locked').length).toBe(1);
    expect(all('.ci-pass.locked input').length).toBe(0);
    expect(text()).toContain('Bram Oakhurst');
    expect(text()).toContain('1 of 2 passes ready');
  });

  it('a malformed link shows "does not work" without calling the server', () => {
    create(page(), null);
    expect(api.open).not.toHaveBeenCalled();
    expect(text()).toContain('This link does not work');
  });

  it('expired / used / invalid answers show their screen', () => {
    create({ state: 'problem', problem: 'expired' });
    expect(text()).toContain('This link has expired');
    fixture.destroy();
    create({ state: 'problem', problem: 'used' });
    expect(text()).toContain('Already sent');
    expect(el('.ci-pass')).toBeNull();
  });

  it('does not continue while a pass is missing details', () => {
    create(page());
    el('.ci-actions .ci-cta').click();
    fixture.detectChanges();
    expect(component.phase).toBe('form');
    expect(all('.ci-err').length).toBeGreaterThan(0);
  });

  it('fills, reviews and sends only the open passes; then clears the link from the address', () => {
    create(page());
    const d = component.drafts[1];
    component.setValue(d, 'name', 'Odile Fenwray');
    component.setValue(d, 'phone_no', '9833300002');
    component.setValue(d, 'email', 'odile@example.com');
    component.pickGender(d, 'Prefer not to say');
    fixture.detectChanges();
    expect(text()).toContain('2 of 2 passes ready');

    component.review();
    fixture.detectChanges();
    expect(component.phase).toBe('review');
    expect(text()).toContain('only once');

    spyOn(history, 'replaceState');
    api.submit.and.returnValue(of({ state: 'submitted', count: 2 }));
    component.send();
    fixture.detectChanges();
    const sent = api.submit.calls.mostRecent().args[1];
    expect(sent.map(p => p.id)).toEqual(['p1', 'p2']);
    expect(sent[1]).toEqual({ id: 'p2', name: 'Odile Fenwray', phone_no: '9833300002', email: 'odile@example.com', gender: 'Prefer not to say' });
    expect(text()).toContain('Thank you!');
    expect(history.replaceState).toHaveBeenCalled();
  });

  it('a refused send goes back to the form with the message', () => {
    create(page({ passes: [page().passes[0]] }));
    component.review();
    api.submit.and.returnValue(of({ state: 'problem', problem: 'error', message: 'enter a valid email address' }));
    component.send();
    fixture.detectChanges();
    expect(component.phase).toBe('form');
    expect(text()).toContain('enter a valid email address');
  });

  it('gender tiles mark the picked one', () => {
    create(page());
    const card = all('.ci-pass')[1];
    const cardTiles = Array.from(card.querySelectorAll('.ci-tile')) as HTMLElement[];
    expect(cardTiles.length).toBe(3);
    cardTiles[1].click();
    fixture.detectChanges();
    expect(component.drafts[1].gender).toBe('Female');
    expect(cardTiles[1].classList).toContain('on');
  });
});
