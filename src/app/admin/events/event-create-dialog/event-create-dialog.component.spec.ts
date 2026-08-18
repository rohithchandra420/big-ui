import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { MatDialogRef } from '@angular/material/dialog';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { of, throwError } from 'rxjs';
import { EventCreateDialogComponent } from './event-create-dialog.component';
import { EventService } from '../../../core/event.service';
import { NotificationService } from '../../../core/notification.service';

describe('EventCreateDialogComponent', () => {
  let component: EventCreateDialogComponent;
  let fixture: ComponentFixture<EventCreateDialogComponent>;
  let eventServiceSpy: jasmine.SpyObj<EventService>;
  let notificationSpy: jasmine.SpyObj<NotificationService>;
  let dialogRefSpy: jasmine.SpyObj<MatDialogRef<EventCreateDialogComponent>>;

  beforeEach(async () => {
    eventServiceSpy = jasmine.createSpyObj('EventService', ['createEvent']);
    notificationSpy = jasmine.createSpyObj('NotificationService', ['openSucessSnackBar', 'openErrorSnackBar']);
    dialogRefSpy = jasmine.createSpyObj('MatDialogRef', ['close']);

    await TestBed.configureTestingModule({
      declarations: [EventCreateDialogComponent],
      imports: [ReactiveFormsModule],
      providers: [
        { provide: EventService, useValue: eventServiceSpy },
        { provide: NotificationService, useValue: notificationSpy },
        { provide: MatDialogRef, useValue: dialogRefSpy }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();

    fixture = TestBed.createComponent(EventCreateDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('form is invalid when name is empty', () => {
    component.form.get('name')!.setValue('');
    expect(component.form.invalid).toBeTrue();
  });

  it('form is valid when name is provided', () => {
    component.form.get('name')!.setValue('BloomNight 01');
    expect(component.form.valid).toBeTrue();
  });

  it('cancel() closes dialog with null without calling API', () => {
    component.cancel();
    expect(dialogRefSpy.close).toHaveBeenCalledWith(null);
    expect(eventServiceSpy.createEvent).not.toHaveBeenCalled();
  });

  it('save() does nothing if form is invalid', () => {
    component.form.get('name')!.setValue('');
    component.save();
    expect(eventServiceSpy.createEvent).not.toHaveBeenCalled();
  });

  it('save() calls createEvent and closes dialog with result on success', () => {
    const created = { _id: 'evt1', name: 'BloomNight 01', description: '', status: 'draft' };
    eventServiceSpy.createEvent.and.returnValue(of(created as any));
    component.form.get('name')!.setValue('BloomNight 01');

    component.save();

    expect(eventServiceSpy.createEvent).toHaveBeenCalledWith(jasmine.objectContaining({ name: 'BloomNight 01' }));
    expect(dialogRefSpy.close).toHaveBeenCalledWith(created);
  });

  it('save() shows error notification and does not close on API failure', () => {
    eventServiceSpy.createEvent.and.returnValue(
      throwError(() => ({ error: { message: 'Duplicate name' } }))
    );
    component.form.get('name')!.setValue('BloomNight 01');

    component.save();

    expect(notificationSpy.openErrorSnackBar).toHaveBeenCalledWith('Duplicate name');
    expect(dialogRefSpy.close).not.toHaveBeenCalled();
  });

  it('save() trims whitespace from name before sending', () => {
    eventServiceSpy.createEvent.and.returnValue(of({ _id: 'evt1', name: 'BloomNight 01', description: '', status: 'draft' } as any));
    component.form.get('name')!.setValue('  BloomNight 01  ');

    component.save();

    expect(eventServiceSpy.createEvent).toHaveBeenCalledWith(jasmine.objectContaining({ name: 'BloomNight 01' }));
  });

  it('save() omits startDate/endDate when left blank', () => {
    eventServiceSpy.createEvent.and.returnValue(of({ _id: 'evt1', name: 'BloomNight 01', description: '', status: 'draft' } as any));
    component.form.get('name')!.setValue('BloomNight 01');

    component.save();

    const payload = eventServiceSpy.createEvent.calls.mostRecent().args[0];
    expect(payload.startDate).toBeUndefined();
    expect(payload.endDate).toBeUndefined();
  });
});
