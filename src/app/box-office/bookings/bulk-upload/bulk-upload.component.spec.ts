import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import { BehaviorSubject, of, throwError } from 'rxjs';

import { BulkUploadComponent, bedsFromName } from './bulk-upload.component';
import { AuthService } from '../../../core/auth.service';
import { BoxOfficeService } from '../../box-office.service';
import { NotificationService } from '../../../core/notification.service';
import { EventService } from '../../../core/event.service';
import { EventDetail, EventItem } from '../../../models/event.model';

const mockActiveEvent = { _id: 'evt1', name: 'Test Event', description: '', status: 'active' } as EventItem;
const mockEventDetail: EventDetail = {
  ...mockActiveEvent,
  passTypes: [{ _id: 'pt1', event: 'evt1', name: 'Festival Ticket', category: 'festival_pass' }],
  tents: []
};

describe('BulkUploadComponent', () => {
  let component: BulkUploadComponent;
  let fixture: ComponentFixture<BulkUploadComponent>;
  let boxOfficeServiceSpy: jasmine.SpyObj<BoxOfficeService>;
  let notificationSpy: jasmine.SpyObj<NotificationService>;
  let dialogRefSpy: jasmine.SpyObj<MatDialogRef<BulkUploadComponent>>;
  let userSubject: BehaviorSubject<any>;
  let activeEventSubject: BehaviorSubject<EventItem | null>;
  let eventServiceSpy: jasmine.SpyObj<EventService> & { activeEvent: BehaviorSubject<EventItem | null>, currentActiveEvent: EventItem | null };

  beforeEach(async () => {
    boxOfficeServiceSpy = jasmine.createSpyObj('BoxOfficeService', ['uploadBoxOfficeExcel']);
    notificationSpy = jasmine.createSpyObj('NotificationService', ['openSucessSnackBar', 'openErrorSnackBar']);
    dialogRefSpy = jasmine.createSpyObj('MatDialogRef', ['close']);
    activeEventSubject = new BehaviorSubject<EventItem | null>(mockActiveEvent);
    eventServiceSpy = jasmine.createSpyObj('EventService', ['getEventDetail', 'createPassType']) as any;
    userSubject = new BehaviorSubject<any>({ _id: 'u1', role: 'ADMIN' });
    eventServiceSpy.activeEvent = activeEventSubject;
    Object.defineProperty(eventServiceSpy, 'currentActiveEvent', { get: () => activeEventSubject.value });
    eventServiceSpy.getEventDetail.and.returnValue(of(mockEventDetail));

    await TestBed.configureTestingModule({
      declarations: [BulkUploadComponent],
      providers: [
        { provide: MatDialogRef, useValue: dialogRefSpy },
        { provide: BoxOfficeService, useValue: boxOfficeServiceSpy },
        { provide: NotificationService, useValue: notificationSpy },
        { provide: EventService, useValue: eventServiceSpy },
        { provide: AuthService, useValue: { user: userSubject } },
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();

    fixture = TestBed.createComponent(BulkUploadComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  // Note: the FileReader + dynamic xlsx-import parsing that builds the preview
  // (row count/order ids/item names) is intentionally not unit tested here,
  // same call as BoxOfficeQrscannerPopupComponent (Task 22) — real file/library
  // integration behavior that's awkward to exercise reliably in Karma. Both
  // entry points (file input and drop) funnel through the same private
  // handleFile(), and upload()/cancel() don't depend on that parsing, so
  // they're fully covered below.

  it('onFileInputChange rejects a non-.xlsx file and shows an error toast', () => {
    const file = new File(['data'], 'orders.csv', { type: 'text/csv' });
    const event = { target: { files: [file] } } as unknown as Event;
    component.onFileInputChange(event);
    expect(component.selectedFile).toBeNull();
    expect(notificationSpy.openErrorSnackBar).toHaveBeenCalledWith('Only .xlsx files are supported');
  });

  it('onDragOver/onDragLeave toggle the dragOver state', () => {
    const dragEvent = jasmine.createSpyObj('DragEvent', ['preventDefault']);
    component.onDragOver(dragEvent);
    expect(component.dragOver).toBeTrue();
    component.onDragLeave(dragEvent);
    expect(component.dragOver).toBeFalse();
  });

  it('onDrop accepts a dropped file through the same handling as file input', () => {
    const file = new File(['data'], 'orders.csv', { type: 'text/csv' });
    const dropEvent = {
      preventDefault: jasmine.createSpy('preventDefault'),
      dataTransfer: { files: [file] }
    } as unknown as DragEvent;

    component.onDrop(dropEvent);

    expect(component.dragOver).toBeFalse();
    expect(notificationSpy.openErrorSnackBar).toHaveBeenCalledWith('Only .xlsx files are supported');
  });

  it('selecting a new file resets previous sheet state', () => {
    component.sheetNames = ['Old1', 'Old2'];
    component.selectedSheetName = 'Old1';

    const file = new File(['data'], 'orders.xlsx');
    const event = { target: { files: [file] } } as unknown as Event;
    component.onFileInputChange(event);

    expect(component.selectedSheetName).toBeNull();
    expect(component.sheetNames).toEqual([]);
  });

  describe('sheet selection', () => {
    // The actual re-parsing (dynamic xlsx import) is out of scope here for the
    // same reason noted above — but selectedSheetName itself is set synchronously
    // before that async parse even starts, so it's directly testable.
    it('onSheetSelectChange does nothing before a workbook has been parsed', () => {
      component.onSheetSelectChange('February');
      expect(component.selectedSheetName).toBeNull();
    });

    it('onSheetSelectChange updates selectedSheetName once a workbook exists', () => {
      (component as any).workbook = { Sheets: { January: {}, February: {} } };
      component.onSheetSelectChange('February');
      expect(component.selectedSheetName).toBe('February');
    });
  });

  it('upload() does nothing without a selected file', () => {
    component.upload();
    expect(boxOfficeServiceSpy.uploadBoxOfficeExcel).not.toHaveBeenCalled();
  });

  it('upload() shows an error and does nothing without an active event', () => {
    activeEventSubject.next(null);
    component.selectedFile = new File(['data'], 'orders.xlsx');

    component.upload();

    expect(boxOfficeServiceSpy.uploadBoxOfficeExcel).not.toHaveBeenCalled();
    expect(notificationSpy.openErrorSnackBar).toHaveBeenCalledWith('No event selected');
  });

  it('upload() sends the file as FormData and closes the dialog with the ticket count on success', () => {
    component.selectedFile = new File(['data'], 'orders.xlsx');
    boxOfficeServiceSpy.uploadBoxOfficeExcel.and.returnValue(of({ message: 'Tickets created successfully', ticketCount: 2 }));

    component.upload();

    expect(boxOfficeServiceSpy.uploadBoxOfficeExcel).toHaveBeenCalled();
    const formData = boxOfficeServiceSpy.uploadBoxOfficeExcel.calls.mostRecent().args[0];
    expect(formData.get('file')).toBe(component.selectedFile);
    expect(formData.get('eventId')).toBe('evt1');
    expect(notificationSpy.openSucessSnackBar).toHaveBeenCalled();
    expect(dialogRefSpy.close).toHaveBeenCalledWith(2);
    expect(component.uploading).toBeFalse();
  });

  it('upload() includes the selected sheet name in the FormData when set', () => {
    component.selectedFile = new File(['data'], 'orders.xlsx');
    component.selectedSheetName = 'February';
    boxOfficeServiceSpy.uploadBoxOfficeExcel.and.returnValue(of({ message: 'Tickets created successfully', ticketCount: 1 }));

    component.upload();

    const formData = boxOfficeServiceSpy.uploadBoxOfficeExcel.calls.mostRecent().args[0];
    expect(formData.get('sheetName')).toBe('February');
  });

  it('upload() omits sheetName from FormData when none is selected', () => {
    component.selectedFile = new File(['data'], 'orders.xlsx');
    boxOfficeServiceSpy.uploadBoxOfficeExcel.and.returnValue(of({ message: 'Tickets created successfully', ticketCount: 1 }));

    component.upload();

    const formData = boxOfficeServiceSpy.uploadBoxOfficeExcel.calls.mostRecent().args[0];
    expect(formData.get('sheetName')).toBeNull();
  });

  it('upload() surfaces per-row validation errors instead of a toast', () => {
    component.selectedFile = new File(['data'], 'orders.xlsx');
    boxOfficeServiceSpy.uploadBoxOfficeExcel.and.returnValue(throwError(() => ({
      error: { message: 'Validation failed', errors: ['Row 2: missing item_name'] }
    })));

    component.upload();

    expect(component.validationErrors).toEqual(['Row 2: missing item_name']);
    expect(notificationSpy.openErrorSnackBar).not.toHaveBeenCalled();
    expect(dialogRefSpy.close).not.toHaveBeenCalled();
  });

  it('upload() surfaces duplicate order_id conflicts instead of a toast', () => {
    component.selectedFile = new File(['data'], 'orders.xlsx');
    boxOfficeServiceSpy.uploadBoxOfficeExcel.and.returnValue(throwError(() => ({
      error: { message: 'Some Order IDs already exist', existingOrderIds: [5001] }
    })));

    component.upload();

    expect(component.duplicateOrderIds).toEqual([5001]);
    expect(notificationSpy.openErrorSnackBar).not.toHaveBeenCalled();
  });

  it('upload() shows a generic error toast for anything else', () => {
    component.selectedFile = new File(['data'], 'orders.xlsx');
    boxOfficeServiceSpy.uploadBoxOfficeExcel.and.returnValue(throwError(() => ({ error: { message: 'Failed to process the file' } })));

    component.upload();

    expect(notificationSpy.openErrorSnackBar).toHaveBeenCalledWith('Failed to process the file');
  });

  describe('unknown pass name detection', () => {
    it('loads the active event\'s pass types on init', () => {
      expect(eventServiceSpy.getEventDetail).toHaveBeenCalledWith('evt1');
    });

    it('flags item names from the file that are not existing pass types', () => {
      component.preview = { rowCount: 2, orderIds: [1], itemNames: ['Festival Ticket', 'Shared Tent'] };
      (component as any).recomputeUnknownPassNames();

      expect(component.unknownPassNames).toEqual(['Shared Tent']);
    });

    it('defaults category to tent when the name contains "Tent", festival otherwise', () => {
      component.preview = { rowCount: 2, orderIds: [1], itemNames: ['Shared Tent', 'Car/Caravan Pass'] };
      (component as any).recomputeUnknownPassNames();

      expect(component.newPassTypeCategories['Shared Tent']).toBe('stay_pass');
      expect(component.newPassTypeCategories['Car/Caravan Pass']).toBe('festival_pass');
    });

    it('upload() creates each unknown pass type before uploading, using the chosen categories', () => {
      component.selectedFile = new File(['data'], 'orders.xlsx');
      component.preview = { rowCount: 1, orderIds: [1], itemNames: ['Shared Tent'] };
      (component as any).recomputeUnknownPassNames();
      component.newPassTypeCategories['Shared Tent'] = 'stay_pass';
      eventServiceSpy.createPassType.and.returnValue(of({ _id: 'pt2', event: 'evt1', name: 'Shared Tent', category: 'stay_pass' }));
      boxOfficeServiceSpy.uploadBoxOfficeExcel.and.returnValue(of({ message: 'Tickets created successfully', ticketCount: 1 }));

      component.upload();

      expect(eventServiceSpy.createPassType).toHaveBeenCalledWith('evt1', { name: 'Shared Tent', category: 'stay_pass', beds: 1 });
      expect(boxOfficeServiceSpy.uploadBoxOfficeExcel).toHaveBeenCalled();
      expect(dialogRefSpy.close).toHaveBeenCalledWith(1);
    });

    it('upload() stops and shows an error if creating a pass type fails, without attempting the upload', () => {
      component.selectedFile = new File(['data'], 'orders.xlsx');
      component.preview = { rowCount: 1, orderIds: [1], itemNames: ['Shared Tent'] };
      (component as any).recomputeUnknownPassNames();
      eventServiceSpy.createPassType.and.returnValue(throwError(() => ({ error: { message: 'A pass type with this name already exists for this event' } })));

      component.upload();

      expect(notificationSpy.openErrorSnackBar).toHaveBeenCalledWith('A pass type with this name already exists for this event');
      expect(boxOfficeServiceSpy.uploadBoxOfficeExcel).not.toHaveBeenCalled();
      expect(component.uploading).toBeFalse();
    });
  });

  describe('beds per pass for a new tent pass type (bed model)', () => {
    const setUnknown = (names: string[]) => {
      component.selectedFile = new File(['data'], 'orders.xlsx');
      component.preview = { rowCount: names.length, orderIds: [1], itemNames: names };
      (component as any).recomputeUnknownPassNames();
    };

    it('bedsFromName() reads the beds from the name, else 1, always 1–20', () => {
      expect(bedsFromName('Deluxe Room (3 guests)')).toBe(3);
      expect(bedsFromName('Dorm 2 beds')).toBe(2);
      expect(bedsFromName('4 Person Tent')).toBe(4);
      expect(bedsFromName('Solo Tent')).toBe(1);
      expect(bedsFromName('Room (40 guests)')).toBe(20);
      expect(bedsFromName('Room (0 guests)')).toBe(1);
    });

    it('defaults each new pass type to the beds in its name', () => {
      setUnknown(['Twin Tent (2 guests)', 'Shared Tent']);
      expect(component.newPassTypeBeds['Twin Tent (2 guests)']).toBe(2);
      expect(component.newPassTypeBeds['Shared Tent']).toBe(1);
    });

    it('sends the chosen beds for a tent pass type, and none for festival', () => {
      setUnknown(['Twin Tent (2 guests)', 'Day Pass']);
      component.setBeds('Twin Tent (2 guests)', 3);
      eventServiceSpy.createPassType.and.returnValue(of({ _id: 'px', event: 'evt1', name: 'x', category: 'stay_pass' }));
      boxOfficeServiceSpy.uploadBoxOfficeExcel.and.returnValue(of({ message: 'ok', ticketCount: 1 }));

      component.upload();

      expect(eventServiceSpy.createPassType).toHaveBeenCalledWith('evt1', { name: 'Twin Tent (2 guests)', category: 'stay_pass', beds: 3 });
      expect(eventServiceSpy.createPassType).toHaveBeenCalledWith('evt1', { name: 'Day Pass', category: 'festival_pass' });
    });

    it('setBeds() keeps the value a whole number 1–20', () => {
      setUnknown(['Shared Tent']);
      component.setBeds('Shared Tent', 50);
      expect(component.newPassTypeBeds['Shared Tent']).toBe(20);
      component.setBeds('Shared Tent', '');
      expect(component.newPassTypeBeds['Shared Tent']).toBe(1);
      component.setBeds('Shared Tent', 2.6);
      expect(component.newPassTypeBeds['Shared Tent']).toBe(3);
    });

    it('shows the Beds per pass field only for a tent category', () => {
      setUnknown(['Shared Tent', 'Day Pass']);
      fixture.detectChanges();
      const labels = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.bu-unknown-field label')).map(l => l.textContent!.trim());
      expect(labels.filter(l => l === 'Beds per pass').length).toBe(1);
    });
  });

  describe('a user who is not a top role', () => {
    beforeEach(() => userSubject.next({ _id: 'u2', role: 'TL' }));

    it('is told to ask an admin, and Upload is blocked', () => {
      component.selectedFile = new File(['data'], 'orders.xlsx');
      component.preview = { rowCount: 1, orderIds: [1], itemNames: ['Shared Tent'] };
      (component as any).recomputeUnknownPassNames();
      fixture.detectChanges();

      expect(component.canCreatePassTypes).toBeFalse();
      expect(component.blockedByUnknownPassNames).toBeTrue();
      expect((fixture.nativeElement as HTMLElement).textContent).toContain('Ask an admin to add these in Admin › Events first');
      expect((fixture.nativeElement as HTMLElement).querySelector('.bu-unknown-field')).toBeNull();

      component.upload();
      expect(eventServiceSpy.createPassType).not.toHaveBeenCalled();
      expect(boxOfficeServiceSpy.uploadBoxOfficeExcel).not.toHaveBeenCalled();
      expect(notificationSpy.openErrorSnackBar).toHaveBeenCalledWith('Ask an admin to add the new pass types in Admin › Events first');
    });

    it('can still upload when every pass name already exists', () => {
      component.selectedFile = new File(['data'], 'orders.xlsx');
      component.preview = { rowCount: 1, orderIds: [1], itemNames: ['Festival Ticket'] };
      (component as any).recomputeUnknownPassNames();
      boxOfficeServiceSpy.uploadBoxOfficeExcel.and.returnValue(of({ message: 'ok', ticketCount: 1 }));

      component.upload();
      expect(boxOfficeServiceSpy.uploadBoxOfficeExcel).toHaveBeenCalled();
    });
  });

  it('cancel() closes the dialog with null', () => {
    component.cancel();
    expect(dialogRefSpy.close).toHaveBeenCalledWith(null);
  });
});
