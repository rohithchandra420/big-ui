import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { of, throwError } from 'rxjs';

import { AllocateTentComponent } from './allocate-tent.component';
import { AccomodationService } from '../../../accomodation/accomodation.service';
import { NotificationService } from '../../../core/notification.service';
import { Shopcart } from '../../../models/ticket.model';
import { Tent } from '../../../models/tent.model';

const mockShopItem: Shopcart = {
  _id: 't1', item_name: 'Shared Tent', item_quantity: 1, order_id: 1,
  admissionId: null as any, isAdmitted: false, isActive: true,
  name: '', phone_no: '', email: '', gender: null
} as any;

describe('AllocateTentComponent', () => {
  let component: AllocateTentComponent;
  let fixture: ComponentFixture<AllocateTentComponent>;
  let accomodationServiceSpy: jasmine.SpyObj<AccomodationService>;
  let notificationSpy: jasmine.SpyObj<NotificationService>;

  beforeEach(async () => {
    accomodationServiceSpy = jasmine.createSpyObj('AccomodationService', [
      'suggestFestivalPassMatches', 'getAvailableTents', 'allocateTentSlot'
    ]);
    accomodationServiceSpy.suggestFestivalPassMatches.and.returnValue(of([]));
    accomodationServiceSpy.getAvailableTents.and.returnValue(of([]));
    notificationSpy = jasmine.createSpyObj('NotificationService', ['openSucessSnackBar', 'openErrorSnackBar']);

    await TestBed.configureTestingModule({
      declarations: [AllocateTentComponent],
      imports: [FormsModule],
      providers: [
        { provide: AccomodationService, useValue: accomodationServiceSpy },
        { provide: NotificationService, useValue: notificationSpy },
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();

    fixture = TestBed.createComponent(AllocateTentComponent);
    component = fixture.componentInstance;
    component.shopItem = mockShopItem;
    fixture.detectChanges();
  });

  it('loads suggestions and vacant tents using the shop item\'s own details', () => {
    expect(accomodationServiceSpy.suggestFestivalPassMatches).toHaveBeenCalledWith({
      name: '', phone: '', email: ''
    });
    expect(accomodationServiceSpy.getAvailableTents).toHaveBeenCalledWith('Shared Tent');
  });

  it('searchManually() re-queries suggestions using the typed term for all three fields', () => {
    component.manualSearchTerm = 'Kavya';
    component.searchManually();
    expect(accomodationServiceSpy.suggestFestivalPassMatches).toHaveBeenCalledWith({
      name: 'Kavya', phone: 'Kavya', email: 'Kavya'
    });
  });

  it('searchManually() does nothing for an empty term', () => {
    accomodationServiceSpy.suggestFestivalPassMatches.calls.reset();
    component.manualSearchTerm = '   ';
    component.searchManually();
    expect(accomodationServiceSpy.suggestFestivalPassMatches).not.toHaveBeenCalled();
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
