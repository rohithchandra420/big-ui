import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { of, throwError } from 'rxjs';

import { AllocateTentComponent } from './allocate-tent.component';
import { AccomodationService } from '../../../accomodation/accomodation.service';
import { NotificationService } from '../../../core/notification.service';
import { EventService } from '../../../core/event.service';
import { Shopcart } from '../../../models/ticket.model';
import { Tent } from '../../../models/tent.model';
import { EventItem } from '../../../models/event.model';
import { AppSelectComponent } from '../../../shared/app-select/app-select.component';
import { AppOptionComponent } from '../../../shared/app-select/app-option.component';

// Bug fix (2026-08-20, follow-up): a Tent Pass now genuinely starts blank
// (see boxOffice.js), so this fixture carries real identity fields — as if
// this item still had older, pre-fix data — specifically so the "auto-search
// on init" tests below stay meaningful. The blank-item, no-auto-search case
// gets its own dedicated fixture further down.
const mockShopItem: Shopcart = {
  _id: 't1', item_name: 'Shared Tent', passType: 'pt1', item_quantity: 1, order_id: 1,
  admissionId: null as any, isAdmitted: false, isActive: true,
  name: 'Existing Attendee', phone_no: '9000000001', email: 'existing@example.com', gender: null
} as any;

const mockActiveEvent = { _id: 'event1', name: 'Test Event' } as EventItem;

describe('AllocateTentComponent', () => {
  let component: AllocateTentComponent;
  let fixture: ComponentFixture<AllocateTentComponent>;
  let accomodationServiceSpy: jasmine.SpyObj<AccomodationService>;
  let notificationSpy: jasmine.SpyObj<NotificationService>;
  let eventServiceStub: { currentActiveEvent: EventItem | null };

  beforeEach(async () => {
    accomodationServiceSpy = jasmine.createSpyObj('AccomodationService', [
      'suggestFestivalPassMatches', 'getAvailableTents', 'allocateTentSlot'
    ]);
    accomodationServiceSpy.suggestFestivalPassMatches.and.returnValue(of([]));
    accomodationServiceSpy.getAvailableTents.and.returnValue(of([]));
    notificationSpy = jasmine.createSpyObj('NotificationService', ['openSucessSnackBar', 'openErrorSnackBar']);
    eventServiceStub = { currentActiveEvent: mockActiveEvent };

    await TestBed.configureTestingModule({
      declarations: [AllocateTentComponent, AppSelectComponent, AppOptionComponent],
      imports: [FormsModule],
      providers: [
        { provide: AccomodationService, useValue: accomodationServiceSpy },
        { provide: NotificationService, useValue: notificationSpy },
        { provide: EventService, useValue: eventServiceStub },
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();

    fixture = TestBed.createComponent(AllocateTentComponent);
    component = fixture.componentInstance;
    component.shopItem = mockShopItem;
    fixture.detectChanges();
  });

  it('loads suggestions and vacant tents using the shop item\'s own details plus the active event id', () => {
    expect(accomodationServiceSpy.suggestFestivalPassMatches).toHaveBeenCalledWith('event1', {
      name: 'Existing Attendee', phone: '9000000001', email: 'existing@example.com'
    });
    expect(accomodationServiceSpy.getAvailableTents).toHaveBeenCalledWith('pt1');
  });

  // Bug fix (2026-08-20, follow-up): a blank Tent Pass (the new normal after
  // the boxOffice.js fix) used to auto-search using its own blank/placeholder
  // details, which exact-matched every OTHER blank Festival Pass event-wide —
  // "other attendees" showing up as suggestions. Auto-search is now skipped
  // entirely when there's nothing meaningful to search on.
  describe('auto-search guard for a blank shop item', () => {
    const blankItem = { ...mockShopItem, name: '', phone_no: '', email: '' } as Shopcart;

    it('does not auto-search on init for a genuinely blank item', () => {
      accomodationServiceSpy.suggestFestivalPassMatches.calls.reset();
      (component as any).shopItem = blankItem;

      component.ngOnInit();

      expect(accomodationServiceSpy.suggestFestivalPassMatches).not.toHaveBeenCalled();
      expect(component.festivalPassSuggestions).toEqual([]);
    });

    it('does not auto-search when phone_no is still the old "+91" filler value', () => {
      accomodationServiceSpy.suggestFestivalPassMatches.calls.reset();
      (component as any).shopItem = { ...blankItem, phone_no: '+91' };

      component.ngOnInit();

      expect(accomodationServiceSpy.suggestFestivalPassMatches).not.toHaveBeenCalled();
    });

    it('still auto-searches for a blank item once staff types a manual search term', () => {
      (component as any).shopItem = blankItem;
      component.manualSearchTerm = 'Kavya';

      component.searchManually();

      expect(accomodationServiceSpy.suggestFestivalPassMatches).toHaveBeenCalledWith('event1', {
        name: 'Kavya', phone: 'Kavya', email: 'Kavya'
      });
    });

    // Same-day follow-up: falls back to the parent Ticket's buyer details
    // instead of just showing nothing, since a blank Tent Pass still belongs
    // to a real booking and the buyer is very often the right match.
    it('falls back to the parent ticket\'s buyer details when the item itself is blank', () => {
      accomodationServiceSpy.suggestFestivalPassMatches.calls.reset();
      component.shopItem = blankItem;
      component.ticket = { first_name: 'Ravi', last_name: 'Kumar', phone_no: '9123456780', email: 'ravi@example.com' } as any;

      component.ngOnInit();

      expect(accomodationServiceSpy.suggestFestivalPassMatches).toHaveBeenCalledWith('event1', {
        name: 'Ravi Kumar', phone: '9123456780', email: 'ravi@example.com'
      });
    });

    it('does not fall back to the ticket when it also has nothing searchable (defensive)', () => {
      accomodationServiceSpy.suggestFestivalPassMatches.calls.reset();
      component.shopItem = blankItem;
      component.ticket = { first_name: '', last_name: '', phone_no: '', email: '' } as any;

      component.ngOnInit();

      expect(accomodationServiceSpy.suggestFestivalPassMatches).not.toHaveBeenCalled();
    });

    it('prefers the shop item\'s own details over the ticket\'s when the item already has some', () => {
      accomodationServiceSpy.suggestFestivalPassMatches.calls.reset();
      component.shopItem = mockShopItem; // has its own name/phone/email
      component.ticket = { first_name: 'Someone', last_name: 'Else', phone_no: '9999999999', email: 'else@example.com' } as any;

      component.ngOnInit();

      expect(accomodationServiceSpy.suggestFestivalPassMatches).toHaveBeenCalledWith('event1', {
        name: 'Existing Attendee', phone: '9000000001', email: 'existing@example.com'
      });
    });
  });

  it('does not call getAvailableTents when the shop item has no passType (legacy/unmigrated data)', () => {
    accomodationServiceSpy.getAvailableTents.calls.reset();
    (component as any).shopItem = { ...mockShopItem, passType: undefined };

    (component as any).loadVacantTents();

    expect(accomodationServiceSpy.getAvailableTents).not.toHaveBeenCalled();
    expect(component.vacantTents).toEqual([]);
  });

  it('searchManually() re-queries suggestions using the typed term for all three fields', () => {
    component.manualSearchTerm = 'Kavya';
    component.searchManually();
    expect(accomodationServiceSpy.suggestFestivalPassMatches).toHaveBeenCalledWith('event1', {
      name: 'Kavya', phone: 'Kavya', email: 'Kavya'
    });
  });

  it('searchManually() does nothing for an empty term', () => {
    accomodationServiceSpy.suggestFestivalPassMatches.calls.reset();
    component.manualSearchTerm = '   ';
    component.searchManually();
    expect(accomodationServiceSpy.suggestFestivalPassMatches).not.toHaveBeenCalled();
  });

  it('does not call suggestFestivalPassMatches when there is no active event', () => {
    eventServiceStub.currentActiveEvent = null;
    accomodationServiceSpy.suggestFestivalPassMatches.calls.reset();

    component.ngOnInit();

    expect(accomodationServiceSpy.suggestFestivalPassMatches).not.toHaveBeenCalled();
    expect(component.festivalPassSuggestions).toEqual([]);
  });

  it('searchManually() shows an error toast when there is no active event', () => {
    accomodationServiceSpy.suggestFestivalPassMatches.calls.reset();
    eventServiceStub.currentActiveEvent = null;
    component.manualSearchTerm = 'Kavya';

    component.searchManually();

    expect(accomodationServiceSpy.suggestFestivalPassMatches).not.toHaveBeenCalled();
    expect(notificationSpy.openErrorSnackBar).toHaveBeenCalledWith('No event selected');
  });

  it('selectFestivalPass() toggles selection and pre-fills gender from the candidate', () => {
    const candidate = { _id: 'f1', gender: 'Female' } as Shopcart;
    component.festivalPassSuggestions = [candidate];

    component.selectFestivalPass(candidate);
    expect(component.selectedFestivalPassId).toBe('f1');
    expect(component.localGender).toBe('Female');

    component.selectFestivalPass(candidate);
    expect(component.selectedFestivalPassId).toBeNull();
    expect(component.localGender).toBe('');
  });

  it('vacancyOf() counts null slots', () => {
    const tent = { occupants: [null, 's1', null] } as any as Tent;
    expect(component.vacancyOf(tent)).toBe(2);
  });

  describe('needsGender', () => {
    it('is true when the selected Festival Pass has no gender on file', () => {
      const candidate = { _id: 'f1', gender: null } as any as Shopcart;
      component.festivalPassSuggestions = [candidate];
      component.selectFestivalPass(candidate);
      expect(component.needsGender).toBeTrue();
    });

    it('is false when the selected Festival Pass already has a gender', () => {
      const candidate = { _id: 'f1', gender: 'Male' } as Shopcart;
      component.festivalPassSuggestions = [candidate];
      component.selectFestivalPass(candidate);
      expect(component.needsGender).toBeFalse();
    });

    it('is false when nothing is selected', () => {
      expect(component.needsGender).toBeFalse();
    });
  });

  it('allocate() does nothing without a selected Festival Pass', () => {
    component.allocate();
    expect(accomodationServiceSpy.allocateTentSlot).not.toHaveBeenCalled();
  });

  it('allocate() does nothing when the Festival Pass needs a gender that hasn\'t been chosen', () => {
    const candidate = { _id: 'f1', gender: null } as any as Shopcart;
    component.festivalPassSuggestions = [candidate];
    component.selectFestivalPass(candidate);
    component.localGender = '';

    component.allocate();

    expect(accomodationServiceSpy.allocateTentSlot).not.toHaveBeenCalled();
  });

  it('allocate() omits gender from the payload when the Festival Pass already has one', () => {
    const candidate = { _id: 'f1', gender: 'Male' } as Shopcart;
    component.festivalPassSuggestions = [candidate];
    component.selectFestivalPass(candidate);
    component.selectedTentId = 'tent1';
    accomodationServiceSpy.allocateTentSlot.and.returnValue(of({ tent: {} as Tent, tentPassItem: mockShopItem, festivalPassItem: null }));
    const allocatedSpy = spyOn(component.allocated, 'emit');

    component.allocate();

    expect(accomodationServiceSpy.allocateTentSlot).toHaveBeenCalledWith({
      tentPassId: 't1', festivalPassId: 'f1', tentId: 'tent1', gender: undefined, overrideGenderMismatch: false
    });
    expect(notificationSpy.openSucessSnackBar).toHaveBeenCalled();
    expect(allocatedSpy).toHaveBeenCalled();
    expect(component.allocating).toBeFalse();
  });

  it('allocate() includes the chosen gender in the payload when the Festival Pass has none', () => {
    const candidate = { _id: 'f1', gender: null } as any as Shopcart;
    component.festivalPassSuggestions = [candidate];
    component.selectFestivalPass(candidate);
    component.localGender = 'Prefer not to say';
    accomodationServiceSpy.allocateTentSlot.and.returnValue(of({ tent: {} as Tent, tentPassItem: mockShopItem, festivalPassItem: null }));

    component.allocate();

    expect(accomodationServiceSpy.allocateTentSlot).toHaveBeenCalledWith(jasmine.objectContaining({
      tentPassId: 't1', festivalPassId: 'f1', gender: 'Prefer not to say'
    }));
  });

  it('allocate() surfaces a GENDER_MISMATCH error as a pending confirmation instead of a toast', () => {
    const candidate = { _id: 'f1', gender: 'Male' } as Shopcart;
    component.festivalPassSuggestions = [candidate];
    component.selectFestivalPass(candidate);
    accomodationServiceSpy.allocateTentSlot.and.returnValue(throwError(() => ({
      error: { code: 'GENDER_MISMATCH', existingGenders: ['Female'] }
    })));

    component.allocate();

    expect(component.genderMismatchPending).toBeTrue();
    expect(component.genderMismatchExisting).toEqual(['Female']);
    expect(notificationSpy.openErrorSnackBar).not.toHaveBeenCalled();
  });

  it('allocate() shows an error toast for non-gender-mismatch failures', () => {
    const candidate = { _id: 'f1', gender: 'Male' } as Shopcart;
    component.festivalPassSuggestions = [candidate];
    component.selectFestivalPass(candidate);
    accomodationServiceSpy.allocateTentSlot.and.returnValue(throwError(() => ({ error: { message: 'No vacant tents of this type' } })));

    component.allocate();

    expect(notificationSpy.openErrorSnackBar).toHaveBeenCalledWith('No vacant tents of this type');
    expect(component.genderMismatchPending).toBeFalse();
  });

  it('confirmGenderMismatch() retries allocate with the override flag set', () => {
    const candidate = { _id: 'f1', gender: 'Male' } as Shopcart;
    component.festivalPassSuggestions = [candidate];
    component.selectFestivalPass(candidate);
    accomodationServiceSpy.allocateTentSlot.and.returnValue(of({ tent: {} as Tent, tentPassItem: mockShopItem, festivalPassItem: null }));

    component.confirmGenderMismatch();

    expect(accomodationServiceSpy.allocateTentSlot).toHaveBeenCalledWith(jasmine.objectContaining({ overrideGenderMismatch: true }));
  });

  it('cancelGenderMismatch() clears the pending flag', () => {
    component.genderMismatchPending = true;
    component.cancelGenderMismatch();
    expect(component.genderMismatchPending).toBeFalse();
  });

  it('cancel() emits cancelled', () => {
    const cancelledSpy = spyOn(component.cancelled, 'emit');
    component.cancel();
    expect(cancelledSpy).toHaveBeenCalled();
  });
});
