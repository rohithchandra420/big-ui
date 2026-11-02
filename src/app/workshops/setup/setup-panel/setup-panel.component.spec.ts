import { ComponentFixture, TestBed, fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { NO_ERRORS_SCHEMA, SimpleChange } from '@angular/core';
import { of } from 'rxjs';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/auth.service';
import { WorkshopSetupPanelComponent } from './setup-panel.component';
import { WorkshopService } from '../../workshop.service';
import { NotificationService } from '../../../core/notification.service';
import { ConfirmationService } from '../../../shared/confirm-dialog/confirmation.service';
import { WorkshopSetup, WorkshopVenue } from '../../workshops.model';
import { AppSelectComponent } from '../../../shared/app-select/app-select.component';
import { AppOptionComponent } from '../../../shared/app-select/app-option.component';

const setup: WorkshopSetup = {
  venues: [], workshops: [], workshopAreas: [{ _id: 'a1', name: 'Craft Lawn' }],
  categories: [{ _id: 'c1', name: 'Music', colour: '#7c3aed', icon: 'music_note' }],
  colours: ['#7c3aed', '#2563eb'], canPlan: true, canManage: true, canRun: true
};
const venue: WorkshopVenue = {
  _id: 'v1', event: 'e1', name: 'Bamboo Dome', capacity: 40, amenities: 'Mats', area: { _id: 'a1', name: 'Craft Lawn' }, notes: '', sessionCount: 0
};

describe('WorkshopSetupPanelComponent', () => {
  let fixture: ComponentFixture<WorkshopSetupPanelComponent>;
  let component: WorkshopSetupPanelComponent;
  let service: jasmine.SpyObj<WorkshopService>;
  let notify: jasmine.SpyObj<NotificationService>;
  let confirm: jasmine.SpyObj<ConfirmationService>;
  let router: jasmine.SpyObj<Router>;
  let auth: { currentUser: any; inDepartmentKey: (u: any, k: string) => boolean };

  beforeEach(async () => {
    service = jasmine.createSpyObj('WorkshopService',
      ['addVenue', 'updateVenue', 'deleteVenue', 'addWorkshop', 'updateWorkshop', 'deleteWorkshop', 'addCategory', 'updateCategory', 'deleteCategory']);
    notify = jasmine.createSpyObj('NotificationService', ['openSucessSnackBar', 'openErrorSnackBar']);
    confirm = jasmine.createSpyObj('ConfirmationService', ['confirm']);
    router = jasmine.createSpyObj('Router', ['navigate']);
    auth = {
      currentUser: { role: 'ADMIN' },
      inDepartmentKey: (u: any, k: string) => (u.departments || []).some((d: any) => d.department?.key === k)
    };

    await TestBed.configureTestingModule({
      declarations: [WorkshopSetupPanelComponent, AppSelectComponent, AppOptionComponent],
      imports: [ReactiveFormsModule],
      providers: [
        { provide: WorkshopService, useValue: service },
        { provide: NotificationService, useValue: notify },
        { provide: ConfirmationService, useValue: confirm },
        { provide: Router, useValue: router },
        { provide: AuthService, useValue: auth }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();

    fixture = TestBed.createComponent(WorkshopSetupPanelComponent);
    component = fixture.componentInstance;
    component.setup = setup;
    component.eventId = 'e1';
  });

  const open = (kind: any, item: any) => {
    component.kind = kind;
    component.item = item;
    component.ngOnChanges({ item: new SimpleChange(undefined, item, true), kind: new SimpleChange(undefined, kind, true) });
    fixture.detectChanges();
  };
  const el = () => fixture.nativeElement as HTMLElement;
  const actionLabels = () => Array.from(el().querySelectorAll('.panel-actions button')).map(b => b.textContent!.trim());

  it('shows a venue first, with Close · Delete · Edit (Close left, main action right)', () => {
    open('venue', venue);
    expect(component.mode).toBe('view');
    expect(el().querySelector('.panel-title')!.textContent).toContain('Bamboo Dome');
    expect(el().textContent).toContain('Show on map');
    expect(actionLabels()).toEqual(['Close', 'Delete', 'edit Edit']);
  });

  it('a workshop:manage grant: Edit / Delete on venues, but not on workshops or categories', () => {
    component.setup = { ...setup, canManage: false };
    open('venue', venue);
    expect(actionLabels()).toEqual(['Close', 'Delete', 'edit Edit']);
    open('category', { _id: 'c1', name: 'Music', colour: '#7c3aed', icon: 'music_note', workshopCount: 0 });
    expect(actionLabels()).toEqual(['Close']);
  });

  it('Delete is disabled while the venue has sessions', () => {
    open('venue', { ...venue, sessionCount: 2 });
    const del = Array.from(el().querySelectorAll('.panel-actions button')).find(b => b.textContent!.includes('Delete')) as HTMLButtonElement;
    expect(del.disabled).toBeTrue();
    expect(el().textContent).toContain('In use by 2 sessions');
  });

  it('adds a venue for the event, with no area when none is picked', fakeAsync(() => {
    const changed = spyOn(component.changed, 'emit');
    service.addVenue.and.returnValue(Promise.resolve({ ...venue, _id: 'v9' }));
    open('venue', null);
    expect(component.mode).toBe('create');
    component.form.patchValue({ name: ' River Deck ', capacity: '25' });
    component.save();
    flushMicrotasks();
    expect(service.addVenue).toHaveBeenCalledWith(jasmine.objectContaining({ event: 'e1', name: 'River Deck', capacity: 25, area: null }));
    expect(changed).toHaveBeenCalledWith('v9');
    expect(component.mode).toBe('view');
  }));

  it('does not save an invalid form', () => {
    open('venue', null);
    component.save();
    expect(service.addVenue).not.toHaveBeenCalled();
  });

  it('Edit → Cancel goes back to the details; Esc from the details closes', () => {
    const closed = spyOn(component.closed, 'emit');
    open('venue', venue);
    component.edit();
    expect(component.mode).toBe('edit');
    expect(component.form.get('area')!.value).toBe('a1');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(component.mode).toBe('view');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(closed).toHaveBeenCalled();
  });

  it('a workshop collects facilitator names (no duplicates, a typed name counts on save)', fakeAsync(() => {
    service.addWorkshop.and.returnValue(Promise.resolve({ _id: 'w1' } as any));
    open('workshop', null);
    component.form.patchValue({ title: 'Hand Drumming', category: 'c1' });
    component.facilitatorCtrl.setValue('Ravi Kannan');
    component.addFacilitator();
    component.facilitatorCtrl.setValue('ravi kannan');
    component.addFacilitator();
    component.facilitatorCtrl.setValue('Lena Ortiz');
    component.save();
    flushMicrotasks();
    expect(service.addWorkshop).toHaveBeenCalledWith(jasmine.objectContaining({
      event: 'e1', title: 'Hand Drumming', category: 'c1', facilitators: ['Ravi Kannan', 'Lena Ortiz']
    }));
  }));

  it('a new category starts with the first colour and can pick colour and icon', fakeAsync(() => {
    service.addCategory.and.returnValue(Promise.resolve({ _id: 'c9' } as any));
    open('category', null);
    expect(component.form.get('colour')!.value).toBe('#7c3aed');
    component.form.patchValue({ name: 'Wellness', colour: '#2563eb', icon: 'spa' });
    component.save();
    flushMicrotasks();
    expect(service.addCategory).toHaveBeenCalledWith({ name: 'Wellness', colour: '#2563eb', icon: 'spa' });
  }));

  it('deletes after confirming, then closes', fakeAsync(() => {
    const closed = spyOn(component.closed, 'emit');
    const changed = spyOn(component.changed, 'emit');
    confirm.confirm.and.returnValue(of(true));
    service.deleteVenue.and.returnValue(Promise.resolve({}));
    open('venue', venue);
    component.remove();
    flushMicrotasks();
    expect(service.deleteVenue).toHaveBeenCalledWith('v1');
    expect(changed).toHaveBeenCalledWith(null);
    expect(closed).toHaveBeenCalled();
  }));

  it('shows the server message when saving fails', fakeAsync(() => {
    service.addVenue.and.returnValue(Promise.reject({ error: { message: 'A venue with this name already exists for this event' } }));
    open('venue', null);
    component.form.patchValue({ name: 'Dome', capacity: 10 });
    component.save();
    flushMicrotasks();
    expect(notify.openErrorSnackBar).toHaveBeenCalledWith('A venue with this name already exists for this event');
    expect(component.mode).toBe('create');
  }));

  describe('Workshop area on the Venue Map', () => {
    afterEach(() => sessionStorage.removeItem('workshopVenueDraft'));

    it('"Draw a new Workshop area" keeps the form and opens the map on Workshop areas only', () => {
      open('venue', null);
      component.form.patchValue({ name: 'River Deck', capacity: 25, amenities: 'Shade' });
      component.openMap('new');
      const draft = JSON.parse(sessionStorage.getItem('workshopVenueDraft')!);
      expect(draft).toEqual({ eventId: 'e1', venueId: null, values: { name: 'River Deck', capacity: 25, area: '', amenities: 'Shade', notes: '' } });
      expect(router.navigate).toHaveBeenCalledWith(['/venue-map'], { queryParams: { focus: 'workshop', draw: 'new' } });
    });

    it('"Change this area" opens the picked area for editing', () => {
      open('venue', venue);
      component.edit();
      fixture.detectChanges();
      expect(el().textContent).toContain('Change this area on the map');
      component.openMap('change');
      expect(router.navigate).toHaveBeenCalledWith(['/venue-map'], { queryParams: { focus: 'workshop', area: 'a1', edit: '1' } });
      expect(JSON.parse(sessionStorage.getItem('workshopVenueDraft')!).venueId).toBe('v1');
    });

    it('a kept form comes back filled in, in edit / add mode', () => {
      component.draft = { eventId: 'e1', venueId: 'v1', values: { name: 'Big Dome', capacity: 60, area: 'a1', amenities: '', notes: '' } };
      open('venue', venue);
      expect(component.mode).toBe('edit');
      expect(component.form.getRawValue()).toEqual(jasmine.objectContaining({ name: 'Big Dome', capacity: 60, area: 'a1' }));
    });

    it('an area that no longer exists comes back as Not linked', () => {
      component.draft = { eventId: 'e1', venueId: null, values: { name: 'Dome', capacity: 10, area: 'gone', amenities: '', notes: '' } };
      open('venue', null);
      expect(component.mode).toBe('create');
      expect(component.form.get('area')!.value).toBe('');
    });

    it('the Workshop TL can draw from here; a TL of another department cannot', () => {
      auth.currentUser = { role: 'TL', departments: [{ department: { _id: 'd1', name: 'Classes', key: 'workshop' } }] };
      open('venue', null);
      expect(el().textContent).toContain('Draw a new Workshop area');

      auth.currentUser = { role: 'TL', departments: [{ department: { _id: 'd2', name: 'Operations', key: 'operations' } }] };
      fixture.detectChanges();
      expect(el().textContent).not.toContain('Draw a new Workshop area');
    });

    it('someone who plans only through a workshop:manage grant is asked to get it drawn', () => {
      auth.currentUser = { role: 'VOL', permissions: ['workshop:manage'] };
      open('venue', null);
      expect(el().textContent).not.toContain('Draw a new Workshop area');
      expect(el().textContent).toContain('ask the Workshop Team Lead or an admin');
    });
  });
});
