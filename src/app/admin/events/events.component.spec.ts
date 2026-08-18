import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { MatDialog } from '@angular/material/dialog';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { BehaviorSubject, of } from 'rxjs';

import { EventsComponent } from './events.component';
import { EventService } from '../../core/event.service';
import { NotificationService } from '../../core/notification.service';
import { EventItem } from '../../models/event.model';

const mockEvents: EventItem[] = [
  { _id: 'evt1', name: 'BiG 6.0', description: 'Main festival', status: 'active' },
  { _id: 'evt2', name: 'BloomNight 01', description: '', status: 'draft' },
];

describe('EventsComponent', () => {
  let component: EventsComponent;
  let fixture: ComponentFixture<EventsComponent>;
  let notificationSpy: jasmine.SpyObj<NotificationService>;
  let dialogSpy: jasmine.SpyObj<MatDialog>;
  let router: Router;
  let eventsSubject: BehaviorSubject<EventItem[]>;
  let eventServiceSpy: jasmine.SpyObj<EventService> & { events: BehaviorSubject<EventItem[]> };

  beforeEach(async () => {
    notificationSpy = jasmine.createSpyObj('NotificationService', ['openSucessSnackBar', 'openErrorSnackBar']);
    dialogSpy = jasmine.createSpyObj('MatDialog', ['open']);
    eventsSubject = new BehaviorSubject<EventItem[]>(mockEvents);
    eventServiceSpy = jasmine.createSpyObj('EventService', ['loadEvents']) as any;
    eventServiceSpy.events = eventsSubject;

    await TestBed.configureTestingModule({
      declarations: [EventsComponent],
      imports: [RouterTestingModule],
      providers: [
        { provide: EventService, useValue: eventServiceSpy },
        { provide: NotificationService, useValue: notificationSpy },
        { provide: MatDialog, useValue: dialogSpy },
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();

    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(EventsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('renders the shared events list on init and refreshes it', () => {
    expect(component.events).toEqual(mockEvents);
    expect(eventServiceSpy.loadEvents).toHaveBeenCalled();
  });

  it('updates when the shared events list changes', () => {
    const updated = [...mockEvents, { _id: 'evt3', name: 'New Event', description: '', status: 'draft' as const }];
    eventsSubject.next(updated);
    expect(component.events).toEqual(updated);
  });

  it('editEvent() navigates to /admin/events/:id', () => {
    const navSpy = spyOn(router, 'navigate');
    component.editEvent(mockEvents[0]);
    expect(navSpy).toHaveBeenCalledWith(['/admin/events', 'evt1']);
  });

  it('statusLabel() title-cases the status', () => {
    expect(component.statusLabel('active')).toBe('Active');
    expect(component.statusLabel('draft')).toBe('Draft');
  });

  it('openCreateDialog() opens the dialog', () => {
    const afterClosedSpy = jasmine.createSpyObj({ afterClosed: of(null) });
    dialogSpy.open.and.returnValue(afterClosedSpy);

    component.openCreateDialog();

    expect(dialogSpy.open).toHaveBeenCalled();
  });

  it('openCreateDialog() refreshes and shows a success toast when an event was created', () => {
    const created = { _id: 'evt3', name: 'New Event', description: '', status: 'draft' };
    const afterClosedSpy = jasmine.createSpyObj({ afterClosed: of(created) });
    dialogSpy.open.and.returnValue(afterClosedSpy);
    eventServiceSpy.loadEvents.calls.reset();

    component.openCreateDialog();

    expect(notificationSpy.openSucessSnackBar).toHaveBeenCalledWith('Event created');
    expect(eventServiceSpy.loadEvents).toHaveBeenCalled();
  });

  it('openCreateDialog() does nothing further when the dialog is cancelled', () => {
    const afterClosedSpy = jasmine.createSpyObj({ afterClosed: of(null) });
    dialogSpy.open.and.returnValue(afterClosedSpy);
    eventServiceSpy.loadEvents.calls.reset();

    component.openCreateDialog();

    expect(notificationSpy.openSucessSnackBar).not.toHaveBeenCalled();
    expect(eventServiceSpy.loadEvents).not.toHaveBeenCalled();
  });
});
