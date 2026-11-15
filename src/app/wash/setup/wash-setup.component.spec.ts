import { ComponentFixture, TestBed, fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { BehaviorSubject, of } from 'rxjs';
import { WashSetupComponent, stickerSheetHtml } from './wash-setup.component';
import { SlidePanelComponent } from '../../shared/slide-panel/slide-panel.component';
import { EventService } from '../../core/event.service';
import { NotificationService } from '../../core/notification.service';
import { ConfirmationService } from '../../shared/confirm-dialog/confirmation.service';
import { WashService } from '../wash.service';
import { WashFacility } from '../wash.model';

const fac = (extra: Partial<WashFacility> = {}): WashFacility => ({
  _id: 'f1', event: 'e1', place: 'pin', location: 'l1', area: null, name: 'Water Station A', lat: 20, lng: 79, kind: 'water',
  intervalHours: 3, capacityLitres: 500, status: 'ok', statusNote: '', lastDoneAt: null, lastDoneBy: null,
  dueAt: null, state: 'not_started', logCount: 4, ...extra
});

describe('WashSetupComponent', () => {
  let fixture: ComponentFixture<WashSetupComponent>;
  let component: WashSetupComponent;
  let service: jasmine.SpyObj<WashService>;
  let confirm: jasmine.SpyObj<ConfirmationService>;

  beforeEach(async () => {
    service = jasmine.createSpyObj('WashService', ['facilities', 'pins', 'add', 'update', 'remove', 'setRequireQr', 'stickers']);
    service.facilities.and.returnValue(Promise.resolve({ facilities: [fac()], canLog: true, canManage: true, requireQr: false, now: '' }));
    service.pins.and.returnValue(Promise.resolve([
      { _id: 'p1', name: 'Toilet Block 1', type: 'toilets', place: 'pin' },
      { _id: 'a1', name: 'Washroom North', type: 'toilets', place: 'area' }
    ]));
    service.add.and.returnValue(Promise.resolve(fac()));
    service.update.and.returnValue(Promise.resolve(fac()));
    service.remove.and.returnValue(Promise.resolve({ ok: true, logs: 4 }));
    confirm = jasmine.createSpyObj('ConfirmationService', ['confirm']);
    await TestBed.configureTestingModule({
      declarations: [WashSetupComponent, SlidePanelComponent],
      imports: [FormsModule],
      providers: [
        { provide: EventService, useValue: { activeEvent: new BehaviorSubject<any>({ _id: 'e1', name: 'BiG 7.0' }) } },
        { provide: NotificationService, useValue: jasmine.createSpyObj('NotificationService', ['openSucessSnackBar', 'openErrorSnackBar']) },
        { provide: ConfirmationService, useValue: confirm },
        { provide: WashService, useValue: service }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();
    fixture = TestBed.createComponent(WashSetupComponent);
    component = fixture.componentInstance;
  });

  const start = () => { fixture.detectChanges(); flushMicrotasks(); fixture.detectChanges(); };

  it('lists facilities and adds one from an existing pin (no capacity for toilets)', fakeAsync(() => {
    start();
    expect(fixture.nativeElement.querySelectorAll('.ws-row').length).toBe(1);
    component.startAdd();
    expect(component.source).toBe('pin');
    component.save();
    expect(component.formError).toBe('Pick a place from the map.');
    expect(component.pinLabel(component.pins[1])).toBe('Washroom North · Washroom area');
    component.form.pin = 'p1';
    component.form.capacityLitres = 200;
    expect(component.formKind).toBe('toilets');
    component.save();
    flushMicrotasks();
    expect(service.add).toHaveBeenCalledWith({ event: 'e1', location: 'p1', intervalHours: 3, capacityLitres: null });
    expect(component.mode).toBe('closed');

    // A Washroom area is sent as `area`.
    component.startAdd();
    component.form.pin = 'a1';
    component.form.intervalHours = 2;
    component.save();
    flushMicrotasks();
    expect(service.add).toHaveBeenCalledWith({ event: 'e1', area: 'a1', intervalHours: 2 });
  }));

  it('adds one with a new pin from pasted coordinates', fakeAsync(() => {
    start();
    component.startAdd();
    component.source = 'new';
    component.form.name = 'Water Station B';
    component.form.coords = 'nowhere';
    component.save();
    expect(component.formError).toContain('coordinates');
    component.form.coords = '20.981, 79.352';
    component.form.intervalHours = 25;
    component.save();
    expect(component.formError).toContain('1 to 24');
    component.form.intervalHours = 2;
    component.save();
    flushMicrotasks();
    expect(service.add).toHaveBeenCalledWith(jasmine.objectContaining({ name: 'Water Station B', type: 'water', lat: 20.981, lng: 79.352, intervalHours: 2 }));
  }));

  it('flips "Require a QR scan" and puts it back when the save fails', fakeAsync(() => {
    start();
    expect(fixture.nativeElement.querySelector('.ws-switch').getAttribute('aria-checked')).toBe('false');
    service.setRequireQr.and.returnValue(Promise.resolve({ requireQr: true }));
    component.toggleRequireQr();
    flushMicrotasks();
    expect(service.setRequireQr).toHaveBeenCalledWith('e1', true);
    expect(component.requireQr).toBeTrue();

    service.setRequireQr.and.returnValue(Promise.reject({ error: { message: 'No' } }));
    component.toggleRequireQr();
    flushMicrotasks();
    expect(component.requireQr).toBeTrue();
  }));

  it('builds the sticker sheet with one escaped sticker per facility', () => {
    const html = stickerSheetHtml([
      { _id: 'f1', name: 'Water <A>', kind: 'water', qr: 'data:image/png;base64,AAA' },
      { _id: 'f2', name: 'Toilet Block 1', kind: 'toilets', qr: 'data:image/png;base64,BBB' }
    ], 'BiG 7.0');
    expect(html).toContain('Water &lt;A&gt;');
    expect(html).not.toContain('<A>');
    expect(html).toContain('Scan to log a refill');
    expect(html).toContain('Scan to log a cleaning');
    expect(html).toContain('2 stickers');
    expect((html.match(/class="st"/g) || []).length).toBe(2);
  });

  it('edits the interval and removes with the log count in the question', fakeAsync(() => {
    start();
    component.edit(component.facilities[0]);
    component.form.intervalHours = 4;
    component.save();
    flushMicrotasks();
    expect(service.update).toHaveBeenCalledWith('f1', { intervalHours: 4, capacityLitres: 500 });

    confirm.confirm.and.returnValue(of(true));
    component.remove(component.facilities[0]);
    flushMicrotasks();
    expect(confirm.confirm.calls.mostRecent().args[0].message).toContain('its 4 log entries');
    expect(service.remove).toHaveBeenCalledWith('f1');
  }));
});
