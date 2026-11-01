import { ComponentFixture, TestBed, fakeAsync, flush } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { BehaviorSubject, of } from 'rxjs';
import { VenueMapComponent } from './venue-map.component';
import { LocationService, VenueLocation } from './location.service';
import { EventService } from '../core/event.service';
import { AuthService } from '../core/auth.service';
import { NotificationService } from '../core/notification.service';
import { ConfirmationService } from '../shared/confirm-dialog/confirmation.service';
import { AppSelectComponent } from '../shared/app-select/app-select.component';
import { AppOptionComponent } from '../shared/app-select/app-option.component';

describe('VenueMapComponent', () => {
  let fixture: ComponentFixture<VenueMapComponent>;
  let component: VenueMapComponent;
  let svc: any;
  let snack: jasmine.SpyObj<NotificationService>;
  let confirm: jasmine.SpyObj<ConfirmationService>;
  let event$: BehaviorSubject<any>;
  let auth: any;
  const el = () => fixture.nativeElement as HTMLElement;
  const btn = (text: string) => Array.from(el().querySelectorAll('button, label, a')).find(b => b.textContent!.includes(text)) as HTMLElement | undefined;

  const loc = (id: string, extra: Partial<VenueLocation> = {}): VenueLocation => ({
    _id: id, event: 'ev1', name: `Place ${id}`, type: 'water', lat: 12.97, lng: 77.59,
    department: { _id: 'd-ops', name: 'Operations' }, notes: '', canEdit: true, ...extra
  });

  function setup(opts: { role?: string; canAdd?: boolean; canImport?: boolean; locations?: VenueLocation[] } = {}) {
    svc = {
      list: jasmine.createSpy('list').and.resolveTo({
        locations: opts.locations ?? [loc('a', { name: 'Main Stage', type: 'stage' }), loc('b', { name: 'Water Station 1', canEdit: false })],
        canAdd: opts.canAdd ?? true, canImport: opts.canImport ?? true
      }),
      myDepartments: jasmine.createSpy('myDepartments').and.resolveTo([{ _id: 'ALL', name: 'All Departments' }, { _id: 'd-ops', name: 'Operations' }, { _id: 'd-food', name: 'Hospitality' }]),
      create: jasmine.createSpy('create').and.callFake((_e: string, input: any) => Promise.resolve({ ...loc('new'), ...input })),
      update: jasmine.createSpy('update').and.callFake((id: string, input: any) => Promise.resolve({ ...loc(id), ...input })),
      remove: jasmine.createSpy('remove').and.resolveTo(),
      importMany: jasmine.createSpy('importMany').and.resolveTo({ created: 2 })
    };
    event$ = new BehaviorSubject<any>({ _id: 'ev1', name: 'BiG 7.0', status: 'active' });
    auth = { currentUser: { role: opts.role ?? 'ADMIN', departments: [{ department: { _id: 'd-food', name: 'Hospitality' } }] } };
    snack = jasmine.createSpyObj('NotificationService', ['openSucessSnackBar', 'openErrorSnackBar']);
    confirm = jasmine.createSpyObj('ConfirmationService', ['confirm']);
    confirm.confirm.and.returnValue(of(true));
    TestBed.configureTestingModule({
      declarations: [VenueMapComponent, AppSelectComponent, AppOptionComponent],
      imports: [FormsModule, MatIconModule],
      providers: [
        { provide: LocationService, useValue: svc },
        { provide: EventService, useValue: { activeEvent: event$ } },
        { provide: AuthService, useValue: auth },
        { provide: NotificationService, useValue: snack },
        { provide: ConfirmationService, useValue: confirm }
      ]
    });
    fixture = TestBed.createComponent(VenueMapComponent);
    component = fixture.componentInstance;
    // No real map in unit tests: Leaflet and its tiles are skipped; drawing is a no-op without a map.
    spyOn(component as any, 'initMap').and.resolveTo();
    fixture.detectChanges();
  }
  const settle = () => { flush(); fixture.detectChanges(); };

  it('lists the active event\'s locations with type filters and counts', fakeAsync(() => {
    setup(); settle();
    expect(svc.list).toHaveBeenCalledWith('ev1');
    const items = el().querySelectorAll('.vm-item');
    expect(items.length).toBe(2);
    expect(items[0].textContent).toContain('Main Stage');
    expect(el().querySelector('.page-ph-sub')!.textContent).toContain('BiG 7.0');
    // filtering out water hides Water Station 1
    component.toggleType('water'); fixture.detectChanges();
    expect(el().querySelectorAll('.vm-item').length).toBe(1);
  }));

  it('loads the departments once for adding, without the ALL pseudo-entry', fakeAsync(() => {
    setup(); settle();
    expect(component.departments.map(d => d._id)).toEqual(['d-ops', 'd-food']);
  }));

  it('a volunteer sees no add / import buttons and no Edit on a location', fakeAsync(() => {
    setup({ role: 'VOL', canAdd: false, canImport: false, locations: [loc('a', { canEdit: false })] }); settle();
    expect(btn('Add location')).toBeUndefined();
    expect(btn('Use my location')).toBeUndefined();
    expect(btn('Import KML')).toBeUndefined();
    expect(svc.myDepartments).not.toHaveBeenCalled();
    component.select(component.locations[0]); fixture.detectChanges();
    expect(btn('Edit')).toBeUndefined();
    expect(btn('Directions')).toBeTruthy();
    expect(btn('Street View')).toBeTruthy();
  }));

  it('Import KML is for admins only; Team Leads can still add', fakeAsync(() => {
    setup({ role: 'TL', canImport: false }); settle();
    expect(btn('Add location')).toBeTruthy();
    expect(btn('Import KML')).toBeUndefined();
  }));

  it('adds a location by tapping the map in Add mode', fakeAsync(() => {
    setup(); settle();
    component.toggleAdding();
    component.onMapClick(12.5, 77.5); fixture.detectChanges();
    expect(component.form).toEqual(jasmine.objectContaining({ lat: 12.5, lng: 77.5, department: null }));
    component.form!.name = '  Water Station 9 ';
    component.form!.type = 'water';
    component.save(); settle();
    expect(svc.create).toHaveBeenCalledWith('ev1', jasmine.objectContaining({ name: 'Water Station 9', type: 'water', lat: 12.5, lng: 77.5 }));
    expect(snack.openSucessSnackBar).toHaveBeenCalled();
    expect(component.form).toBeNull();
  }));

  it('a map tap does nothing outside Add mode', fakeAsync(() => {
    setup(); settle();
    component.onMapClick(1, 2);
    expect(component.form).toBeNull();
  }));

  it('needs a name, and a Team Lead\'s new location defaults to their home department', fakeAsync(() => {
    setup({ role: 'TL' }); settle();
    component.startNew(1, 2);
    expect(component.form!.department).toBe('d-food');
    component.save(); settle();
    expect(component.formError).toContain('name');
    expect(svc.create).not.toHaveBeenCalled();
  }));

  it('shows the server\'s message when saving is refused', fakeAsync(() => {
    setup(); settle();
    svc.create.and.rejectWith({ error: { message: 'Team Leads can only add locations for their own department' } });
    component.startNew(1, 2);
    component.form!.name = 'X';
    component.save(); settle();
    expect(component.formError).toContain('own department');
  }));

  it('edits an existing location', fakeAsync(() => {
    setup(); settle();
    component.startEdit(component.locations[0]);
    component.form!.notes = 'Behind the mess';
    component.save(); settle();
    expect(svc.update).toHaveBeenCalledWith('a', jasmine.objectContaining({ notes: 'Behind the mess', name: 'Main Stage' }));
  }));

  it('dragging a pin saves the new spot; while editing it only moves the form', fakeAsync(() => {
    setup(); settle();
    const a = component.locations[0];
    component.onDragEnd(a, 1.5, 2.5); settle();
    expect(svc.update).toHaveBeenCalledWith('a', { lat: 1.5, lng: 2.5 });

    svc.update.calls.reset();
    component.startEdit(a);
    component.onDragEnd(a, 3, 4);
    expect(svc.update).not.toHaveBeenCalled();
    expect(component.form).toEqual(jasmine.objectContaining({ lat: 3, lng: 4 }));
  }));

  it('deletes after confirming', fakeAsync(() => {
    setup(); settle();
    component.remove(component.locations[0]); settle();
    expect(confirm.confirm).toHaveBeenCalledWith(jasmine.objectContaining({ danger: true }));
    expect(svc.remove).toHaveBeenCalledWith('a');
  }));

  it('does not delete when the confirmation is cancelled', fakeAsync(() => {
    setup(); settle();
    confirm.confirm.and.returnValue(of(false));
    component.remove(component.locations[0]); settle();
    expect(svc.remove).not.toHaveBeenCalled();
  }));

  it('KML import shows a review list and imports only the ticked places', fakeAsync(() => {
    setup(); settle();
    const kml = `<kml><Placemark><name>Water Station 4</name><Point><coordinates>77.59,12.97</coordinates></Point></Placemark>
      <Placemark><name>Side Gate</name><Point><coordinates>77.6,12.98</coordinates></Point></Placemark>
      <Placemark><name>Hall C</name><Point><coordinates>77.61,12.99</coordinates></Point></Placemark></kml>`;
    // A stand-in for File whose text() resolves inside the test zone (a real File reads asynchronously).
    const input = { files: [{ text: () => Promise.resolve(kml) }], value: 'x' } as any;
    component.onKmlFile(input); settle();
    expect(component.imports!.map(i => i.type)).toEqual(['water', 'gate', 'workshop']);
    expect(el().querySelectorAll('.vm-imp').length).toBe(3);
    component.imports![1].include = false;
    component.importSelected(); settle();
    expect(svc.importMany).toHaveBeenCalledWith('ev1', [
      { name: 'Water Station 4', type: 'water', lat: 12.97, lng: 77.59 },
      { name: 'Hall C', type: 'workshop', lat: 12.99, lng: 77.61 }
    ]);
    expect(component.imports).toBeNull();
  }));

  it('says so when a KML file has no places', fakeAsync(() => {
    setup(); settle();
    component.onKmlFile({ files: [{ text: () => Promise.resolve('<kml></kml>') }], value: 'x' } as any); settle();
    expect(snack.openErrorSnackBar).toHaveBeenCalled();
    expect(component.imports).toBeNull();
  }));

  it('reloads for a new event and clears what was open', fakeAsync(() => {
    setup(); settle();
    component.select(component.locations[0]);
    event$.next({ _id: 'ev2', name: 'BiG Night', status: 'active' }); settle();
    expect(svc.list).toHaveBeenCalledWith('ev2');
    expect(component.selected).toBeNull();
  }));

  it('asks for an event when none is picked', fakeAsync(() => {
    setup(); settle();
    event$.next(null); settle();
    expect(el().textContent).toContain('Pick an event');
    expect(component.locations).toEqual([]);
  }));

  it('rejects bad Go to text', fakeAsync(() => {
    setup(); settle();
    component.gotoText = 'the big tree';
    component.goTo();
    expect(snack.openErrorSnackBar).toHaveBeenCalled();
  }));
});
