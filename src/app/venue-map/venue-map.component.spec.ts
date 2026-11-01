import { ComponentFixture, TestBed, fakeAsync, flush } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { BehaviorSubject, of } from 'rxjs';
import { VenueMapComponent } from './venue-map.component';
import { LocationService, VenueArea, VenueLocation } from './location.service';
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

  const BOUNDARY: [number, number][] = [[12.96, 77.58], [12.96, 77.60], [12.98, 77.60], [12.98, 77.58]];
  const area = (id: string, extra: Partial<VenueArea> = {}): VenueArea => ({
    _id: id, event: 'ev1', name: `Area ${id}`, kind: 'workshop_area', shape: 'polygon',
    points: [[12.965, 77.585], [12.965, 77.595], [12.975, 77.595]], department: null, notes: '', canEdit: true, ...extra
  });

  function setup(opts: { role?: string; canAdd?: boolean; canImport?: boolean; locations?: VenueLocation[];
                  areas?: VenueArea[]; canDraw?: boolean; canDrawBoundary?: boolean; draw?: string } = {}) {
    svc = {
      list: jasmine.createSpy('list').and.resolveTo({
        locations: opts.locations ?? [loc('a', { name: 'Main Stage', type: 'stage' }), loc('b', { name: 'Water Station 1', canEdit: false })],
        canAdd: opts.canAdd ?? true, canImport: opts.canImport ?? true
      }),
      myDepartments: jasmine.createSpy('myDepartments').and.resolveTo([{ _id: 'ALL', name: 'All Departments' }, { _id: 'd-ops', name: 'Operations' }, { _id: 'd-food', name: 'Hospitality' }]),
      create: jasmine.createSpy('create').and.callFake((_e: string, input: any) => Promise.resolve({ ...loc('new'), ...input })),
      update: jasmine.createSpy('update').and.callFake((id: string, input: any) => Promise.resolve({ ...loc(id), ...input })),
      remove: jasmine.createSpy('remove').and.resolveTo(),
      importMany: jasmine.createSpy('importMany').and.resolveTo({ created: 2 }),
      listAreas: jasmine.createSpy('listAreas').and.resolveTo({ areas: opts.areas ?? [], canDraw: opts.canDraw ?? true, canDrawBoundary: opts.canDrawBoundary ?? true }),
      createArea: jasmine.createSpy('createArea').and.callFake((_e: string, input: any) => Promise.resolve({ ...area('new'), ...input })),
      updateArea: jasmine.createSpy('updateArea').and.callFake((id: string, input: any) => Promise.resolve({ ...area(id), ...input })),
      removeArea: jasmine.createSpy('removeArea').and.resolveTo(),
      importAreas: jasmine.createSpy('importAreas').and.resolveTo({ created: 1 })
    };
    event$ = new BehaviorSubject<any>({ _id: 'ev1', name: 'BiG 7.0', status: 'active' });
    auth = { currentUser: { role: opts.role ?? 'ADMIN', departments: [{ department: { _id: 'd-food', name: 'Hospitality' } }] } };
    snack = jasmine.createSpyObj('NotificationService', ['openSucessSnackBar', 'openErrorSnackBar']);
    confirm = jasmine.createSpyObj('ConfirmationService', ['confirm']);
    confirm.confirm.and.returnValue(of(true));
    TestBed.configureTestingModule({
      declarations: [VenueMapComponent, AppSelectComponent, AppOptionComponent],
      imports: [FormsModule, MatIconModule, RouterTestingModule],
      providers: [
        { provide: LocationService, useValue: svc },
        { provide: EventService, useValue: { activeEvent: event$ } },
        { provide: AuthService, useValue: auth },
        { provide: NotificationService, useValue: snack },
        { provide: ConfirmationService, useValue: confirm },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: (k: string) => k === 'draw' ? (opts.draw ?? null) : null } } } }
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
    setup({ role: 'VOL', canAdd: false, canImport: false, canDraw: false, canDrawBoundary: false, locations: [loc('a', { canEdit: false })] }); settle();
    expect(btn('Add location')).toBeUndefined();
    expect(btn('Use my location')).toBeUndefined();
    expect(btn('Import KML')).toBeUndefined();
    expect(el().querySelector('.vm-goto')).toBeNull();   // view-only: no Go to box
    expect(svc.myDepartments).not.toHaveBeenCalled();
    component.select(component.locations[0]); fixture.detectChanges();
    expect(btn('Edit')).toBeUndefined();
    expect(btn('Directions')).toBeTruthy();
    expect(btn('Street View')).toBeTruthy();
  }));

  it('Undo removes the last point while drawing, but never the only one', fakeAsync(() => {
    setup(); settle();
    const handler = { _markers: [1, 2, 3], _removeLastVertex: jasmine.createSpy('remove').and.callFake(() => handler._markers.pop()) };
    (component as any).map = { pm: { Draw: { Line: handler } } };
    component.drawing = 'line';
    component.undoPoint(); component.undoPoint(); component.undoPoint();
    expect(handler._removeLastVertex).toHaveBeenCalledTimes(2);
    expect(handler._markers.length).toBe(1);
    handler._markers.push(2);
    component.onKey(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true }));
    expect(handler._removeLastVertex).toHaveBeenCalledTimes(3);
    (component as any).map = undefined;
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
    expect(component.imports!.map(i => i.type)).toEqual(['water', 'gate', 'other']);
    expect(el().querySelectorAll('.vm-imp').length).toBe(3);
    component.imports![1].include = false;
    component.importSelected(); settle();
    expect(svc.importMany).toHaveBeenCalledWith('ev1', [
      { name: 'Water Station 4', type: 'water', lat: 12.97, lng: 77.59 },
      { name: 'Hall C', type: 'other', lat: 12.99, lng: 77.61 }
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

  // ── Areas and lines (A2) ──
  /** A stand-in for the shape Geoman drew (no real map in unit tests). */
  const fakeShape = (pts: [number, number][]) => ({
    getLatLngs: () => [pts.map(([lat, lng]) => ({ lat, lng }))], remove() {}, on() {}, pm: { enable() {}, disable() {} }
  });

  it('lists areas with their size, and shows which zone a location is in or that it is outside the boundary', fakeAsync(() => {
    setup({
      locations: [loc('in', { lat: 12.968, lng: 77.592, name: 'Inside' }), loc('out', { lat: 12.99, lng: 77.61, name: 'Far away' })],
      areas: [area('b', { kind: 'boundary', name: 'Festival boundary', points: BOUNDARY }), area('z', { name: 'Workshop area A' })]
    }); settle();
    expect(el().textContent).toContain('Areas & lines (2)');
    expect(component.areaSize.get('b')).toMatch(/ha$/);
    expect(component.locInfo.get('in')).toEqual({ zones: ['Workshop area A'], outside: false });
    expect(component.locInfo.get('out')!.outside).toBeTrue();
    component.select(component.locations.find(l => l._id === 'out')!); fixture.detectChanges();
    expect(el().textContent).toContain('Outside the festival boundary');
  }));

  it('admins get Draw boundary while there is none; Team Leads never do', fakeAsync(() => {
    setup(); settle();
    expect(btn('Draw boundary')).toBeTruthy();
    expect(btn('Draw area')).toBeTruthy();
    component.canDrawBoundary = false; fixture.detectChanges();
    expect(btn('Draw boundary')).toBeUndefined();
    expect(btn('Draw line')).toBeTruthy();
  }));

  it('a Team Lead cannot start drawing before the boundary exists', fakeAsync(() => {
    setup({ role: 'TL', canDrawBoundary: false }); settle();
    component.startDraw('area');
    expect(component.drawing).toBeNull();
    expect(snack.openErrorSnackBar).toHaveBeenCalledWith(jasmine.stringMatching('boundary first'));
  }));

  it('saves a drawn area with its corners and kind', fakeAsync(() => {
    setup({ areas: [area('b', { kind: 'boundary', points: BOUNDARY })] }); settle();
    component.startDraw('area');
    expect(component.drawing).toBe('area');
    component.onDrawn(fakeShape([[12.965, 77.585], [12.965, 77.59], [12.97, 77.59]]) as any); fixture.detectChanges();
    expect(component.areaForm).toEqual(jasmine.objectContaining({ kind: 'workshop_area', shape: 'polygon' }));
    component.areaForm!.name = 'Pottery yard';
    component.areaForm!.kind = 'washroom';
    component.saveArea(); settle();
    expect(svc.createArea).toHaveBeenCalledWith('ev1', jasmine.objectContaining({
      name: 'Pottery yard', kind: 'washroom', points: [[12.965, 77.585], [12.965, 77.59], [12.97, 77.59]]
    }));
  }));

  it('a Team Lead is told to keep a shape inside the boundary before it is sent', fakeAsync(() => {
    setup({ role: 'TL', canDrawBoundary: false, areas: [area('b', { kind: 'boundary', points: BOUNDARY, canEdit: false })] }); settle();
    component.startDraw('line');
    component.onDrawn(fakeShape([[12.965, 77.585], [12.99, 77.61]]) as any);
    component.areaForm!.name = 'Path';
    component.saveArea(); settle();
    expect(component.formError).toContain('inside the festival boundary');
    expect(svc.createArea).not.toHaveBeenCalled();
  }));

  it('a new boundary is named for you and has no kind or department to pick', fakeAsync(() => {
    setup(); settle();
    component.startDraw('boundary');
    component.onDrawn(fakeShape(BOUNDARY) as any); fixture.detectChanges();
    expect(component.areaForm).toEqual(jasmine.objectContaining({ name: 'Festival boundary', kind: 'boundary', department: null }));
    expect(el().textContent).not.toContain('Department responsible');
  }));

  it('deletes the boundary after a confirmation that warns about Team Leads', fakeAsync(() => {
    setup({ areas: [area('b', { kind: 'boundary', points: BOUNDARY })] }); settle();
    component.removeArea(component.areas[0]); settle();
    expect(confirm.confirm).toHaveBeenCalledWith(jasmine.objectContaining({ title: 'Delete the festival boundary?', danger: true }));
    expect(svc.removeArea).toHaveBeenCalledWith('b');
  }));

  it('opened from Admin › Events (?draw=boundary): starts drawing when there is none', fakeAsync(() => {
    setup({ draw: 'boundary' }); settle();
    expect(component.drawing).toBe('boundary');
  }));

  it('opened from Admin › Events when a boundary exists: shows it', fakeAsync(() => {
    setup({ draw: 'boundary', areas: [area('b', { kind: 'boundary', points: BOUNDARY })] }); settle();
    expect(component.drawing).toBeNull();
    expect(component.selectedArea?._id).toBe('b');
  }));

  it('KML import also brings areas and lines; a second boundary starts as a plain area', fakeAsync(() => {
    setup({ areas: [area('b', { kind: 'boundary', points: BOUNDARY })] }); settle();
    const kml = '<kml><Placemark><name>Festival boundary</name><Polygon><outerBoundaryIs><LinearRing>' +
      '<coordinates>77.58,12.96 77.6,12.96 77.6,12.98 77.58,12.96</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>' +
      '<Placemark><name>North fence</name><LineString><coordinates>77.58,12.97 77.59,12.97</coordinates></LineString></Placemark></kml>';
    component.onKmlFile({ files: [{ text: () => Promise.resolve(kml) }], value: 'x' } as any); settle();
    expect(component.importShapes.map(sh => sh.kind)).toEqual(['other_area', 'fence']);
    component.importSelected(); settle();
    expect(svc.importAreas).toHaveBeenCalledWith('ev1', [
      jasmine.objectContaining({ name: 'Festival boundary', kind: 'other_area' }),
      jasmine.objectContaining({ name: 'North fence', kind: 'fence' })
    ]);
    expect(svc.importMany).not.toHaveBeenCalled();
  }));
});
