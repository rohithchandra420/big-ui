import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA, SimpleChange } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { of, throwError } from 'rxjs';

import { ExternalImportComponent } from './external-import.component';
import { BoxOfficeService, ExternalImportResult } from '../../box-office.service';
import { EventService } from '../../../core/event.service';
import { NotificationService } from '../../../core/notification.service';
import { SlidePanelComponent } from '../../../shared/slide-panel/slide-panel.component';
import { AppSelectComponent } from '../../../shared/app-select/app-select.component';
import { AppOptionComponent } from '../../../shared/app-select/app-option.component';

const result = (o: Partial<ExternalImportResult> = {}): ExternalImportResult => ({
  rows: 4, bookings: 2, toCreate: 2, passes: 5, skipped: [], changedSince: [], unknownPassTypes: [], errors: [], ...o
});

describe('ExternalImportComponent', () => {
  let fixture: ComponentFixture<ExternalImportComponent>;
  let component: ExternalImportComponent;
  let boxOffice: jasmine.SpyObj<BoxOfficeService>;
  let events: { currentActiveEvent: any; createPassType: jasmine.Spy };
  let notify: jasmine.SpyObj<NotificationService>;

  const csv = (name = 'bookings.csv') => new File(['reference\n'], name, { type: 'text/csv' });
  const el = (): HTMLElement => fixture.nativeElement;

  beforeEach(async () => {
    boxOffice = jasmine.createSpyObj('BoxOfficeService', ['previewExternalImport', 'runExternalImport']);
    events = { currentActiveEvent: { _id: 'evt1', name: 'Fest' }, createPassType: jasmine.createSpy('createPassType').and.returnValue(of({})) };
    notify = jasmine.createSpyObj('NotificationService', ['openErrorSnackBar', 'openSucessSnackBar']);

    await TestBed.configureTestingModule({
      declarations: [ExternalImportComponent, SlidePanelComponent, AppSelectComponent, AppOptionComponent],
      imports: [FormsModule],
      providers: [
        { provide: BoxOfficeService, useValue: boxOffice },
        { provide: EventService, useValue: events },
        { provide: NotificationService, useValue: notify }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();

    fixture = TestBed.createComponent(ExternalImportComponent);
    component = fixture.componentInstance;
    component.open = true;
    component.ngOnChanges({ open: new SimpleChange(false, true, true) });
    fixture.detectChanges();
  });

  it('starts on the file step', () => {
    expect(component.step).toBe('pick');
    expect(el().textContent).toContain('Drop the sales system');
  });

  it('refuses a file that is not .csv / .xlsx without calling the server', () => {
    component.pick(csv('bookings.pdf'));
    expect(boxOffice.previewExternalImport).not.toHaveBeenCalled();
    expect(notify.openErrorSnackBar).toHaveBeenCalled();
  });

  it('checks a picked file with the event id and shows the counts', () => {
    boxOffice.previewExternalImport.and.returnValue(of(result({ changedSince: ['TST6-A'], skipped: ['TST6-A'] })));
    component.pick(csv());
    fixture.detectChanges();

    const form = boxOffice.previewExternalImport.calls.mostRecent().args[0] as FormData;
    expect(form.get('eventId')).toBe('evt1');
    expect((form.get('file') as File).name).toBe('bookings.csv');
    expect(component.step).toBe('preview');
    expect(el().textContent).toContain('New bookings');
    expect(el().textContent).toContain('TST6-A');
    expect(component.canImport).toBeTrue();
  });

  it('imports, shows the report and tells the page', () => {
    boxOffice.previewExternalImport.and.returnValue(of(result()));
    boxOffice.runExternalImport.and.returnValue(of(result({ created: 2 })));
    const imported = spyOn(component.imported, 'emit');
    component.pick(csv());
    component.runImport();
    fixture.detectChanges();

    expect(boxOffice.runExternalImport).toHaveBeenCalled();
    expect(component.step).toBe('done');
    expect(imported).toHaveBeenCalledWith(2);
    expect(el().textContent).toContain('Bookings created');
  });

  it('lists booking errors with their row numbers', () => {
    boxOffice.previewExternalImport.and.returnValue(of(result({ errors: [{ reference: 'TST6-BAD', rows: [5, 6], messages: ['Invalid email'] }] })));
    component.pick(csv());
    fixture.detectChanges();
    expect(el().textContent).toContain('TST6-BAD');
    expect(el().textContent).toContain('Rows 5, 6');
    expect(el().textContent).toContain('Invalid email');
  });

  it('blocks the import when pass types are missing and the person may not create them', () => {
    boxOffice.previewExternalImport.and.returnValue(of(result({
      canCreatePassTypes: false,
      unknownPassTypes: [{ externalCode: 'cabin_3', name: 'Cabin (3 guests)', category: 'stay_pass', beds: 3, rows: [2] }]
    })));
    component.pick(csv());
    fixture.detectChanges();
    expect(component.blocked).toBeTrue();
    expect(component.canImport).toBeFalse();
    expect(el().textContent).toContain('Ask an admin');
  });

  it('lets a top role create the missing pass types (pre-filled, editable), then imports', () => {
    boxOffice.previewExternalImport.and.returnValue(of(result({
      toCreate: 0, canCreatePassTypes: true,
      unknownPassTypes: [{ externalCode: 'cabin_3', name: 'Cabin (3 guests)', category: 'stay_pass', beds: 3, rows: [2] }]
    })));
    boxOffice.runExternalImport.and.returnValue(of(result({ created: 1 })));
    component.pick(csv());
    fixture.detectChanges();

    expect(component.importLabel).toBe('Create 1 pass type & import');
    component.drafts[0].name = 'Cabin for three';
    component.runImport();

    expect(events.createPassType).toHaveBeenCalledWith('evt1', { name: 'Cabin for three', category: 'stay_pass', externalCode: 'cabin_3', beds: 3 });
    expect(boxOffice.runExternalImport).toHaveBeenCalled();
    expect(component.step).toBe('done');
  });

  it('shows the fresh preview when the import finds a pass type still missing (409)', () => {
    boxOffice.previewExternalImport.and.returnValue(of(result()));
    boxOffice.runExternalImport.and.returnValue(throwError(() => ({
      status: 409, error: result({ canCreatePassTypes: false, unknownPassTypes: [{ externalCode: 'x', name: 'X', category: 'addon_pass', beds: null, rows: [3] }] })
    })));
    component.pick(csv());
    component.runImport();
    expect(component.step).toBe('preview');
    expect(component.drafts.length).toBe(1);
  });

  it('goes back to the file step when the server cannot read the file', () => {
    boxOffice.previewExternalImport.and.returnValue(throwError(() => ({ status: 400, error: { message: 'Missing column(s): kind' } })));
    component.pick(csv());
    expect(component.step).toBe('pick');
    expect(notify.openErrorSnackBar).toHaveBeenCalledWith('Missing column(s): kind');
  });

  it('keeps beds per pass a whole number from 1 to 20', () => {
    const d: any = { beds: 1 };
    component.setBeds(d, '40'); expect(d.beds).toBe(20);
    component.setBeds(d, '0'); expect(d.beds).toBe(1);
    component.setBeds(d, '2.6'); expect(d.beds).toBe(3);
  });
});
