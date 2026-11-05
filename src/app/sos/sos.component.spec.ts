import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { SosComponent } from './sos.component';
import { SosAlert, SosService } from '../core/sos.service';
import { EventService } from '../core/event.service';
import { NotificationService } from '../core/notification.service';

const alert = (over: Partial<SosAlert> = {}): SosAlert => ({
  _id: 's1', lat: 20.98, lng: 79.35, accuracy: 12, message: 'Fainted near stage', phone: '+91 98765 43210',
  outsideVenue: false, status: 'open', handledBy: null, handledAt: null, handledNote: '',
  createdAt: new Date(Date.now() - 5 * 60000).toISOString(), ...over
});

describe('SosComponent', () => {
  let fixture: ComponentFixture<SosComponent>;
  let c: SosComponent;
  let sos: any;
  let notify: jasmine.SpyObj<NotificationService>;
  const text = () => (fixture.nativeElement as HTMLElement).textContent || '';

  beforeEach(async () => {
    sos = {
      open$: new BehaviorSubject(0),
      list: jasmine.createSpy('list').and.returnValue(of({ items: [alert(), alert({ _id: 's2', status: 'handled', handledBy: 'Asha', handledAt: new Date().toISOString(), handledNote: 'Reached them', message: '' })], open: 1 })),
      handle: jasmine.createSpy('handle').and.returnValue(of(alert({ status: 'handled', handledBy: 'Ravi', handledAt: new Date().toISOString(), handledNote: 'Done' })))
    };
    notify = jasmine.createSpyObj('NotificationService', ['openSucessSnackBar', 'openErrorSnackBar']);
    await TestBed.configureTestingModule({
      declarations: [SosComponent],
      imports: [FormsModule],
      providers: [
        { provide: SosService, useValue: sos },
        { provide: EventService, useValue: { activeEvent: new BehaviorSubject({ _id: 'ev1', name: 'BiG 7.0' }) } },
        { provide: ActivatedRoute, useValue: { queryParamMap: of(convertToParamMap({})) } },
        { provide: NotificationService, useValue: notify }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();
    fixture = TestBed.createComponent(SosComponent);
    c = fixture.componentInstance;
    spyOn<any>(c, 'drawPins').and.returnValue(Promise.resolve());   // no real map in unit tests
    fixture.detectChanges();
  });
  afterEach(() => fixture.destroy());

  it('loads the event\'s alerts, open first, and feeds the sidebar count', () => {
    expect(sos.list).toHaveBeenCalledWith('ev1');
    expect(c.open).toBe(1);
    expect(sos.open$.value).toBe(1);
    expect(text()).toContain('Fainted near stage');
    expect(text()).toContain('5 min ago');
    expect(text()).toContain('Handled by Asha');
    expect(text()).toContain('Reached them');
  });

  it('call and directions links', () => {
    expect(c.tel('+91 98765 43210')).toBe('tel:+919876543210');
    expect(c.directions(alert())).toContain('destination=20.980000,79.350000');
  });

  it('flags an alert outside the venue', () => {
    sos.list.and.returnValue(of({ items: [alert({ outsideVenue: true })], open: 1 }));
    c.load();
    fixture.detectChanges();
    expect(text()).toContain('Outside the venue');
  });

  it('Mark handled sends the note and updates the list and count', () => {
    c.notes['s1'] = ' Done ';
    c.markHandled(c.items[0]);
    expect(sos.handle).toHaveBeenCalledWith('s1', 'Done');
    expect(c.open).toBe(0);
    expect(sos.open$.value).toBe(0);
    expect(notify.openSucessSnackBar).toHaveBeenCalledWith('Marked handled');
  });

  it('shows an error when the list can\'t load', () => {
    sos.list.and.returnValue(throwError(() => new Error('down')));
    c.load();
    expect(c.error).toContain('Could not load');
  });
});
