import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { BehaviorSubject, of, throwError } from 'rxjs';

import { AccommodationInventoryComponent, compareTentNo } from './accommodation-inventory.component';
import { AccomodationService } from '../../accomodation/accomodation.service';
import { AuthService } from '../../core/auth.service';
import { EventService } from '../../core/event.service';
import { NotificationService } from '../../core/notification.service';
import { EventItem } from '../../models/event.model';
import { Tent } from '../../models/tent.model';
import { User } from '../../core/user.model';
import { AppSelectComponent } from '../../shared/app-select/app-select.component';
import { AppOptionComponent } from '../../shared/app-select/app-option.component';

const mockEvent = { _id: 'event1', name: 'Test Event' } as EventItem;

const mockTents: Tent[] = [
  {
    _id: 't1', tent_no: 'SH1', capcity: 2, passType: { _id: 'pt1', name: 'Shared Tent', category: 'tent', code: 'SH' },
    occupants: [{ name: 'Ananya Rao' } as any, null]
  } as any,
  {
    _id: 't2', tent_no: 'SO1', capcity: 1, passType: { _id: 'pt2', name: 'Solo Tent', category: 'tent', code: 'SO' },
    occupants: [null]
  } as any,
];

describe('compareTentNo()', () => {
  it('sorts numeric suffixes numerically, not as strings', () => {
    const nos = ['SH2', 'SH10', 'SH1', 'SH9', 'SH11'];
    expect(nos.sort(compareTentNo)).toEqual(['SH1', 'SH2', 'SH9', 'SH10', 'SH11']);
  });

  it('sorts by letter prefix first when prefixes differ', () => {
    const nos = ['SO1', 'SH1'];
    expect(nos.sort(compareTentNo)).toEqual(['SH1', 'SO1']);
  });

  it('handles a tent_no with no trailing digits', () => {
    const nos = ['SH1', 'SHX', 'SH2'];
    expect(nos.sort(compareTentNo)).toEqual(['SH1', 'SH2', 'SHX']);
  });
});

describe('AccommodationInventoryComponent', () => {
  let component: AccommodationInventoryComponent;
  let fixture: ComponentFixture<AccommodationInventoryComponent>;
  let accomodationServiceSpy: jasmine.SpyObj<AccomodationService>;
  let activeEventSubject: BehaviorSubject<EventItem | null>;
  let eventServiceStub: { activeEvent: BehaviorSubject<EventItem | null>; currentActiveEvent: EventItem | null };
  let authServiceStub: { currentUser: User | null; hasPermission: jasmine.Spy };
  let notificationSpy: jasmine.SpyObj<NotificationService>;

  beforeEach(async () => {
    localStorage.removeItem('accommodationInventoryTypeFilter:event1');
    accomodationServiceSpy = jasmine.createSpyObj('AccomodationService', ['getAllTents', 'updateTent', 'deleteTent']);
    accomodationServiceSpy.getAllTents.and.returnValue(of(mockTents));
    activeEventSubject = new BehaviorSubject<EventItem | null>(mockEvent);
    eventServiceStub = {
      activeEvent: activeEventSubject,
      get currentActiveEvent() { return activeEventSubject.value; },
    } as any;
    authServiceStub = { currentUser: { role: 'ADMIN' } as User, hasPermission: jasmine.createSpy('hasPermission').and.returnValue(false) };
    notificationSpy = jasmine.createSpyObj('NotificationService', ['openSucessSnackBar', 'openErrorSnackBar']);

    await TestBed.configureTestingModule({
      declarations: [AccommodationInventoryComponent, AppSelectComponent, AppOptionComponent],
      imports: [FormsModule, ReactiveFormsModule],
      providers: [
        { provide: AccomodationService, useValue: accomodationServiceSpy },
        { provide: EventService, useValue: eventServiceStub },
        { provide: AuthService, useValue: authServiceStub },
        { provide: NotificationService, useValue: notificationSpy },
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();

    fixture = TestBed.createComponent(AccommodationInventoryComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('loads tents for the active event', () => {
    expect(accomodationServiceSpy.getAllTents).toHaveBeenCalledWith('event1');
    expect(component.tents).toEqual(mockTents);
  });

  it('flags noActiveEvent when the active event changes to none, and clears the list', () => {
    accomodationServiceSpy.getAllTents.calls.reset();
    activeEventSubject.next(null);
    expect(component.noActiveEvent).toBeTrue();
    expect(component.tents).toEqual([]);
    expect(accomodationServiceSpy.getAllTents).not.toHaveBeenCalled();
  });

  it('reacts to the active event resolving after startup (the race this subscription exists for)', () => {
    activeEventSubject.next(null); // simulates ngOnInit running before EventService's own load resolves
    expect(component.noActiveEvent).toBeTrue();

    accomodationServiceSpy.getAllTents.calls.reset();
    activeEventSubject.next(mockEvent); // resolves a moment later
    expect(component.noActiveEvent).toBeFalse();
    expect(accomodationServiceSpy.getAllTents).toHaveBeenCalledWith('event1');
  });

  describe('type filter persistence', () => {
    it('setTypeFilter() saves the choice under the current event\'s key', () => {
      component.setTypeFilter('Solo Tent');
      expect(component.selectedType).toBe('Solo Tent');
      expect(localStorage.getItem('accommodationInventoryTypeFilter:event1')).toBe('Solo Tent');
    });

    it('restores a previously-saved filter on load', () => {
      localStorage.setItem('accommodationInventoryTypeFilter:event1', 'Shared Tent');
      component.fetchTents('event1');
      expect(component.selectedType).toBe('Shared Tent');
    });

    it('falls back to "All" if the saved filter no longer matches any loaded type', () => {
      localStorage.setItem('accommodationInventoryTypeFilter:event1', 'Some Retired Tent Type');
      component.fetchTents('event1');
      expect(component.selectedType).toBe('All');
    });

    it('defaults to "All" when nothing is saved', () => {
      component.fetchTents('event1');
      expect(component.selectedType).toBe('All');
    });
  });

  describe('canManage', () => {
    it('is true for an admin role regardless of permissions', () => {
      expect(component.canManage).toBeTrue();
    });

    it('is false for a non-admin without box-office:write', () => {
      authServiceStub.currentUser = { role: 'VOL' } as User;
      expect(component.canManage).toBeFalse();
    });

    it('is true for a non-admin with box-office:write', () => {
      authServiceStub.currentUser = { role: 'TL' } as User;
      authServiceStub.hasPermission.and.returnValue(true);
      expect(component.canManage).toBeTrue();
    });
  });

  describe('derived helpers', () => {
    it('passTypeName() reads the populated passType name', () => {
      expect(component.passTypeName(mockTents[0])).toBe('Shared Tent');
    });

    it('types lists distinct pass type names, plus "All"', () => {
      expect(component.types).toEqual(['All', 'Shared Tent', 'Solo Tent']);
    });

    it('occupantCount() counts non-null occupants', () => {
      expect(component.occupantCount(mockTents[0])).toBe(1);
      expect(component.occupantCount(mockTents[1])).toBe(0);
    });

    it('occupantNames() joins occupant names, or shows an em dash when empty', () => {
      expect(component.occupantNames(mockTents[0])).toBe('Ananya Rao');
      expect(component.occupantNames(mockTents[1])).toBe('—');
    });

    describe('occupancyStatus()', () => {
      it('is "vacant" when there are no occupants', () => {
        expect(component.occupancyStatus(mockTents[1])).toBe('vacant'); // 0/1
      });

      it('is "partial" when some but not all slots are filled', () => {
        expect(component.occupancyStatus(mockTents[0])).toBe('partial'); // 1/2
      });

      it('is "full" when every slot is filled', () => {
        const full = { ...mockTents[0], capcity: 1, occupants: [{ name: 'X' } as any] } as any;
        expect(component.occupancyStatus(full)).toBe('full');
      });
    });

    describe('genderComposition()', () => {
      it('shows an em dash when there are no occupants', () => {
        expect(component.genderComposition(mockTents[1])).toBe('—');
      });

      it('shows the shared gender when every occupant matches', () => {
        const tent = { ...mockTents[0], occupants: [{ gender: 'Male' } as any, { gender: 'Male' } as any] } as any;
        expect(component.genderComposition(tent)).toBe('Male');
      });

      it('shows "Mixed" when occupants have different genders', () => {
        const tent = { ...mockTents[0], occupants: [{ gender: 'Male' } as any, { gender: 'Female' } as any] } as any;
        expect(component.genderComposition(tent)).toBe('Mixed');
      });

      it('shows an em dash when the only occupant has no gender on file', () => {
        expect(component.genderComposition(mockTents[0])).toBe('—'); // Ananya Rao has no gender set
      });
    });
  });

  describe('filteredTents', () => {
    it('filters by selected type', () => {
      component.selectedType = 'Solo Tent';
      expect(component.filteredTents).toEqual([mockTents[1]]);
    });

    it('filters by search term matching tent_no', () => {
      component.searchTerm = 'sh1';
      expect(component.filteredTents).toEqual([mockTents[0]]);
    });

    it('filters by search term matching an occupant name', () => {
      component.searchTerm = 'Ananya';
      expect(component.filteredTents).toEqual([mockTents[0]]);
    });

    it('filters by occupancy status', () => {
      component.selectedOccupancy = 'Vacant';
      expect(component.filteredTents).toEqual([mockTents[1]]); // SO1, 0/1

      component.selectedOccupancy = 'Partial';
      expect(component.filteredTents).toEqual([mockTents[0]]); // SH1, 1/2
    });

    it('sorts results by tent_no using natural (numeric-aware) order', () => {
      component.tents = [
        { _id: 'a', tent_no: 'SH10', capcity: 1, passType: 'pt1', occupants: [null] } as any,
        { _id: 'b', tent_no: 'SH2', capcity: 1, passType: 'pt1', occupants: [null] } as any,
        { _id: 'c', tent_no: 'SH1', capcity: 1, passType: 'pt1', occupants: [null] } as any,
      ];
      expect(component.filteredTents.map(t => t.tent_no)).toEqual(['SH1', 'SH2', 'SH10']);
    });
  });

  describe('occupant detail (follow-up #5)', () => {
    it('occupantsList() returns the full occupant docs, filtering out empty slots', () => {
      expect(component.occupantsList(mockTents[0])).toEqual([{ name: 'Ananya Rao' } as any]);
      expect(component.occupantsList(mockTents[1])).toEqual([]);
    });

    it('toggleExpand() opens a tent with occupants, and closes it again on a second call', () => {
      component.toggleExpand(mockTents[0]);
      expect(component.expandedTentId).toBe('t1');

      component.toggleExpand(mockTents[0]);
      expect(component.expandedTentId).toBeNull();
    });

    it('toggleExpand() switches from one expanded tent to another', () => {
      const other: Tent = { ...mockTents[0], _id: 't3', occupants: [{ name: 'Someone Else' } as any, null] } as any;
      component.toggleExpand(mockTents[0]);
      component.toggleExpand(other);
      expect(component.expandedTentId).toBe('t3');
    });

    it('toggleExpand() no-ops on a wholly-vacant tent', () => {
      component.toggleExpand(mockTents[1]); // SO1, 0 occupants
      expect(component.expandedTentId).toBeNull();
    });

    it('fetchTents() resets any expanded row', () => {
      component.toggleExpand(mockTents[0]);
      expect(component.expandedTentId).toBe('t1');
      component.fetchTents('event1');
      expect(component.expandedTentId).toBeNull();
    });
  });

  describe('edit', () => {
    it('startEdit() populates the edit form and sets editingTentId', () => {
      component.startEdit(mockTents[0]);
      expect(component.editingTentId).toBe('t1');
      expect(component.editForm.value).toEqual({ tent_no: 'SH1', capcity: 2 });
    });

    it('startEdit() closes any open occupant-detail row', () => {
      component.toggleExpand(mockTents[0]);
      component.startEdit(mockTents[0]);
      expect(component.expandedTentId).toBeNull();
    });

    it('cancelEdit() clears the editing state', () => {
      component.startEdit(mockTents[0]);
      component.cancelEdit();
      expect(component.editingTentId).toBeNull();
    });

    it('saveEdit() updates the tent and reloads', () => {
      component.startEdit(mockTents[0]);
      component.editForm.setValue({ tent_no: 'SH1-Renamed', capcity: 3 });
      accomodationServiceSpy.updateTent.and.returnValue(of({ ...mockTents[0], tent_no: 'SH1-Renamed', capcity: 3 } as any));

      component.saveEdit(mockTents[0]);

      expect(accomodationServiceSpy.updateTent).toHaveBeenCalledWith('t1', { tent_no: 'SH1-Renamed', capcity: 3 });
      expect(notificationSpy.openSucessSnackBar).toHaveBeenCalledWith('Tent updated');
      expect(component.editingTentId).toBeNull();
    });

    it('saveEdit() shows an error toast when the server rejects the update (e.g. capacity below occupancy)', () => {
      // capcity: 1 passes client-side Validators.min(1) — the rejection
      // being tested here is the server's, not the form's.
      component.startEdit(mockTents[0]);
      component.editForm.setValue({ tent_no: 'SH1', capcity: 1 });
      accomodationServiceSpy.updateTent.and.returnValue(throwError(() => ({ error: { message: "Capacity can't be less than the current occupant count (2)" } })));

      component.saveEdit(mockTents[0]);

      expect(notificationSpy.openErrorSnackBar).toHaveBeenCalledWith("Capacity can't be less than the current occupant count (2)");
    });
  });

  describe('deleteTent', () => {
    it('does nothing if the user cancels the confirm dialog', () => {
      spyOn(window, 'confirm').and.returnValue(false);
      component.deleteTent(mockTents[0]);
      expect(accomodationServiceSpy.deleteTent).not.toHaveBeenCalled();
    });

    it('deletes and reloads on confirm', () => {
      spyOn(window, 'confirm').and.returnValue(true);
      accomodationServiceSpy.deleteTent.and.returnValue(of({ message: 'Tent deleted successfully' }));

      component.deleteTent(mockTents[1]);

      expect(accomodationServiceSpy.deleteTent).toHaveBeenCalledWith('t2');
      expect(notificationSpy.openSucessSnackBar).toHaveBeenCalledWith('Tent deleted');
    });

    it('shows an error toast when blocked by occupancy', () => {
      spyOn(window, 'confirm').and.returnValue(true);
      accomodationServiceSpy.deleteTent.and.returnValue(throwError(() => ({ error: { message: "Can't delete a tent with 1 occupant(s) checked in — vacate them first" } })));

      component.deleteTent(mockTents[0]);

      expect(notificationSpy.openErrorSnackBar).toHaveBeenCalledWith("Can't delete a tent with 1 occupant(s) checked in — vacate them first");
    });
  });
});
