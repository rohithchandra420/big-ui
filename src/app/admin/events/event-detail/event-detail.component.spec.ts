import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { of, throwError } from 'rxjs';

import { EventDetailComponent } from './event-detail.component';
import { EventService } from '../../../core/event.service';
import { NotificationService } from '../../../core/notification.service';
import { EventDetail } from '../../../models/event.model';

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
  let router: Router;

  beforeEach(async () => {
    eventServiceSpy = jasmine.createSpyObj('EventService', [
      'getEventDetail', 'updateEvent', 'deleteEvent', 'loadEvents',
      'createPassType', 'updatePassType', 'deletePassType'
    ]);
    notificationSpy = jasmine.createSpyObj('NotificationService', ['openSucessSnackBar', 'openErrorSnackBar']);
    eventServiceSpy.getEventDetail.and.returnValue(of(mockDetail));

    await TestBed.configureTestingModule({
      declarations: [EventDetailComponent],
      imports: [RouterTestingModule, ReactiveFormsModule],
      providers: [
        { provide: EventService, useValue: eventServiceSpy },
        { provide: NotificationService, useValue: notificationSpy },
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

    it('save() shows an error notification on failure', () => {
      component.enterEditMode();
      eventServiceSpy.updateEvent.and.returnValue(throwError(() => ({ error: { message: 'Bad status' } })));

      component.save();

      expect(notificationSpy.openErrorSnackBar).toHaveBeenCalledWith('Bad status');
    });
  });

  describe('deleteEvent()', () => {
    it('does nothing when the confirm dialog is declined', () => {
      spyOn(window, 'confirm').and.returnValue(false);
      component.deleteEvent();
      expect(eventServiceSpy.deleteEvent).not.toHaveBeenCalled();
    });

    it('deletes the event, refreshes the list, and navigates back when confirmed', () => {
      spyOn(window, 'confirm').and.returnValue(true);
      const navSpy = spyOn(router, 'navigate');
      eventServiceSpy.deleteEvent.and.returnValue(of({ message: 'Event deleted successfully' }));

      component.deleteEvent();

      expect(eventServiceSpy.deleteEvent).toHaveBeenCalledWith('evt1');
      expect(notificationSpy.openSucessSnackBar).toHaveBeenCalledWith('Event deleted');
      expect(eventServiceSpy.loadEvents).toHaveBeenCalled();
      expect(navSpy).toHaveBeenCalledWith(['/admin/events']);
    });

    it('shows the block message when the event has real bookings', () => {
      spyOn(window, 'confirm').and.returnValue(true);
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
      component.passTypeForm.setValue({ name: 'Day Pass', category: 'festival' });
      eventServiceSpy.createPassType.and.returnValue(of({ _id: 'pt3', event: 'evt1', name: 'Day Pass', category: 'festival' }));

      component.savePassType();

      expect(eventServiceSpy.createPassType).toHaveBeenCalledWith('evt1', { name: 'Day Pass', category: 'festival' });
      expect(notificationSpy.openSucessSnackBar).toHaveBeenCalledWith('Pass type added');
      expect(component.addingPassType).toBeFalse();
    });

    it('savePassType() shows an error notification on failure (e.g. duplicate name)', () => {
      component.startAddPassType();
      component.passTypeForm.setValue({ name: 'Festival Ticket', category: 'festival' });
      eventServiceSpy.createPassType.and.returnValue(throwError(() => ({
        error: { message: 'A pass type with this name already exists for this event' }
      })));

      component.savePassType();

      expect(notificationSpy.openErrorSnackBar).toHaveBeenCalledWith('A pass type with this name already exists for this event');
    });

    it('startEditPassType() populates the edit form from the given pass type', () => {
      component.startEditPassType(mockDetail.passTypes[1]);
      expect(component.editingPassTypeId).toBe('pt2');
      expect(component.editPassTypeForm.value).toEqual({ name: 'Solo Tent', category: 'tent' });
    });

    it('cancelEditPassType() clears the editing state', () => {
      component.startEditPassType(mockDetail.passTypes[1]);
      component.cancelEditPassType();
      expect(component.editingPassTypeId).toBeNull();
    });

    it('saveEditPassType() updates the pass type and reloads detail', () => {
      component.startEditPassType(mockDetail.passTypes[1]);
      component.editPassTypeForm.setValue({ name: 'Solo Tent (Renamed)', category: 'tent' });
      eventServiceSpy.updatePassType.and.returnValue(of({ _id: 'pt2', event: 'evt1', name: 'Solo Tent (Renamed)', category: 'tent' }));

      component.saveEditPassType(mockDetail.passTypes[1]);

      expect(eventServiceSpy.updatePassType).toHaveBeenCalledWith('evt1', 'pt2', { name: 'Solo Tent (Renamed)', category: 'tent' });
      expect(notificationSpy.openSucessSnackBar).toHaveBeenCalledWith('Pass type updated');
      expect(component.editingPassTypeId).toBeNull();
    });

    it('deletePassType() does nothing when the confirm dialog is declined', () => {
      spyOn(window, 'confirm').and.returnValue(false);
      component.deletePassType(mockDetail.passTypes[0]);
      expect(eventServiceSpy.deletePassType).not.toHaveBeenCalled();
    });

    it('deletePassType() deletes and reloads detail when confirmed', () => {
      spyOn(window, 'confirm').and.returnValue(true);
      eventServiceSpy.deletePassType.and.returnValue(of({ message: 'Pass type deleted successfully' }));

      component.deletePassType(mockDetail.passTypes[0]);

      expect(eventServiceSpy.deletePassType).toHaveBeenCalledWith('evt1', 'pt1');
      expect(notificationSpy.openSucessSnackBar).toHaveBeenCalledWith('Pass type deleted');
    });

    it('deletePassType() shows the block message when the pass type has real bookings', () => {
      spyOn(window, 'confirm').and.returnValue(true);
      eventServiceSpy.deletePassType.and.returnValue(throwError(() => ({
        error: { message: 'This pass type has 2 booking(s) using it and cannot be deleted.', count: 2 }
      })));

      component.deletePassType(mockDetail.passTypes[0]);

      expect(notificationSpy.openErrorSnackBar).toHaveBeenCalledWith('This pass type has 2 booking(s) using it and cannot be deleted.');
    });
  });
});
