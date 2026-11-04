import { ComponentFixture, TestBed, fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { BoxOfficeStatusComponent } from './box-office-status.component';
import { BoxOfficeService, BoxOfficeStatus } from '../box-office.service';
import { EventService } from '../../core/event.service';
import { NotificationService } from '../../core/notification.service';

const status = (extra: Partial<BoxOfficeStatus> = {}): BoxOfficeStatus => ({
  pin: { _id: 'p1', name: 'Box Office' }, open: false, note: '', at: null, by: null, canChange: true, ...extra
});

describe('BoxOfficeStatusComponent', () => {
  let fixture: ComponentFixture<BoxOfficeStatusComponent>;
  let component: BoxOfficeStatusComponent;
  let service: jasmine.SpyObj<BoxOfficeService>;
  let notify: jasmine.SpyObj<NotificationService>;

  beforeEach(async () => {
    service = jasmine.createSpyObj('BoxOfficeService', ['getStatus', 'setStatus']);
    notify = jasmine.createSpyObj('NotificationService', ['openSucessSnackBar', 'openErrorSnackBar']);
    await TestBed.configureTestingModule({
      declarations: [BoxOfficeStatusComponent],
      imports: [FormsModule],
      providers: [
        { provide: BoxOfficeService, useValue: service },
        { provide: EventService, useValue: { activeEvent: new BehaviorSubject<any>({ _id: 'e1', name: 'BiG 7.0' }) } },
        { provide: NotificationService, useValue: notify }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();
    fixture = TestBed.createComponent(BoxOfficeStatusComponent);
    component = fixture.componentInstance;
  });

  const start = () => { fixture.detectChanges(); flushMicrotasks(); fixture.detectChanges(); };
  const el = () => fixture.nativeElement as HTMLElement;

  it('the Box Office TL opens it with a note; it says it shows on the Venue Map', fakeAsync(() => {
    service.getStatus.and.returnValue(of(status()));
    service.setStatus.and.returnValue(of(status({ open: true, note: 'Queue ~10 min', by: 'Tara', at: new Date().toISOString() })));
    start();
    expect(service.getStatus).toHaveBeenCalledWith('e1');
    expect(el().textContent).toContain('Box Office closed');
    component.note = 'Queue ~10 min ';
    component.set(true);
    flushMicrotasks(); fixture.detectChanges();
    expect(service.setStatus).toHaveBeenCalledWith('e1', true, 'Queue ~10 min');
    expect(el().textContent).toContain('Box Office open · Queue ~10 min');
    expect(el().querySelector('.bos')!.classList).toContain('open');
  }));

  it('others only see it; with no pin they see nothing', fakeAsync(() => {
    service.getStatus.and.returnValue(of(status({ canChange: false, open: true })));
    start();
    expect(el().textContent).toContain('Box Office open');
    expect(el().querySelector('.bos-edit')).toBeNull();

    service.getStatus.and.returnValue(of(status({ pin: null, canChange: false })));
    component.load(); flushMicrotasks(); fixture.detectChanges();
    expect(el().querySelector('.bos')).toBeNull();
  }));

  it('no pin yet: those who can change it are pointed to the Venue Map', fakeAsync(() => {
    service.getStatus.and.returnValue(of(status({ pin: null })));
    start();
    expect(el().textContent).toContain('No Box Office pin on the Venue Map yet');
  }));

  it('shows the server message when refused', fakeAsync(() => {
    service.getStatus.and.returnValue(of(status()));
    service.setStatus.and.returnValue(throwError(() => ({ error: { message: 'Only the Box Office Team Lead, Directors, Admins and Developers can change this' } })));
    start();
    component.set(true);
    flushMicrotasks();
    expect(notify.openErrorSnackBar).toHaveBeenCalledWith('Only the Box Office Team Lead, Directors, Admins and Developers can change this');
  }));
});
