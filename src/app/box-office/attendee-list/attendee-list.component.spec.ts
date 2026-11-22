import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA, SimpleChange } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { of, throwError } from 'rxjs';

import { AttendeeListComponent } from './attendee-list.component';
import { BoxOfficeService } from '../box-office.service';
import { AccomodationService } from '../../accomodation/accomodation.service';
import { NotificationService } from '../../core/notification.service';
import { Ticket } from '../../models/ticket.model';
import { Tent } from '../../models/tent.model';
import { GateFeedbackService } from '../../core/gate-feedback.service';
import { AuthService } from '../../core/auth.service';
import { BoxOfficeQrscannerPopupComponent } from '../registration/qrscanner-popup/qrscanner-popup.component';

const mockTicket: Ticket = new Ticket(1, 'Arjun', 'Mehta', 'arjun@example.com', '9000000001', 'TXN1', 'sent', 100, [
  { _id: 's1', item_name: 'Festival Ticket', item_quantity: 1, order_id: 1, admissionId: null as any, isAdmitted: true, isActive: true, name: 'Arjun Mehta', phone_no: '9000000001', email: 'arjun@example.com' } as any,
  { _id: 's2', item_name: 'Camping', item_quantity: 1, order_id: 1, admissionId: null as any, isAdmitted: false, isActive: true, name: '', phone_no: '', email: '' } as any,
], 't1');

describe('AttendeeListComponent', () => {
  let component: AttendeeListComponent;
  let fixture: ComponentFixture<AttendeeListComponent>;
  let boxOfficeServiceSpy: jasmine.SpyObj<BoxOfficeService>;
  let accomodationServiceSpy: jasmine.SpyObj<AccomodationService>;
  let notificationSpy: jasmine.SpyObj<NotificationService>;
  let dialogSpy: jasmine.SpyObj<MatDialog>;
  let feedbackSpy: jasmine.SpyObj<GateFeedbackService>;
  let authSpy: jasmine.SpyObj<AuthService>;
  /** Whether the signed-in test user counts as Box Office staff (may replace bands). */
  let canReplace = true;

  /** The band scanner closes with this (undefined = cancelled). */
  const dialogReturns = (result: any) =>
    dialogSpy.open.and.returnValue({ afterClosed: () => of(result) } as any);

  const buttonClick = (label: string) =>
    (Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[])
      .find(b => b.textContent?.trim() === label)!.click();

  const configureWith = (ticket: Ticket) => {
    TestBed.resetTestingModule();
    boxOfficeServiceSpy = jasmine.createSpyObj('BoxOfficeService', ['checkIn', 'linkBand', 'replaceBand', 'bandHistory']);
    authSpy = jasmine.createSpyObj('AuthService', ['hasPermission', 'inDepartmentKey'], {
      currentUser: { role: 'VOL', departments: [], permissions: [] }
    });
    authSpy.hasPermission.and.returnValue(false);
    authSpy.inDepartmentKey.and.callFake(() => canReplace);
    accomodationServiceSpy = jasmine.createSpyObj('AccomodationService', ['getTentById', 'vacateTentSlot', 'getStay']);
    accomodationServiceSpy.getStay.and.returnValue(of({ tentPassId: 'x', beds: 1, used: 0, tentId: null, people: [] }));
    accomodationServiceSpy.getTentById.and.returnValue(of({} as Tent));
    notificationSpy = jasmine.createSpyObj('NotificationService', ['openSucessSnackBar', 'openErrorSnackBar']);
    dialogSpy = jasmine.createSpyObj('MatDialog', ['open']);
    feedbackSpy = jasmine.createSpyObj('GateFeedbackService', ['unlock']);

    TestBed.configureTestingModule({
      declarations: [AttendeeListComponent],
      providers: [
        { provide: BoxOfficeService, useValue: boxOfficeServiceSpy },
        { provide: AccomodationService, useValue: accomodationServiceSpy },
        { provide: NotificationService, useValue: notificationSpy },
        { provide: MatDialog, useValue: dialogSpy },
        { provide: GateFeedbackService, useValue: feedbackSpy },
        { provide: AuthService, useValue: authSpy },
      ],
      schemas: [NO_ERRORS_SCHEMA]
    });

    fixture = TestBed.createComponent(AttendeeListComponent);
    component = fixture.componentInstance;
    component.ticket = ticket;
    fixture.detectChanges();
  };

  beforeEach(() => {
    canReplace = true;
    configureWith(mockTicket);
  });

  it('shows no action buttons to Helpdesk (read-only, HD2)', () => {
    configureWith(mockTicket);
    expect(fixture.nativeElement.querySelector('.att-actions')).not.toBeNull();
    (authSpy as any).boxOfficeReadOnly = () => true;
    fixture.detectChanges();
    expect(component.readOnly).toBeTrue();
    expect(fixture.nativeElement.querySelector('.att-actions')).toBeNull();
  });

  it('loads tent details for any allocatedTentId on the input ticket', () => {
    // TestBed.createComponent() doesn't run through a parent template binding,
    // so plain property assignment doesn't trigger ngOnChanges the way the real
    // [ticket]="..." bindings in BookingFoundComponent/BookingsComponent do —
    // invoke it explicitly here to simulate that.
    const ticketWithTent = { ...mockTicket, shopcart: [{ ...mockTicket.shopcart![1], allocatedTentId: 'tent1' } as any] } as Ticket;
    configureWith(ticketWithTent);
    component.ngOnChanges({ ticket: {} as any });
    expect(accomodationServiceSpy.getTentById).toHaveBeenCalledWith('tent1');
  });

  it('re-reads the tent on every new copy of the booking (beds may have changed)', () => {
    const ticketWithTent = { ...mockTicket, shopcart: [{ ...mockTicket.shopcart![1], allocatedTentId: 'tent1' } as any] } as Ticket;
    configureWith(ticketWithTent);
    component.ngOnChanges({ ticket: {} as any });
    component.ticket = { ...ticketWithTent };
    component.ngOnChanges({ ticket: {} as any });
    expect(accomodationServiceSpy.getTentById.calls.allArgs().filter(a => a[0] === 'tent1').length).toBe(2);
  });

  it('passes Allocate Tent\'s "open this booking" up to the page (linked bookings)', () => {
    component.activeAllocateItem = mockTicket.shopcart![1];
    fixture.detectChanges();
    const emitted: string[] = [];
    component.openBooking.subscribe(id => emitted.push(id));
    fixture.debugElement.query(el => el.name === 'app-allocate-tent').triggerEventHandler('openBooking', 'FP-3');
    expect(emitted).toEqual(['FP-3']);
  });

  describe('sortedShopcart', () => {
    it('lists Festival Pass rows before Tent Pass rows, keeping original order within each group', () => {
      const localTicket = {
        ...mockTicket,
        shopcart: [
          { _id: 'tent1', item_name: 'Camping' } as any,
          { _id: 'fest1', item_name: 'Festival Ticket' } as any,
          { _id: 'tent2', item_name: 'Solo Tent' } as any,
          { _id: 'fest2', item_name: 'Day Pass' } as any,
        ]
      } as Ticket;
      component.ticket = localTicket;

      expect(component.sortedShopcart.map(i => i._id)).toEqual(['fest1', 'fest2', 'tent1', 'tent2']);
    });
  });

  describe('isDetailsComplete()', () => {
    it('is true when name/phone/email are all present', () => {
      expect(component.isDetailsComplete(mockTicket.shopcart![0])).toBeTrue();
    });

    it('is false when any field is missing', () => {
      expect(component.isDetailsComplete(mockTicket.shopcart![1])).toBeFalse();
    });
  });

  describe('isFestivalPass()', () => {
    it('is true for Festival Ticket items', () => {
      expect(component.isFestivalPass(mockTicket.shopcart![0])).toBeTrue();
    });

    it('is false for tent pass items', () => {
      expect(component.isFestivalPass(mockTicket.shopcart![1])).toBeFalse();
    });
  });

  describe('add-ons take no bed (Extra bed, Car Pass…)', () => {
    const t = () => ({ ...mockTicket, _id: 'tk-addon', shopcart: [
      { ...mockTicket.shopcart![1], _id: 'a1', category: 'addon', item_name: 'Extra bed', allocatedTentId: null },
      { ...mockTicket.shopcart![1], _id: 'a2', category: 'tent', item_name: 'Shared Tent', allocatedTentId: null }
    ] } as any as Ticket);
    const actionsOf = (name: string) => {
      const row = (Array.from(fixture.nativeElement.querySelectorAll('.att-pass')) as HTMLElement[])
        .find(r => r.textContent!.includes(name))!.closest('.att-row') ?? fixture.nativeElement;
      return (Array.from(row.querySelectorAll('.att-actions button')) as HTMLElement[]).map(b => b.textContent!.trim());
    };

    it('shows Allocate Tent on the Tent Pass only, never on an add-on', () => {
      configureWith(t());
      const all = (Array.from(fixture.nativeElement.querySelectorAll('.att-actions button')) as HTMLElement[]).map(b => b.textContent!.trim());
      expect(all.filter(x => x === 'Allocate Tent').length).toBe(1);
      expect(actionsOf('Extra bed')).not.toContain('Allocate Tent');
    });

    it('isTentPass(): tent yes; add-on and Festival Pass no; legacy non-festival without a category yes', () => {
      expect(component.isTentPass({ category: 'tent' } as any)).toBeTrue();
      expect(component.isTentPass({ category: 'addon' } as any)).toBeFalse();
      expect(component.isTentPass({ category: 'festival' } as any)).toBeFalse();
      expect(component.isTentPass({ item_name: 'Camping' } as any)).toBeTrue();
      expect(component.isTentPass({ item_name: 'Festival Ticket' } as any)).toBeFalse();
    });

    it('loads beds for the Tent Pass only', () => {
      configureWith(t());
      accomodationServiceSpy.getStay.calls.reset();
      component.ngOnChanges({ ticket: {} as any });
      expect(accomodationServiceSpy.getStay.calls.allArgs().map(a => a[0])).toEqual(['a2']);
    });
  });

  describe('passKind(): the kind of pass before its name', () => {
    it('gives Festival Pass / Tent Pass / Add-on from the category', () => {
      expect(component.passKind({ ...mockTicket.shopcart![0], category: 'festival' } as any)).toEqual(jasmine.objectContaining({ label: 'Festival Pass', icon: 'confirmation_number' }));
      expect(component.passKind({ ...mockTicket.shopcart![1], category: 'tent' } as any)).toEqual(jasmine.objectContaining({ label: 'Tent Pass', icon: 'hotel' }));
      expect(component.passKind({ ...mockTicket.shopcart![1], category: 'addon' } as any)).toEqual(jasmine.objectContaining({ label: 'Add-on', icon: 'add_circle' }));
    });

    it('returns the same object each time (stable for change detection)', () => {
      const item = mockTicket.shopcart![0];
      expect(component.passKind(item)).toBe(component.passKind(item));
    });

    it('shows only the type icon, then the pass name (never a type label); an Add-on no longer shows the tent icon', () => {
      const t = { ...mockTicket, _id: 'tk-kind', shopcart: [
        { ...mockTicket.shopcart![0], _id: 'k1', category: 'festival', item_name: 'Weekend Ticket' },
        { ...mockTicket.shopcart![1], _id: 'k2', category: 'addon', item_name: 'Car Parking', allocatedTentId: null },
        { ...mockTicket.shopcart![1], _id: 'k3', category: 'tent', item_name: 'Shared Tent', allocatedTentId: null }
      ] } as any as Ticket;
      configureWith(t);
      const rows = Array.from(fixture.nativeElement.querySelectorAll('.att-pass')) as HTMLElement[];
      const texts = rows.map(r => r.textContent!.replace(/\s+/g, ' ').trim());
      expect(texts).toContain('confirmation_numberWeekend Ticket');
      expect(texts).toContain('add_circleCar Parking');
      expect(texts).toContain('hotelShared Tent');
      expect(texts.find(x => x.includes('Car Parking'))).not.toContain('hotel');
      expect(texts.join(' ')).not.toMatch(/Festival Pass|Tent Pass|Add-on/);
    });

    it('uses passTypeName (Box Office flow) when item_name is empty', () => {
      const t = { ...mockTicket, _id: 'tk-ptn', shopcart: [
        { ...mockTicket.shopcart![0], _id: 'n1', category: 'festival', item_name: undefined, passTypeName: 'Day Pass' },
        { ...mockTicket.shopcart![1], _id: 'n2', category: 'tent', item_name: undefined, passTypeName: 'PYOT', allocatedTentId: null }
      ] } as any as Ticket;
      configureWith(t);
      const texts = (Array.from(fixture.nativeElement.querySelectorAll('.att-pass')) as HTMLElement[]).map(r => r.textContent!.replace(/\s+/g, ' ').trim());
      expect(texts).toContain('confirmation_numberDay Pass');
      expect(texts).toContain('hotelPYOT');
    });
  });

  describe('attendeeInitials()', () => {
    it('returns the first letter of the name, uppercased', () => {
      expect(component.attendeeInitials(mockTicket.shopcart![0])).toBe('A');
    });

    it('returns "?" when there is no name', () => {
      expect(component.attendeeInitials(mockTicket.shopcart![1])).toBe('?');
    });
  });

  describe('counter form', () => {
    it('openCounterForm sets activeCounterItem', () => {
      component.openCounterForm(mockTicket.shopcart![1]);
      expect(component.activeCounterItem).toBe(mockTicket.shopcart![1]);
    });

    it('onCounterFormSaved replaces the matching shopcart item and clears activeCounterItem', () => {
      const localTicket = { ...mockTicket, shopcart: mockTicket.shopcart!.map(i => ({ ...i })) } as Ticket;
      component.ticket = localTicket;

      const target = localTicket.shopcart![1];
      component.openCounterForm(target);

      const updated = { ...target, name: 'Kavya Reddy', phone_no: '9000000009', email: 'kavya@example.com' } as any;
      component.onCounterFormSaved(updated);

      expect(component.ticket.shopcart![1]).toEqual(updated);
      expect(component.activeCounterItem).toBeNull();
    });

    it('onCounterFormCancelled clears activeCounterItem without changing shopcart', () => {
      component.openCounterForm(mockTicket.shopcart![1]);
      component.onCounterFormCancelled();
      expect(component.activeCounterItem).toBeNull();
    });
  });

  describe('allowEdit input (Bookings-panel-only Edit action)', () => {
    const editButton = (): HTMLButtonElement | undefined =>
      (Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[])
        .find(b => b.textContent?.trim() === 'Edit');

    it('defaults to false — no Edit button rendered, even on a row with complete details', () => {
      expect(component.allowEdit).toBeFalse();
      expect(editButton()).toBeUndefined();
    });

    it('shows an Edit button on rows with complete details when true', () => {
      component.allowEdit = true;
      fixture.detectChanges();
      expect(editButton()).toBeDefined();
    });

    it('does not show an Edit button on rows with incomplete details, even when true', () => {
      component.allowEdit = true;
      fixture.detectChanges();
      // s1 (index 0, festival, complete) sorts before s2 (index 1, tent, incomplete) —
      // only one Edit button should exist, for the complete row.
      const editButtons = (Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[])
        .filter(b => b.textContent?.trim() === 'Edit');
      expect(editButtons.length).toBe(1);
    });

    it('clicking Edit opens the counter form for that item', () => {
      component.allowEdit = true;
      fixture.detectChanges();
      editButton()!.click();
      expect(component.activeCounterItem).toBe(mockTicket.shopcart![0]);
    });
  });

  describe('admitAttendee()', () => {
    const scanned = { raw: 'https://wallet.example/p?eventid=E&tagid=T1', code: 'E:T1' };

    it('scans the band first, then admits with it', () => {
      const localTicket = { ...mockTicket, shopcart: mockTicket.shopcart!.map(i => ({ ...i })) } as Ticket;
      component.ticket = localTicket;
      dialogReturns(scanned);
      const updated = { ...localTicket.shopcart![0], isAdmitted: true, band: 'b1' };
      boxOfficeServiceSpy.checkIn.and.returnValue(of(updated));

      component.admitAttendee(localTicket.shopcart![0]);

      expect(feedbackSpy.unlock).toHaveBeenCalled();
      expect(dialogSpy.open).toHaveBeenCalledWith(BoxOfficeQrscannerPopupComponent, jasmine.objectContaining({
        data: { mode: 'band', purpose: 'admit', attendeeName: 'Arjun Mehta', passId: 's1' }
      }));
      expect(boxOfficeServiceSpy.checkIn).toHaveBeenCalledWith('s1', scanned.raw);
      expect(component.ticket.shopcart![0].band).toBe('b1');
      expect(notificationSpy.openSucessSnackBar).toHaveBeenCalledWith('Admitted, band linked');
    });

    it('does not admit when the scanner is cancelled', () => {
      dialogReturns(undefined);
      component.admitAttendee(mockTicket.shopcart![0]);
      expect(boxOfficeServiceSpy.checkIn).not.toHaveBeenCalled();
    });

    it('shows the server reason on failure (e.g. band already on someone)', () => {
      dialogReturns(scanned);
      boxOfficeServiceSpy.checkIn.and.returnValue(throwError(() => ({ error: { message: 'This band is already linked to Kabir Das.' } })));
      component.admitAttendee(mockTicket.shopcart![0]);
      expect(notificationSpy.openErrorSnackBar).toHaveBeenCalledWith('This band is already linked to Kabir Das.');
    });

    it('falls back to "Admission failed" when the server gives no message', () => {
      dialogReturns(scanned);
      boxOfficeServiceSpy.checkIn.and.returnValue(throwError(() => ({})));
      component.admitAttendee(mockTicket.shopcart![0]);
      expect(notificationSpy.openErrorSnackBar).toHaveBeenCalledWith('Admission failed');
    });

    it('falls back to "Attendee" when the pass has no name', () => {
      dialogReturns(undefined);
      component.admitAttendee({ ...mockTicket.shopcart![0], name: '' } as any);
      expect(dialogSpy.open).toHaveBeenCalledWith(BoxOfficeQrscannerPopupComponent, jasmine.objectContaining({
        data: jasmine.objectContaining({ attendeeName: 'Attendee' })
      }));
    });
  });

  describe('Admit / band buttons', () => {
    const buttonsNamed = (label: string): HTMLButtonElement[] =>
      (Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[])
        .filter(b => b.textContent?.trim() === label);

    const withFestival = (extra: any): Ticket => ({
      ...mockTicket,
      shopcart: [{ ...mockTicket.shopcart![0], ...extra } as any, { ...mockTicket.shopcart![1] } as any]
    } as Ticket);

    it('labels the admission button "Admit", with no "Check In" left', () => {
      configureWith(withFestival({ isAdmitted: false }));
      expect(buttonsNamed('Admit').length).toBe(1);
      expect(buttonsNamed('Check In').length).toBe(0);
    });

    it('offers only Admit before admission (the band is scanned inside Admit)', () => {
      configureWith(withFestival({ isAdmitted: false }));
      expect(buttonsNamed('Link Band').length).toBe(0);
      expect(buttonsNamed('Replace Band').length).toBe(0);
    });

    it('offers Link Band on an admitted pass with no band (admitted before bands existed)', () => {
      // mockTicket's Festival Pass is admitted, with no band.
      expect(buttonsNamed('Admit').length).toBe(0);
      expect(buttonsNamed('Link Band').length).toBe(1);
    });

    it('offers Replace Band once a band is linked, to Box Office staff', () => {
      configureWith(withFestival({ band: 'b1' }));
      expect(buttonsNamed('Link Band').length).toBe(0);
      expect(buttonsNamed('Replace Band').length).toBe(1);
    });

    it('hides Replace Band from people outside Box Office', () => {
      canReplace = false;
      configureWith(withFestival({ band: 'b1' }));
      expect(buttonsNamed('Replace Band').length).toBe(0);
    });

    it('does not show band buttons on a Festival Pass with incomplete details', () => {
      configureWith(withFestival({ email: '' }));
      expect(buttonsNamed('Link Band').length).toBe(0);
    });

    it('does not show band buttons on Tent Pass rows', () => {
      configureWith({ ...mockTicket, shopcart: [{ ...mockTicket.shopcart![1], name: 'A', phone_no: '1', email: 'a@b.c', isAdmitted: true } as any] } as Ticket);
      expect(buttonsNamed('Link Band').length).toBe(0);
    });

    it('shows "Not admitted" (not "Not arrived") on a pass not yet admitted', () => {
      configureWith(withFestival({ isAdmitted: false }));
      expect(fixture.nativeElement.textContent).toContain('Not admitted');
      expect(fixture.nativeElement.textContent).not.toContain('Not arrived');
    });

    it('shows "Admitted" on the status badge of an admitted pass', () => {
      expect(fixture.nativeElement.textContent).toContain('Admitted');
      expect(fixture.nativeElement.textContent).not.toContain('Checked in');
    });
  });

  describe('Link / Replace band', () => {
    const scanned = { raw: 'BAND-0002', code: 'BAND-0002', reason: 'Broke' };

    it('links a band to an admitted pass and updates the row', () => {
      const localTicket = { ...mockTicket, shopcart: mockTicket.shopcart!.map(i => ({ ...i })) } as Ticket;
      component.ticket = localTicket;
      dialogReturns(scanned);
      boxOfficeServiceSpy.linkBand.and.returnValue(of({ pass: { ...localTicket.shopcart![0], band: 'b2' }, band: { _id: 'b2', code: 'BAND-0002' } }));

      component.openLinkBand(localTicket.shopcart![0]);

      expect(dialogSpy.open).toHaveBeenCalledWith(BoxOfficeQrscannerPopupComponent, jasmine.objectContaining({
        data: jasmine.objectContaining({ purpose: 'link' })
      }));
      expect(boxOfficeServiceSpy.linkBand).toHaveBeenCalledWith('s1', 'BAND-0002');
      expect(component.ticket.shopcart![0].band).toBe('b2');
      expect(notificationSpy.openSucessSnackBar).toHaveBeenCalledWith('Band linked');
    });

    it('replaces the band with the reason given in the scanner', () => {
      component.ticket = { ...mockTicket, shopcart: mockTicket.shopcart!.map(i => ({ ...i })) } as Ticket;
      dialogReturns(scanned);
      boxOfficeServiceSpy.replaceBand.and.returnValue(of({ pass: { ...mockTicket.shopcart![0], band: 'b3' }, band: { _id: 'b3', code: 'BAND-0002' } } as any));

      component.openReplaceBand(mockTicket.shopcart![0]);

      expect(dialogSpy.open).toHaveBeenCalledWith(BoxOfficeQrscannerPopupComponent, jasmine.objectContaining({
        data: jasmine.objectContaining({ purpose: 'replace' })
      }));
      expect(boxOfficeServiceSpy.replaceBand).toHaveBeenCalledWith('s1', 'BAND-0002', 'Broke');
      expect(notificationSpy.openSucessSnackBar).toHaveBeenCalledWith('Band replaced');
    });

    it('shows the server reason when replacing fails', () => {
      dialogReturns(scanned);
      boxOfficeServiceSpy.replaceBand.and.returnValue(throwError(() => ({ error: { message: 'Only DEV, DIR, ADMIN or Box Office staff can replace a band' } })));
      component.openReplaceBand(mockTicket.shopcart![0]);
      expect(notificationSpy.openErrorSnackBar).toHaveBeenCalledWith('Only DEV, DIR, ADMIN or Box Office staff can replace a band');
    });
  });

  describe('band details', () => {
    const history = [
      { _id: 'b2', code: 'E:T2', status: 'active', linkedAt: '2026-11-03T10:00:00Z', linkedBy: { name: 'Box Office Lead' } },
      { _id: 'b1', code: 'E:T1', status: 'replaced', reason: 'Broke', linkedAt: '2026-11-03T09:00:00Z', retiredAt: '2026-11-03T10:00:00Z' }
    ] as any;

    it('loads the band history once when the Band badge is opened, and closes on a second tap', () => {
      configureWith({ ...mockTicket, shopcart: [{ ...mockTicket.shopcart![0], band: 'b2' } as any] } as Ticket);
      boxOfficeServiceSpy.bandHistory.and.returnValue(of({ bands: history, canReplace: true }));
      const badge = () => fixture.nativeElement.querySelector('.band-badge') as HTMLButtonElement;

      badge().click();
      fixture.detectChanges();
      expect(boxOfficeServiceSpy.bandHistory).toHaveBeenCalledWith('s1');
      expect(fixture.nativeElement.textContent).toContain('E:T2');
      expect(fixture.nativeElement.textContent).toContain('Box Office Lead');
      expect(fixture.nativeElement.textContent).toContain('Broke');

      badge().click();
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.band-history')).toBeNull();
      badge().click();
      expect(boxOfficeServiceSpy.bandHistory).toHaveBeenCalledTimes(1);
    });

    it('has no Band badge on a pass without a band', () => {
      expect(fixture.nativeElement.querySelector('.band-badge')).toBeNull();
    });
  });

  describe('allocate tent flow', () => {
    it('openAllocateTent sets activeAllocateItem', () => {
      component.openAllocateTent(mockTicket.shopcart![1]);
      expect(component.activeAllocateItem).toBe(mockTicket.shopcart![1]);
    });

    it('onTentAllocated caches the tent, updates both linked items, and clears activeAllocateItem', () => {
      const localTicket = { ...mockTicket, shopcart: mockTicket.shopcart!.map(i => ({ ...i })) } as Ticket;
      component.ticket = localTicket;
      component.openAllocateTent(localTicket.shopcart![1]);

      const tent = { _id: 'tent1', tent_no: 'SH01' } as Tent;
      const updatedTentPass = { ...localTicket.shopcart![1], allocatedTentId: 'tent1', linkedPassId: 's1' };
      const updatedFestivalPass = { ...localTicket.shopcart![0], allocatedTentId: 'tent1', linkedPassId: 's2' };

      component.onTentAllocated({ tent, tentPassItem: updatedTentPass, festivalPassItem: updatedFestivalPass });

      expect(component.tentLookup['tent1']).toEqual(tent);
      expect(component.ticket.shopcart![1].allocatedTentId).toBe('tent1');
      expect(component.ticket.shopcart![0].allocatedTentId).toBe('tent1');
      expect(component.activeAllocateItem).toBeNull();
      expect(component.tentNoFor(component.ticket.shopcart![1])).toBe('SH01');
    });

    it('onAllocateCancelled clears activeAllocateItem', () => {
      component.openAllocateTent(mockTicket.shopcart![1]);
      component.onAllocateCancelled();
      expect(component.activeAllocateItem).toBeNull();
    });
  });

  describe('switching bookings (stale Allocate Tent / Counter Form bug)', () => {
    const otherTicket = { ...mockTicket, _id: 't2' } as Ticket;

    it('closes an open Allocate Tent when a different booking is passed in', () => {
      component.openAllocateTent(mockTicket.shopcart![1]);
      component.ticket = otherTicket;
      component.ngOnChanges({ ticket: { previousValue: mockTicket, currentValue: otherTicket } as any });
      expect(component.activeAllocateItem).toBeNull();
    });

    it('closes an open Counter Form when a different booking is passed in', () => {
      component.openCounterForm(mockTicket.shopcart![1]);
      component.ticket = otherTicket;
      component.ngOnChanges({ ticket: { previousValue: mockTicket, currentValue: otherTicket } as any });
      expect(component.activeCounterItem).toBeNull();
    });

    it('keeps an open form when only a refreshed copy of the same booking arrives', () => {
      component.openAllocateTent(mockTicket.shopcart![1]);
      const refreshed = { ...mockTicket } as Ticket;
      component.ticket = refreshed;
      component.ngOnChanges({ ticket: { previousValue: mockTicket, currentValue: refreshed } as any });
      expect(component.activeAllocateItem).toBe(mockTicket.shopcart![1]);
    });

    it('resetView() closes both', () => {
      component.openAllocateTent(mockTicket.shopcart![1]);
      component.openCounterForm(mockTicket.shopcart![0]);
      component.resetView();
      expect(component.activeAllocateItem).toBeNull();
      expect(component.activeCounterItem).toBeNull();
    });
  });

  describe('bed model (I0): a Tent Pass with several beds', () => {
    const stay = {
      tentPassId: 's2', beds: 3, used: 2, tentId: 'tent1',
      people: [
        { _id: 'p1', name: 'Rowan Ilse', gender: 'Male', isAdmitted: false, tentId: 'tent1', tent_no: 'CR1' },
        { _id: 'p2', name: 'Esme Tarn', gender: 'Female', isAdmitted: true, tentId: 'tent1', tent_no: 'CR1' }
      ]
    };

    it('shows Beds 2 / 3, the people in them, and "Allocate next bed" while a bed is free', () => {
      accomodationServiceSpy.getStay.and.returnValue(of(stay));
      const localTicket = { ...mockTicket, _id: 'tk-beds', shopcart: mockTicket.shopcart!.map(i => ({ ...i, allocatedTentId: 'tent1', beds: 3 })) } as Ticket;
      component.ticket = localTicket;
      component.ngOnChanges({ ticket: new SimpleChange(undefined, localTicket, true) });
      fixture.detectChanges();
      const text = fixture.nativeElement.textContent as string;
      expect(text).toContain('Beds 2 / 3');
      expect(text).toContain('Rowan Ilse');
      expect(text).toContain('Esme Tarn');
      expect(text).toContain('Allocate next bed');
      expect(component.bedsFree(localTicket.shopcart![1])).toBeTrue();
    });

    it('the × on a person vacates only that bed', () => {
      accomodationServiceSpy.getStay.and.returnValue(of(stay));
      const localTicket = { ...mockTicket, _id: 'tk-beds2', shopcart: mockTicket.shopcart!.map(i => ({ ...i, allocatedTentId: 'tent1', beds: 3 })) } as Ticket;
      component.ticket = localTicket;
      component.ngOnChanges({ ticket: new SimpleChange(undefined, localTicket, true) });
      const after = { ...stay, used: 1, people: [stay.people[1]] };
      accomodationServiceSpy.vacateTentSlot.and.returnValue(of({ tent: {} as Tent, tentPassItem: localTicket.shopcart![1], festivalPassItem: null, stay: after }));
      component.vacateAttendee(localTicket.shopcart![1], stay.people[0]);
      expect(accomodationServiceSpy.vacateTentSlot).toHaveBeenCalledWith('s2', 'p1');
      expect(component.bedsUsed(localTicket.shopcart![1])).toBe(1);
    });
  });

  describe('vacateAttendee()', () => {
    it('updates both linked items on success', () => {
      const localTicket = { ...mockTicket, shopcart: mockTicket.shopcart!.map(i => ({ ...i, allocatedTentId: 'tent1' })) } as Ticket;
      component.ticket = localTicket;

      const vacatedTentPass = { ...localTicket.shopcart![1], allocatedTentId: null, linkedPassId: null };
      const vacatedFestivalPass = { ...localTicket.shopcart![0], allocatedTentId: null, linkedPassId: null };
      accomodationServiceSpy.vacateTentSlot.and.returnValue(of({ tent: {} as Tent, tentPassItem: vacatedTentPass, festivalPassItem: vacatedFestivalPass }));

      component.vacateAttendee(localTicket.shopcart![1]);

      expect(accomodationServiceSpy.vacateTentSlot).toHaveBeenCalledWith('s2', undefined);
      expect(component.ticket.shopcart![1].allocatedTentId).toBeNull();
      expect(component.ticket.shopcart![0].allocatedTentId).toBeNull();
      expect(notificationSpy.openSucessSnackBar).toHaveBeenCalled();
    });

    it('shows an error notification on failure', () => {
      accomodationServiceSpy.vacateTentSlot.and.returnValue(throwError(() => ({ error: { message: 'Tent slot was already vacated' } })));

      component.vacateAttendee(mockTicket.shopcart![1]);

      expect(notificationSpy.openErrorSnackBar).toHaveBeenCalledWith('Tent slot was already vacated');
    });
  });
});
