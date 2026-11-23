import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DateTimeComponent } from '../../../shared/date-time/date-time.component';
import { SlidePanelComponent } from '../../../shared/slide-panel/slide-panel.component';
import { AppSelectComponent } from '../../../shared/app-select/app-select.component';
import { AppOptionComponent } from '../../../shared/app-select/app-option.component';
import { ActivatedRoute, Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { BehaviorSubject, of, throwError } from 'rxjs';

import { EventDetailComponent } from './event-detail.component';
import { EventService } from '../../../core/event.service';
import { NotificationService } from '../../../core/notification.service';
import { EventDetail } from '../../../models/event.model';
import { ConfirmationService } from '../../../shared/confirm-dialog/confirmation.service';
import { LocationService } from '../../../venue-map/location.service';
import { AdminService } from '../../admin.service';

const mockDetail: EventDetail = {
  _id: 'evt1', name: 'BiG 6.0', description: 'Main festival', status: 'draft',
  startDate: '2026-01-16T00:00:00.000Z', endDate: '2026-01-18T00:00:00.000Z',
  passTypes: [
    { _id: 'pt1', event: 'evt1', name: 'Festival Ticket', category: 'festival' },
    { _id: 'pt2', event: 'evt1', name: 'Solo Tent', category: 'tent' },
  ],
  tents: []
};

describe('EventDetailComponent', () => {
  let component: EventDetailComponent;
  let fixture: ComponentFixture<EventDetailComponent>;
  let eventServiceSpy: jasmine.SpyObj<EventService>;
  let notificationSpy: jasmine.SpyObj<NotificationService>;
  let confirmationServiceSpy: jasmine.SpyObj<ConfirmationService>;
  let router: Router;
  let locationSpy: jasmine.SpyObj<LocationService>;

  beforeEach(async () => {
    eventServiceSpy = jasmine.createSpyObj('EventService', [
      'getEventDetail', 'updateEvent', 'deleteEvent', 'loadEvents',
      'createPassType', 'updatePassType', 'deletePassType', 'setActiveEvent'
    ]);
    locationSpy = jasmine.createSpyObj('LocationService', ['listAreas']);
    locationSpy.listAreas.and.resolveTo({ areas: [], canDraw: true, canDrawBoundary: true });
    notificationSpy = jasmine.createSpyObj('NotificationService', ['openSucessSnackBar', 'openErrorSnackBar']);
    confirmationServiceSpy = jasmine.createSpyObj('ConfirmationService', ['confirm']);
    eventServiceSpy.getEventDetail.and.returnValue(of(mockDetail));

    await TestBed.configureTestingModule({
      declarations: [DateTimeComponent, SlidePanelComponent, AppSelectComponent, AppOptionComponent, EventDetailComponent],
      imports: [RouterTestingModule, ReactiveFormsModule],
      providers: [
        { provide: EventService, useValue: eventServiceSpy },
        { provide: NotificationService, useValue: notificationSpy },
        { provide: ConfirmationService, useValue: confirmationServiceSpy },
        { provide: LocationService, useValue: locationSpy },
        { provide: AdminService, useValue: { getEventStaff: () => of({ userIds: [], count: 4 }) } },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => 'evt1' } } } },
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();

    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(EventDetailComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('loads event detail on init', () => {
    expect(eventServiceSpy.getEventDetail).toHaveBeenCalledWith('evt1');
    expect(component.detail).toEqual(mockDetail);
  });

  it('shows an error notification when load fails', () => {
    eventServiceSpy.getEventDetail.and.returnValue(throwError(() => new Error('fail')));
    component.loadDetail('evt1');
    expect(notificationSpy.openErrorSnackBar).toHaveBeenCalledWith('Error loading event');
  });

  describe('venue boundary', () => {
    it('says when the event has no boundary yet', async () => {
      await fixture.whenStable(); fixture.detectChanges();
      expect(locationSpy.listAreas).toHaveBeenCalledWith(mockDetail._id);
      expect(component.hasBoundary).toBe(false);
      expect(fixture.nativeElement.textContent).toContain('Venue boundary: not drawn yet');
      expect(fixture.nativeElement.textContent).toContain('Draw on Venue Map');
    });

    it('says when it is drawn', async () => {
      locationSpy.listAreas.and.resolveTo({ areas: [{ kind: 'boundary' } as any], canDraw: true, canDrawBoundary: true });
      component.loadDetail('evt1');
      await fixture.whenStable(); fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Venue boundary: drawn');
    });

    it('opens the Venue Map on this event, ready for the boundary', () => {
      const navSpy = spyOn(router, 'navigate');
      component.openVenueMap();
      expect(eventServiceSpy.setActiveEvent).toHaveBeenCalledWith(mockDetail);
      expect(navSpy).toHaveBeenCalledWith(['/venue-map'], { queryParams: { draw: 'boundary' } });
    });
  });

  describe('Sales system switch', () => {
    beforeEach(() => {
      (eventServiceSpy as any).events = new BehaviorSubject([{ _id: 'evt9', name: 'Old Fest', status: 'active', description: '', salesSync: true }]);
      component.detail = { ...mockDetail, salesSync: false };
      eventServiceSpy.updateEvent.and.returnValue(of({} as any));
    });

    it('asks first, naming the event that loses it, then switches it on', () => {
      confirmationServiceSpy.confirm.and.returnValue(of(true));
      component.toggleSalesSync();
      expect(confirmationServiceSpy.confirm.calls.mostRecent().args[0].message).toContain('instead of "Old Fest"');
      expect(eventServiceSpy.updateEvent).toHaveBeenCalledWith('evt1', { salesSync: true });
      expect(component.detail!.salesSync).toBe(true);
      expect(eventServiceSpy.loadEvents).toHaveBeenCalled();
    });

    it('does nothing when the question is cancelled', () => {
      confirmationServiceSpy.confirm.and.returnValue(of(false));
      component.toggleSalesSync();
      expect(eventServiceSpy.updateEvent).not.toHaveBeenCalled();
    });

    it('switching off asks as a destructive action', () => {
      component.detail = { ...mockDetail, salesSync: true };
      confirmationServiceSpy.confirm.and.returnValue(of(true));
      component.toggleSalesSync();
      expect(confirmationServiceSpy.confirm.calls.mostRecent().args[0].danger).toBeTrue();
      expect(eventServiceSpy.updateEvent).toHaveBeenCalledWith('evt1', { salesSync: false });
    });

    it('shows the server message when it fails', () => {
      confirmationServiceSpy.confirm.and.returnValue(of(true));
      eventServiceSpy.updateEvent.and.returnValue(throwError(() => ({ error: { message: 'Nope' } })));
      component.toggleSalesSync();
      expect(notificationSpy.openErrorSnackBar).toHaveBeenCalledWith('Nope');
      expect(component.detail!.salesSync).toBe(false);
    });
  });

  it('goBack() navigates to /admin/events', () => {
    const navSpy = spyOn(router, 'navigate');
    component.goBack();
    expect(navSpy).toHaveBeenCalledWith(['/admin/events']);
  });

  describe('edit mode', () => {
    it('enterEditMode() populates the form from current detail', () => {
      component.enterEditMode();
      expect(component.editMode).toBeTrue();
      expect(component.editForm.value.name).toBe('BiG 6.0');
      expect(component.editForm.value.status).toBe('draft');
    });

    it('cancelEdit() exits edit mode', () => {
      component.enterEditMode();
      component.cancelEdit();
      expect(component.editMode).toBeFalse();
    });

    it('save() does nothing if the form is invalid', () => {
      component.enterEditMode();
      component.editForm.get('name')!.setValue('');
      component.save();
      expect(eventServiceSpy.updateEvent).not.toHaveBeenCalled();
    });

    it('save() sends the Early Check-In wording (EC2), trimmed', () => {
      component.enterEditMode();
      component.editForm.patchValue({ checkinSubject: ' Fill in {event} ', checkinIntro: 'Please' });
      eventServiceSpy.updateEvent.and.returnValue(of(mockDetail as any));
      component.save();
      expect(eventServiceSpy.updateEvent).toHaveBeenCalledWith('evt1', jasmine.objectContaining({
        checkinEmail: { subject: 'Fill in {event}', intro: 'Please' }
      }));
    });

    it('save() updates the event, reloads detail, and refreshes the shared event list', () => {
      component.enterEditMode();
      component.editForm.patchValue({ name: 'BiG 6.0', status: 'active' });
      eventServiceSpy.updateEvent.and.returnValue(of(mockDetail as any));

      component.save();

      expect(eventServiceSpy.updateEvent).toHaveBeenCalledWith('evt1', jasmine.objectContaining({ name: 'BiG 6.0', status: 'active' }));
      expect(notificationSpy.openSucessSnackBar).toHaveBeenCalledWith('Event updated');
      expect(eventServiceSpy.loadEvents).toHaveBeenCalled();
      expect(component.editMode).toBeFalse();
    });

    it('B-052: an active event set to Archived asks first; Cancel saves nothing', () => {
      component.detail = { ...mockDetail, status: 'active' } as any;
      component.enterEditMode();
      component.editForm.patchValue({ status: 'archived' });
      confirmationServiceSpy.confirm.and.returnValue(of(false));
      component.save();
      expect(confirmationServiceSpy.confirm).toHaveBeenCalled();
      expect(confirmationServiceSpy.confirm.calls.mostRecent().args[0].danger).toBeTrue();
      expect(eventServiceSpy.updateEvent).not.toHaveBeenCalled();

      confirmationServiceSpy.confirm.and.returnValue(of(true));
      eventServiceSpy.updateEvent.and.returnValue(of(mockDetail as any));
      component.save();
      expect(eventServiceSpy.updateEvent).toHaveBeenCalledWith('evt1', jasmine.objectContaining({ status: 'archived' }));
    });

    it('B-052: no question when the event is not active', () => {
      component.enterEditMode();
      component.editForm.patchValue({ status: 'archived' });
      eventServiceSpy.updateEvent.and.returnValue(of(mockDetail as any));
      component.save();
      expect(confirmationServiceSpy.confirm).not.toHaveBeenCalled();
      expect(eventServiceSpy.updateEvent).toHaveBeenCalled();
    });

    it('save() shows an error notification on failure', () => {
      component.enterEditMode();
      eventServiceSpy.updateEvent.and.returnValue(throwError(() => ({ error: { message: 'Bad status' } })));

      component.save();

      expect(notificationSpy.openErrorSnackBar).toHaveBeenCalledWith('Bad status');
    });

    // Email epic — per-event Ticket Email wording
    it('enterEditMode() fills the ticket email wording (empty when using the default)', () => {
      component.enterEditMode();
      expect(component.editForm.value.emailSubject).toBe('');
      expect(component.editForm.value.emailIntro).toBe('');

      component.detail = { ...mockDetail, ticketEmail: { subject: 'Your {event} tickets', intro: 'Welcome!' } };
      component.enterEditMode();
      expect(component.editForm.value.emailSubject).toBe('Your {event} tickets');
      expect(component.hasCustomEmailWording).toBeTrue();
    });

    it('save() sends the trimmed ticket email wording', () => {
      component.enterEditMode();
      component.editForm.patchValue({ emailSubject: '  Your {event} tickets  ', emailIntro: ' Welcome! ' });
      eventServiceSpy.updateEvent.and.returnValue(of(mockDetail as any));
      component.save();
      expect(eventServiceSpy.updateEvent).toHaveBeenCalledWith('evt1', jasmine.objectContaining({
        ticketEmail: { subject: 'Your {event} tickets', intro: 'Welcome!' }
      }));
    });

    it('shows the default wording based on the event name', () => {
      component.enterEditMode();
      expect(component.defaultEmailSubject).toBe('BiG 6.0 Tickets - Order #{order_id}');
      expect(component.defaultEmailIntro).toContain('Here are your tickets to BiG 6.0!');
    });

    it('rejects an over-long subject', () => {
      component.enterEditMode();
      component.editForm.patchValue({ emailSubject: 'x'.repeat(201) });
      expect(component.editForm.invalid).toBeTrue();
    });
  });

  describe('deleteEvent()', () => {
    it('does nothing when the confirm dialog is declined', () => {
      confirmationServiceSpy.confirm.and.returnValue(of(false));
      component.deleteEvent();
      expect(eventServiceSpy.deleteEvent).not.toHaveBeenCalled();
    });

    it('asks via the generic ConfirmationService, styled as a destructive action', () => {
      confirmationServiceSpy.confirm.and.returnValue(of(false));
      component.deleteEvent();
      expect(confirmationServiceSpy.confirm).toHaveBeenCalledWith({
        title: 'Delete event',
        message: 'Delete "BiG 6.0"? This cannot be undone.',
        confirmText: 'Delete',
        danger: true,
      });
    });

    it('deletes the event, refreshes the list, and navigates back when confirmed', () => {
      confirmationServiceSpy.confirm.and.returnValue(of(true));
      const navSpy = spyOn(router, 'navigate');
      eventServiceSpy.deleteEvent.and.returnValue(of({ message: 'Event deleted successfully' }));

      component.deleteEvent();

      expect(eventServiceSpy.deleteEvent).toHaveBeenCalledWith('evt1');
      expect(notificationSpy.openSucessSnackBar).toHaveBeenCalledWith('Event deleted');
      expect(eventServiceSpy.loadEvents).toHaveBeenCalled();
      expect(navSpy).toHaveBeenCalledWith(['/admin/events']);
    });

    it('shows the block message when the event has real bookings', () => {
      confirmationServiceSpy.confirm.and.returnValue(of(true));
      eventServiceSpy.deleteEvent.and.returnValue(throwError(() => ({
        error: { message: 'This event has 3 booking(s) and cannot be deleted.', count: 3 }
      })));

      component.deleteEvent();

      expect(notificationSpy.openErrorSnackBar).toHaveBeenCalledWith('This event has 3 booking(s) and cannot be deleted.');
    });
  });

  describe('pass types', () => {
    it('startAddPassType() resets the form and shows it', () => {
      component.startAddPassType();
      expect(component.addingPassType).toBeTrue();
      expect(component.passTypeForm.value.category).toBe('festival');
    });

    it('cancelAddPassType() hides the form', () => {
      component.startAddPassType();
      component.cancelAddPassType();
      expect(component.addingPassType).toBeFalse();
    });

    it('savePassType() does nothing if the form is invalid', () => {
      component.startAddPassType();
      component.passTypeForm.get('name')!.setValue('');
      component.savePassType();
      expect(eventServiceSpy.createPassType).not.toHaveBeenCalled();
    });

    it('savePassType() creates the pass type and reloads detail', () => {
      component.startAddPassType();
      component.passTypeForm.setValue({ name: 'Day Pass', category: 'festival', code: '', beds: 1 , externalCode: ''});
      eventServiceSpy.createPassType.and.returnValue(of({ _id: 'pt3', event: 'evt1', name: 'Day Pass', category: 'festival' }));

      component.savePassType();

      expect(eventServiceSpy.createPassType).toHaveBeenCalledWith('evt1', { name: 'Day Pass', category: 'festival', code: undefined });
      expect(notificationSpy.openSucessSnackBar).toHaveBeenCalledWith('Pass type added');
      expect(component.addingPassType).toBeFalse();
    });

    it('savePassType() trims and forwards a code for a tent pass type', () => {
      component.startAddPassType();
      component.passTypeForm.setValue({ name: 'Solo Tent', category: 'tent', code: ' so ', beds: 1 , externalCode: ''});
      eventServiceSpy.createPassType.and.returnValue(of({ _id: 'pt3', event: 'evt1', name: 'Solo Tent', category: 'tent', code: 'SO' }));

      component.savePassType();

      expect(eventServiceSpy.createPassType).toHaveBeenCalledWith('evt1', { name: 'Solo Tent', category: 'tent', code: 'so', beds: 1 });
    });

    it('savePassType() forwards a trimmed sales system code for any category', () => {
      component.startAddPassType();
      component.passTypeForm.setValue({ name: 'Day Pass', category: 'festival', code: '', beds: 1, externalCode: ' pass_day ' });
      eventServiceSpy.createPassType.and.returnValue(of({ _id: 'pt3', event: 'evt1', name: 'Day Pass', category: 'festival', externalCode: 'pass_day' }));

      component.savePassType();

      expect(eventServiceSpy.createPassType).toHaveBeenCalledWith('evt1', jasmine.objectContaining({ externalCode: 'pass_day' }));
    });

    it('the sales system code may not contain spaces', () => {
      component.startAddPassType();
      component.passTypeForm.patchValue({ name: 'Day Pass', externalCode: 'pass day' });
      expect(component.passTypeForm.invalid).toBeTrue();
    });

    it('the panel shows the Sales system code field for every category', () => {
      component.startAddPassType();
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('#pt-ext')).toBeTruthy();
    });

    it('savePassType() shows an error notification on failure (e.g. duplicate name)', () => {
      component.startAddPassType();
      component.passTypeForm.setValue({ name: 'Festival Ticket', category: 'festival', code: '', beds: 1 , externalCode: ''});
      eventServiceSpy.createPassType.and.returnValue(throwError(() => ({
        error: { message: 'A pass type with this name already exists for this event' }
      })));

      component.savePassType();

      expect(notificationSpy.openErrorSnackBar).toHaveBeenCalledWith('A pass type with this name already exists for this event');
    });

    it('startEditPassType() populates the edit form from the given pass type', () => {
      component.startEditPassType(mockDetail.passTypes[1]);
      expect(component.editingPassTypeId).toBe('pt2');
      expect(component.editPassTypeForm.value).toEqual({ name: 'Solo Tent', category: 'tent', code: '', beds: 1, externalCode: '' });
    });

    it('startEditPassType() carries over an existing code', () => {
      component.startEditPassType({ _id: 'pt4', event: 'evt1', name: 'Shared Tent', category: 'tent', code: 'SH' });
      expect(component.editPassTypeForm.value.code).toBe('SH');
    });

    it('cancelEditPassType() clears the editing state', () => {
      component.startEditPassType(mockDetail.passTypes[1]);
      component.cancelEditPassType();
      expect(component.editingPassTypeId).toBeNull();
    });

    it('saveEditPassType() updates the pass type and reloads detail', () => {
      component.startEditPassType(mockDetail.passTypes[1]);
      component.editPassTypeForm.setValue({ name: 'Solo Tent (Renamed)', category: 'tent', code: 'so', beds: 1 , externalCode: ''});
      eventServiceSpy.updatePassType.and.returnValue(of({ _id: 'pt2', event: 'evt1', name: 'Solo Tent (Renamed)', category: 'tent', code: 'SO' }));

      component.saveEditPassType(mockDetail.passTypes[1]);

      expect(eventServiceSpy.updatePassType).toHaveBeenCalledWith('evt1', 'pt2', { name: 'Solo Tent (Renamed)', category: 'tent', code: 'so', externalCode: '', beds: 1 });
      expect(notificationSpy.openSucessSnackBar).toHaveBeenCalledWith('Pass type updated');
      expect(component.editingPassTypeId).toBeNull();
    });

    describe('slide panel', () => {
      const panelText = () => (fixture.nativeElement as HTMLElement).querySelector('app-slide-panel')?.textContent || '';

      it('"+ Add" opens the panel in add mode with labelled fields', () => {
        component.startAddPassType();
        fixture.detectChanges();
        expect(component.passTypePanelOpen).toBeTrue();
        expect(component.passTypePanelTitle).toBe('Add pass type');
        expect(component.passTypePanelForm).toBe(component.passTypeForm);
        const labels = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.pt-panel-form label')).map(l => l.textContent!.trim());
        expect(labels).toEqual(['Name *', 'Category *', 'Sales system code']);
      });

      it('shows Code and Beds per pass only for a tent pass type', () => {
        component.startAddPassType();
        component.passTypeForm.patchValue({ category: 'tent' });
        fixture.detectChanges();
        const labels = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.pt-panel-form label')).map(l => l.textContent!.trim());
        expect(labels).toEqual(['Name *', 'Category *', 'Sales system code', 'Code', 'Beds per pass']);
      });

      it('Edit opens the panel filled in, and closing it clears both modes', () => {
        component.startEditPassType({ ...mockDetail.passTypes[1], code: 'SO', beds: 3 });
        fixture.detectChanges();
        expect(component.passTypePanelTitle).toBe('Edit pass type');
        expect(component.passTypePanelForm).toBe(component.editPassTypeForm);
        expect(panelText()).toContain('Save');
        expect((fixture.nativeElement.querySelector('#pt-beds') as HTMLInputElement).value).toBe('3');
        component.closePassTypePanel();
        expect(component.passTypePanelOpen).toBeFalse();
      });

      it('savePassTypePanel() saves an edit and closes the panel', () => {
        const pt = mockDetail.passTypes[1];
        component.startEditPassType(pt);
        eventServiceSpy.updatePassType.and.returnValue(of({ ...pt }));
        component.savePassTypePanel();
        expect(eventServiceSpy.updatePassType).toHaveBeenCalledWith('evt1', 'pt2', jasmine.objectContaining({ name: 'Solo Tent' }));
        expect(component.passTypePanelOpen).toBeFalse();
      });

      it('savePassTypePanel() adds in add mode and closes the panel', () => {
        component.startAddPassType();
        component.passTypeForm.patchValue({ name: 'Day Pass' });
        eventServiceSpy.createPassType.and.returnValue(of({ _id: 'pt3', event: 'evt1', name: 'Day Pass', category: 'festival' }));
        component.savePassTypePanel();
        expect(eventServiceSpy.createPassType).toHaveBeenCalled();
        expect(component.passTypePanelOpen).toBeFalse();
      });

      it('an edit error keeps the panel open', () => {
        component.startEditPassType(mockDetail.passTypes[1]);
        eventServiceSpy.updatePassType.and.returnValue(throwError(() => ({ error: { message: 'Name taken' } })));
        component.savePassTypePanel();
        expect(notificationSpy.openErrorSnackBar).toHaveBeenCalledWith('Name taken');
        expect(component.passTypePanelOpen).toBeTrue();
        expect(component.savingPassType).toBeFalse();
      });
    });

    it('deletePassType() does nothing when the confirm dialog is declined', () => {
      confirmationServiceSpy.confirm.and.returnValue(of(false));
      component.deletePassType(mockDetail.passTypes[0]);
      expect(eventServiceSpy.deletePassType).not.toHaveBeenCalled();
    });

    it('deletePassType() asks via the generic ConfirmationService, styled as a destructive action', () => {
      confirmationServiceSpy.confirm.and.returnValue(of(false));
      component.deletePassType(mockDetail.passTypes[0]);
      expect(confirmationServiceSpy.confirm).toHaveBeenCalledWith({
        title: 'Delete pass type',
        message: 'Delete pass type "Festival Ticket"?',
        confirmText: 'Delete',
        danger: true,
      });
    });

    it('deletePassType() deletes and reloads detail when confirmed', () => {
      confirmationServiceSpy.confirm.and.returnValue(of(true));
      eventServiceSpy.deletePassType.and.returnValue(of({ message: 'Pass type deleted successfully' }));

      component.deletePassType(mockDetail.passTypes[0]);

      expect(eventServiceSpy.deletePassType).toHaveBeenCalledWith('evt1', 'pt1');
      expect(notificationSpy.openSucessSnackBar).toHaveBeenCalledWith('Pass type deleted');
    });

    it('deletePassType() shows the block message when the pass type has real bookings', () => {
      confirmationServiceSpy.confirm.and.returnValue(of(true));
      eventServiceSpy.deletePassType.and.returnValue(throwError(() => ({
        error: { message: 'This pass type has 2 booking(s) using it and cannot be deleted.', count: 2 }
      })));

      component.deletePassType(mockDetail.passTypes[0]);

      expect(notificationSpy.openErrorSnackBar).toHaveBeenCalledWith('This pass type has 2 booking(s) using it and cannot be deleted.');
    });
  });
});
