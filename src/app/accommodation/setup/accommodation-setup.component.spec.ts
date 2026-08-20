import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { BehaviorSubject, of, throwError } from 'rxjs';

import { AccommodationSetupComponent, suggestPassTypeCode, summarizeTentTypes } from './accommodation-setup.component';
import { AccomodationService } from '../../accomodation/accomodation.service';
import { EventService } from '../../core/event.service';
import { NotificationService } from '../../core/notification.service';
import { EventItem, EventDetail, PassType } from '../../models/event.model';
import { Tent } from '../../models/tent.model';

describe('suggestPassTypeCode()', () => {
  it('takes the first two letters of the first word for a multi-word name', () => {
    expect(suggestPassTypeCode('Solo Tent')).toBe('SO');
  });

  it('handles a single-word name by taking its first two letters', () => {
    expect(suggestPassTypeCode('Glamping')).toBe('GL');
  });

  it('ignores parenthetical text, still using the first real word', () => {
    expect(suggestPassTypeCode('PYOT (Pitch Your Own Tent)')).toBe('PY');
  });

  it('returns an empty string for an empty name', () => {
    expect(suggestPassTypeCode('')).toBe('');
  });
});

describe('summarizeTentTypes()', () => {
  const soloType: PassType = { _id: 'pt-solo', event: 'event1', name: 'Solo Tent', category: 'tent', code: 'SO' };
  const sharedType: PassType = { _id: 'pt-shared', event: 'event1', name: 'Shared Tent', category: 'tent', code: 'SH' };

  const tent = (overrides: Partial<Tent> & { passTypeId: string }): Tent => ({
    _id: 'x', tent_no: 'X1', capcity: 2, occupants: [null, null],
    passType: overrides.passTypeId, ...overrides,
  } as any);

  it('returns a zeroed row for a pass type with no units yet', () => {
    const result = summarizeTentTypes([], [soloType]);
    expect(result).toEqual([{
      passTypeId: 'pt-solo', name: 'Solo Tent', code: 'SO',
      totalUnits: 0, totalCapacity: 0, occupiedSlots: 0, vacantSlots: 0,
      whollyVacantUnits: 0, fullUnits: 0,
      partiallyFilledMaleUnits: 0, partiallyFilledFemaleUnits: 0, partiallyFilledMixedUnits: 0,
      fullMaleUnits: 0, fullFemaleUnits: 0, fullMixedUnits: 0,
    }]);
  });

  it('counts wholly-vacant and full units correctly, including the full unit\'s gender bucket', () => {
    const tents = [
      tent({ passTypeId: 'pt-solo', capcity: 2, occupants: [null, null] }),           // wholly vacant
      tent({ passTypeId: 'pt-solo', capcity: 2, occupants: [{ gender: 'Male' } as any, null] }), // partial, male
      tent({ passTypeId: 'pt-solo', capcity: 2, occupants: [{ gender: 'Male' } as any, { gender: 'Male' } as any] }), // full, male
    ];
    const [result] = summarizeTentTypes(tents, [soloType]);
    expect(result.totalUnits).toBe(3);
    expect(result.whollyVacantUnits).toBe(1);
    expect(result.fullUnits).toBe(1);
    expect(result.fullMaleUnits).toBe(1);
    expect(result.totalCapacity).toBe(6);
    expect(result.occupiedSlots).toBe(3);
    expect(result.vacantSlots).toBe(3);
  });

  it('buckets a partially-filled unit by gender when every occupant so far matches, even a single one', () => {
    const tents = [
      tent({ passTypeId: 'pt-solo', capcity: 3, occupants: [{ gender: 'Male' } as any, null, null] }),
      tent({ passTypeId: 'pt-solo', capcity: 3, occupants: [{ gender: 'Female' } as any, { gender: 'Female' } as any, null] }),
    ];
    const [result] = summarizeTentTypes(tents, [soloType]);
    expect(result.partiallyFilledMaleUnits).toBe(1);
    expect(result.partiallyFilledFemaleUnits).toBe(1);
  });

  it('buckets a partially-filled unit as Mixed instead of Male/Female once genders differ', () => {
    const tents = [tent({ passTypeId: 'pt-solo', capcity: 3, occupants: [{ gender: 'Male' } as any, { gender: 'Female' } as any, null] })];
    const [result] = summarizeTentTypes(tents, [soloType]);
    expect(result.partiallyFilledMaleUnits).toBe(0);
    expect(result.partiallyFilledFemaleUnits).toBe(0);
    expect(result.partiallyFilledMixedUnits).toBe(1);
  });

  it('buckets a full unit by gender, matching the same rule as partial units', () => {
    const tents = [tent({ passTypeId: 'pt-solo', capcity: 2, occupants: [{ gender: 'Female' } as any, { gender: 'Female' } as any] })];
    const [result] = summarizeTentTypes(tents, [soloType]);
    expect(result.fullFemaleUnits).toBe(1);
    expect(result.fullMixedUnits).toBe(0);
  });

  it('buckets a full unit as Mixed once genders differ', () => {
    const tents = [tent({ passTypeId: 'pt-solo', capcity: 2, occupants: [{ gender: 'Male' } as any, { gender: 'Female' } as any] })];
    const [result] = summarizeTentTypes(tents, [soloType]);
    expect(result.fullMixedUnits).toBe(1);
    expect(result.fullMaleUnits).toBe(0);
    expect(result.fullFemaleUnits).toBe(0);
  });

  it('buckets a capacity-1 full unit by its lone occupant\'s gender', () => {
    const tents = [tent({ passTypeId: 'pt-solo', capcity: 1, occupants: [{ gender: 'Male' } as any] })];
    const [result] = summarizeTentTypes(tents, [soloType]);
    expect(result.fullUnits).toBe(1);
    expect(result.fullMaleUnits).toBe(1);
  });

  it('keeps each pass type\'s tents separate', () => {
    const tents = [
      tent({ passTypeId: 'pt-solo', _id: 's1' } as any),
      tent({ passTypeId: 'pt-shared', _id: 'h1' } as any),
      tent({ passTypeId: 'pt-shared', _id: 'h2' } as any),
    ];
    const result = summarizeTentTypes(tents, [soloType, sharedType]);
    expect(result.find(r => r.passTypeId === 'pt-solo')?.totalUnits).toBe(1);
    expect(result.find(r => r.passTypeId === 'pt-shared')?.totalUnits).toBe(2);
  });

  it('resolves passType whether it\'s a raw id string or a populated object', () => {
    const tents = [
      tent({ passTypeId: 'pt-solo' }),
      { ...tent({ passTypeId: 'unused' }), passType: { _id: 'pt-solo', name: 'Solo Tent', category: 'tent' } } as any,
    ];
    const [result] = summarizeTentTypes(tents, [soloType]);
    expect(result.totalUnits).toBe(2);
  });
});

describe('AccommodationSetupComponent', () => {
  let component: AccommodationSetupComponent;
  let fixture: ComponentFixture<AccommodationSetupComponent>;
  let accomodationServiceSpy: jasmine.SpyObj<AccomodationService>;
  let activeEventSubject: BehaviorSubject<EventItem | null>;
  let eventServiceStub: { activeEvent: BehaviorSubject<EventItem | null>; currentActiveEvent: EventItem | null; getEventDetail: jasmine.Spy; updatePassType: jasmine.Spy };
  let notificationSpy: jasmine.SpyObj<NotificationService>;

  const mockEvent = { _id: 'event1', name: 'Test Event' } as EventItem;
  let codedPassType: PassType;
  let codelessPassType: PassType;
  let festivalPassType: PassType;
  let mockDetail: EventDetail;

  beforeEach(async () => {
    // Fresh objects every test — submit() intentionally mutates
    // passType.code locally on a successful save (real app behaviour, for an
    // immediate UI reflection), so a shared/reused fixture object here would
    // leak mutations from one test into the next.
    codedPassType = { _id: 'pt1', event: 'event1', name: 'Shared Tent', category: 'tent', code: 'SH' };
    codelessPassType = { _id: 'pt2', event: 'event1', name: 'Solo Tent', category: 'tent' };
    festivalPassType = { _id: 'pt3', event: 'event1', name: 'Festival Ticket', category: 'festival' };
    mockDetail = {
      _id: 'event1', name: 'Test Event', description: '', status: 'active',
      passTypes: [codedPassType, codelessPassType, festivalPassType],
      tents: []
    } as any;

    accomodationServiceSpy = jasmine.createSpyObj('AccomodationService', ['createTents', 'getAllTents']);
    accomodationServiceSpy.getAllTents.and.returnValue(of([]));
    activeEventSubject = new BehaviorSubject<EventItem | null>(mockEvent);
    eventServiceStub = {
      activeEvent: activeEventSubject,
      get currentActiveEvent() { return activeEventSubject.value; },
      getEventDetail: jasmine.createSpy('getEventDetail').and.returnValue(of(mockDetail)),
      updatePassType: jasmine.createSpy('updatePassType'),
    } as any;
    notificationSpy = jasmine.createSpyObj('NotificationService', ['openSucessSnackBar', 'openErrorSnackBar']);

    await TestBed.configureTestingModule({
      declarations: [AccommodationSetupComponent],
      imports: [ReactiveFormsModule],
      providers: [
        { provide: AccomodationService, useValue: accomodationServiceSpy },
        { provide: EventService, useValue: eventServiceStub },
        { provide: NotificationService, useValue: notificationSpy },
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();

    fixture = TestBed.createComponent(AccommodationSetupComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('loads only tent-category pass types for the active event', () => {
    expect(eventServiceStub.getEventDetail).toHaveBeenCalledWith('event1');
    expect(component.tentPassTypes).toEqual([codedPassType, codelessPassType]);
  });

  it('flags noActiveEvent when the active event changes to none, and clears the pass type list', () => {
    eventServiceStub.getEventDetail.calls.reset();
    activeEventSubject.next(null);
    expect(component.noActiveEvent).toBeTrue();
    expect(component.tentPassTypes).toEqual([]);
    expect(eventServiceStub.getEventDetail).not.toHaveBeenCalled();
  });

  it('reacts to the active event resolving after startup (the race this subscription exists for)', () => {
    activeEventSubject.next(null); // simulates ngOnInit running before EventService's own load resolves
    expect(component.noActiveEvent).toBeTrue();

    eventServiceStub.getEventDetail.calls.reset();
    activeEventSubject.next(mockEvent); // resolves a moment later
    expect(component.noActiveEvent).toBeFalse();
    expect(eventServiceStub.getEventDetail).toHaveBeenCalledWith('event1');
  });

  it('needsCode is false for a pass type that already has one', () => {
    component.form.get('passTypeId')!.setValue('pt1');
    expect(component.needsCode).toBeFalse();
  });

  it('needsCode is true for a code-less pass type, and onPassTypeChange() pre-fills a suggestion', () => {
    component.form.get('passTypeId')!.setValue('pt2');
    expect(component.needsCode).toBeTrue();
    component.onPassTypeChange();
    expect(component.form.value.code).toBe('SO');
  });

  it('submit() creates tents directly when the pass type already has a code', () => {
    component.form.setValue({ passTypeId: 'pt1', capacity: 2, quantity: 3, code: '' });
    const created: Tent[] = [
      { _id: 't1', tent_no: 'SH1', capcity: 2, passType: 'pt1' } as any,
      { _id: 't2', tent_no: 'SH2', capcity: 2, passType: 'pt1' } as any,
      { _id: 't3', tent_no: 'SH3', capcity: 2, passType: 'pt1' } as any,
    ];
    accomodationServiceSpy.createTents.and.returnValue(of(created));

    component.submit();

    expect(eventServiceStub.updatePassType).not.toHaveBeenCalled();
    expect(accomodationServiceSpy.createTents).toHaveBeenCalledWith({
      eventId: 'event1', passTypeId: 'pt1', capacity: 2, quantity: 3
    });
    expect(component.lastCreated).toEqual(created);
    expect(notificationSpy.openSucessSnackBar).toHaveBeenCalledWith('Created 3 unit(s): SH1 – SH3');
  });

  it('submit() saves the code first, then creates tents, for a code-less pass type', () => {
    component.form.setValue({ passTypeId: 'pt2', capacity: 1, quantity: 1, code: 'so' });
    eventServiceStub.updatePassType.and.returnValue(of({ ...codelessPassType, code: 'SO' }));
    accomodationServiceSpy.createTents.and.returnValue(of([{ _id: 't1', tent_no: 'SO1', capcity: 1, passType: 'pt2' } as any]));

    component.submit();

    expect(eventServiceStub.updatePassType).toHaveBeenCalledWith('event1', 'pt2', { code: 'so' });
    expect(accomodationServiceSpy.createTents).toHaveBeenCalledWith({
      eventId: 'event1', passTypeId: 'pt2', capacity: 1, quantity: 1
    });
  });

  it('submit() blocks with an error if a code-less pass type is submitted with an empty code', () => {
    component.form.setValue({ passTypeId: 'pt2', capacity: 1, quantity: 1, code: '' });

    component.submit();

    expect(eventServiceStub.updatePassType).not.toHaveBeenCalled();
    expect(accomodationServiceSpy.createTents).not.toHaveBeenCalled();
    expect(notificationSpy.openErrorSnackBar).toHaveBeenCalledWith('"Solo Tent" needs a code before you can create units against it');
  });

  it('submit() surfaces an error and does not create tents if saving the code fails', () => {
    component.form.setValue({ passTypeId: 'pt2', capacity: 1, quantity: 1, code: 'so' });
    eventServiceStub.updatePassType.and.returnValue(throwError(() => ({ error: { message: 'A pass type with this code already exists for this event' } })));

    component.submit();

    expect(accomodationServiceSpy.createTents).not.toHaveBeenCalled();
    expect(notificationSpy.openErrorSnackBar).toHaveBeenCalledWith('A pass type with this code already exists for this event');
  });

  it('submit() shows an error toast on createTents failure', () => {
    component.form.setValue({ passTypeId: 'pt1', capacity: 2, quantity: 3, code: '' });
    accomodationServiceSpy.createTents.and.returnValue(throwError(() => ({ error: { message: 'Server error' } })));

    component.submit();

    expect(notificationSpy.openErrorSnackBar).toHaveBeenCalledWith('Server error');
    expect(component.creating).toBeFalse();
  });

  it('submit() does nothing if the form is invalid', () => {
    component.form.setValue({ passTypeId: '', capacity: null, quantity: null, code: '' });
    component.submit();
    expect(accomodationServiceSpy.createTents).not.toHaveBeenCalled();
  });

  describe('summary cards', () => {
    it('fetches and computes summaries on load', () => {
      const tents: Tent[] = [{ _id: 't1', tent_no: 'SH1', capcity: 2, passType: 'pt1', occupants: [null, null] } as any];
      accomodationServiceSpy.getAllTents.and.returnValue(of(tents));

      component.loadTentPassTypes('event1');

      expect(accomodationServiceSpy.getAllTents).toHaveBeenCalledWith('event1');
      expect(component.summaries.find(s => s.passTypeId === 'pt1')?.whollyVacantUnits).toBe(1);
    });

    it('refreshes summaries after a successful create', () => {
      component.form.setValue({ passTypeId: 'pt1', capacity: 2, quantity: 1, code: '' });
      accomodationServiceSpy.createTents.and.returnValue(of([{ _id: 't1', tent_no: 'SH4', capcity: 2, passType: 'pt1' } as any]));
      accomodationServiceSpy.getAllTents.calls.reset();

      component.submit();

      expect(accomodationServiceSpy.getAllTents).toHaveBeenCalledWith('event1');
    });

    it('clears summaries when the active event goes away', () => {
      component.summaries = [{ passTypeId: 'pt1' } as any];
      activeEventSubject.next(null);
      expect(component.summaries).toEqual([]);
    });
  });
});
