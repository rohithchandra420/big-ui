import { ComponentFixture, TestBed, discardPeriodicTasks, fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ActivatedRoute, ParamMap, Router, convertToParamMap } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { WashMonitorComponent } from './wash-monitor.component';
import { SlidePanelComponent } from '../../shared/slide-panel/slide-panel.component';
import { EventService } from '../../core/event.service';
import { NotificationService } from '../../core/notification.service';
import { WashService } from '../wash.service';
import { WashFacility } from '../wash.model';

const H = 3600e3;
const fac = (id: string, extra: Partial<WashFacility> = {}): WashFacility => ({
  _id: id, event: 'e1', place: 'pin', location: 'l' + id, area: null, name: 'Facility ' + id, lat: 20, lng: 79, kind: 'water',
  intervalHours: 3, capacityLitres: null, status: 'ok', statusNote: '', lastDoneAt: null, lastDoneBy: null,
  dueAt: null, state: 'not_started', ...extra
});

describe('WashMonitorComponent', () => {
  let fixture: ComponentFixture<WashMonitorComponent>;
  let component: WashMonitorComponent;
  let service: jasmine.SpyObj<WashService>;
  let notify: jasmine.SpyObj<NotificationService>;
  let list: WashFacility[];
  let canLog: boolean;
  let requireQr: boolean;
  let query: BehaviorSubject<ParamMap>;
  let router: jasmine.SpyObj<Router>;
  const ID_A = 'a'.repeat(24), TOKEN = '0123456789abcdef';

  beforeEach(async () => {
    const now = Date.now();
    list = [
      fac('a', { name: 'Water Station A', lastDoneAt: new Date(now - 1 * H).toISOString(), lastDoneBy: 'Ravi' }),
      fac('b', { name: 'Water Station B', lastDoneAt: new Date(now - 4 * H).toISOString() }),
      fac('c', { name: 'Toilet Block 1', kind: 'toilets', status: 'out_of_order', statusNote: 'Pump broken' }),
      fac('d', { name: 'Toilet Block 2', kind: 'toilets' }),
    ];
    canLog = true;
    requireQr = false;
    query = new BehaviorSubject(convertToParamMap({}));
    router = jasmine.createSpyObj('Router', ['navigate']);
    service = jasmine.createSpyObj('WashService', ['facilities', 'history', 'log', 'scan']);
    service.facilities.and.callFake(() => Promise.resolve({ facilities: list.map(f => ({ ...f })), canLog, canManage: false, requireQr, now: new Date().toISOString() }));
    service.history.and.returnValue(Promise.resolve([]));
    notify = jasmine.createSpyObj('NotificationService', ['openSucessSnackBar', 'openErrorSnackBar']);
    await TestBed.configureTestingModule({
      declarations: [WashMonitorComponent, SlidePanelComponent],
      imports: [FormsModule],
      providers: [
        { provide: EventService, useValue: { activeEvent: new BehaviorSubject<any>({ _id: 'e1', name: 'BiG 7.0' }) } },
        { provide: NotificationService, useValue: notify },
        { provide: ActivatedRoute, useValue: { queryParamMap: query } },
        { provide: Router, useValue: router },
        { provide: WashService, useValue: service }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();
    fixture = TestBed.createComponent(WashMonitorComponent);
    component = fixture.componentInstance;
  });

  const start = () => { fixture.detectChanges(); flushMicrotasks(); fixture.detectChanges(); };

  it('shows the WASH subtitle, counts states and puts problems first', fakeAsync(() => {
    start();
    expect(fixture.nativeElement.querySelector('.page-ph-sub').textContent).toContain('Water, Sanitation & Hygiene');
    expect(component.counts).toEqual(jasmine.objectContaining({ ok: 1, overdue: 1, out_of_order: 1, not_started: 1 }));
    expect(component.cards.map(c => c.f._id)).toEqual(['b', 'c', 'd', 'a']);
    expect(fixture.nativeElement.querySelectorAll('.wm-card').length).toBe(4);

    component.toggleState('overdue');
    expect(component.cards.map(c => c.f._id)).toEqual(['b']);
    component.toggleState('overdue');
    component.setKind('toilets');
    expect(component.cards.map(c => c.f._id)).toEqual(['c', 'd']);
    component.setKind('all');
    component.search = 'station a';
    component.apply();
    expect(component.cards.map(c => c.f._id)).toEqual(['a']);
    discardPeriodicTasks();
  }));

  it('logs Refilled from the card, and Back in service for an out-of-order one', fakeAsync(() => {
    start();
    const refilled = fac('b', { name: 'Water Station B', lastDoneAt: new Date().toISOString(), state: 'ok' });
    service.log.and.returnValue(Promise.resolve(refilled));
    component.mainAction(component.facilities.find(f => f._id === 'b')!);
    flushMicrotasks();
    expect(service.log).toHaveBeenCalledWith('b', 'refilled', '', null);
    expect(component.counts.overdue).toBe(0);
    expect(notify.openSucessSnackBar).toHaveBeenCalledWith(jasmine.stringMatching(/^Water Station B: Refilled at \d\d:\d\d$/));

    service.log.and.returnValue(Promise.resolve(fac('c', { kind: 'toilets', name: 'Toilet Block 1' })));
    component.mainAction(component.facilities.find(f => f._id === 'c')!);
    flushMicrotasks();
    expect(service.log).toHaveBeenCalledWith('c', 'back_in_service', '', null);
    discardPeriodicTasks();
  }));

  it('asks what is wrong before marking out of order', fakeAsync(() => {
    start();
    component.open(component.facilities.find(f => f._id === 'a')!, 'out_of_order');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.sp-title').textContent.trim()).toBe('Water Station A');
    component.saveNote();
    expect(component.noteError).toBe('Say what is wrong.');
    expect(service.log).not.toHaveBeenCalled();

    service.log.and.returnValue(Promise.resolve(fac('a', { status: 'out_of_order', statusNote: 'Tap broken' })));
    component.note = 'Tap broken';
    component.saveNote();
    flushMicrotasks();
    expect(service.log).toHaveBeenCalledWith('a', 'out_of_order', 'Tap broken', null);
    expect(component.noteFor).toBeNull();
    discardPeriodicTasks();
  }));

  it('Scan QR opens the scanned facility and sends its code with the log', fakeAsync(() => {
    list[0]._id = ID_A;
    start();
    service.scan.and.returnValue(Promise.resolve('other'));
    component.scanAny();
    flushMicrotasks();
    expect(notify.openErrorSnackBar).toHaveBeenCalledWith('That is not a WASH sticker of this event.');
    expect(component.selected).toBeNull();

    service.scan.and.returnValue(Promise.resolve({ id: ID_A, token: TOKEN }));
    component.scanAny();
    flushMicrotasks();
    fixture.detectChanges();
    expect(component.selected?._id).toBe(ID_A);
    expect(fixture.nativeElement.querySelector('.wm-scanned')).toBeTruthy();

    service.log.and.returnValue(Promise.resolve(fac(ID_A, { name: 'Water Station A', lastDoneAt: new Date().toISOString() })));
    component.mainAction(component.selected!);
    flushMicrotasks();
    expect(service.log).toHaveBeenCalledWith(ID_A, 'refilled', '', TOKEN);
    component.closePanel();
    expect(component.scanned).toBeNull();
    discardPeriodicTasks();
  }));

  it('a sticker link (/wash?f=…&k=…) opens its facility and clears the link', fakeAsync(() => {
    list[0]._id = ID_A;
    query.next(convertToParamMap({ f: ID_A, k: TOKEN }));
    start();
    expect(router.navigate).toHaveBeenCalledWith([], jasmine.objectContaining({ queryParams: {}, replaceUrl: true }));
    expect(component.selected?._id).toBe(ID_A);
    expect(component.scanned).toEqual({ id: ID_A, token: TOKEN });
    discardPeriodicTasks();
  }));

  it('an alert link (/wash?f=…, no code) opens the facility without counting as a scan', fakeAsync(() => {
    list[0]._id = ID_A;
    query.next(convertToParamMap({ f: ID_A }));
    start();
    expect(component.selected?._id).toBe(ID_A);
    expect(component.scanned).toBeNull();
    discardPeriodicTasks();
  }));

  it('with "Require QR", Refilled asks for that facility\'s sticker first; Back in service does not', fakeAsync(() => {
    requireQr = true;
    list[1]._id = ID_A;
    start();
    const b = component.facilities.find(f => f._id === ID_A)!;
    service.scan.and.returnValue(Promise.resolve(null));
    component.mainAction(b);
    flushMicrotasks();
    expect(service.log).not.toHaveBeenCalled();

    service.scan.and.returnValue(Promise.resolve({ id: 'b'.repeat(24), token: TOKEN }));
    component.mainAction(b);
    flushMicrotasks();
    expect(service.log).not.toHaveBeenCalled();
    expect(notify.openErrorSnackBar).toHaveBeenCalledWith('That is not the sticker of Water Station B.');

    service.scan.and.returnValue(Promise.resolve({ id: ID_A, token: TOKEN }));
    service.log.and.returnValue(Promise.resolve(fac(ID_A, { name: 'Water Station B', lastDoneAt: new Date().toISOString() })));
    component.mainAction(b);
    flushMicrotasks();
    expect(service.log).toHaveBeenCalledWith(ID_A, 'refilled', '', TOKEN);

    service.scan.calls.reset();
    service.log.and.returnValue(Promise.resolve(fac('c', { kind: 'toilets', name: 'Toilet Block 1' })));
    component.mainAction(component.facilities.find(f => f._id === 'c')!);
    flushMicrotasks();
    expect(service.scan).not.toHaveBeenCalled();
    expect(service.log).toHaveBeenCalledWith('c', 'back_in_service', '', null);
    discardPeriodicTasks();
  }));

  it('hides the buttons for view-only people', fakeAsync(() => {
    canLog = false;
    start();
    expect(fixture.nativeElement.querySelectorAll('.wm-acts').length).toBe(0);
    discardPeriodicTasks();
  }));
});
