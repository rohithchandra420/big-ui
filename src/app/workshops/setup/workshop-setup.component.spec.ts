import { ComponentFixture, TestBed, fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';
import { WorkshopSetupComponent } from './workshop-setup.component';
import { EventService } from '../../core/event.service';
import { WorkshopService } from '../workshop.service';
import { WorkshopSetup } from '../workshops.model';

const setupData = (): WorkshopSetup => ({
  venues: [
    { _id: 'v1', event: 'e1', name: 'Bamboo Dome', capacity: 40, amenities: 'Mats, shade', area: { _id: 'a1', name: 'Craft Lawn' }, notes: '', sessionCount: 2 },
    { _id: 'v2', event: 'e1', name: 'River Deck', capacity: 25, amenities: '', area: null, notes: '', sessionCount: 0 }
  ],
  workshops: [
    { _id: 'w1', event: 'e1', title: 'Hand Drumming', category: { _id: 'c2', name: 'Music', colour: '#7c3aed', icon: 'music_note' },
      description: '', facilitators: ['Ravi Kannan'], itemsRequired: '', ageLimit: '', language: 'English', bringYourOwn: '', notes: '', sessionCount: 1 }
  ],
  categories: [
    { _id: 'c1', name: 'Art', colour: '#ea580c', icon: 'palette', workshopCount: 0 },
    { _id: 'c2', name: 'Music', colour: '#7c3aed', icon: 'music_note', workshopCount: 1 }
  ],
  workshopAreas: [{ _id: 'a1', name: 'Craft Lawn' }],
  colours: ['#7c3aed'],
  canPlan: true,
  canManage: true,
  canRun: true
});

describe('WorkshopSetupComponent', () => {
  let fixture: ComponentFixture<WorkshopSetupComponent>;
  let component: WorkshopSetupComponent;
  let activeEvent: BehaviorSubject<any>;
  let service: jasmine.SpyObj<WorkshopService>;
  let router: jasmine.SpyObj<Router>;
  let qp: Record<string, string>;

  beforeEach(async () => {
    activeEvent = new BehaviorSubject<any>({ _id: 'e1', name: 'BiG 7.0', status: 'active' });
    service = jasmine.createSpyObj('WorkshopService', ['getSetup']);
    service.getSetup.and.callFake(() => Promise.resolve(setupData()));
    router = jasmine.createSpyObj('Router', ['navigate']);
    qp = {};

    await TestBed.configureTestingModule({
      declarations: [WorkshopSetupComponent],
      imports: [FormsModule],
      providers: [
        { provide: EventService, useValue: { activeEvent } },
        { provide: WorkshopService, useValue: service },
        { provide: Router, useValue: router },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: (k: string) => qp[k] ?? null, get keys() { return Object.keys(qp); } } } } }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();

    fixture = TestBed.createComponent(WorkshopSetupComponent);
    component = fixture.componentInstance;
  });

  const start = () => { fixture.detectChanges(); flushMicrotasks(); fixture.detectChanges(); };
  const rows = () => fixture.nativeElement.querySelectorAll('table.tbl tbody tr') as NodeListOf<HTMLElement>;

  it('loads the setup for the event selected in the sidebar and lists venues first', fakeAsync(() => {
    start();
    expect(service.getSetup).toHaveBeenCalledWith('e1');
    expect(fixture.nativeElement.querySelector('.page-ph-sub').textContent).toContain('BiG 7.0');
    expect(rows().length).toBe(2);
    expect(rows()[0].textContent).toContain('Craft Lawn');
  }));

  it('the stat tiles switch the list', fakeAsync(() => {
    start();
    const tiles = fixture.nativeElement.querySelectorAll('.stat.tap') as NodeListOf<HTMLElement>;
    tiles[1].click();
    fixture.detectChanges();
    expect(rows().length).toBe(1);
    expect(rows()[0].textContent).toContain('Hand Drumming');
    expect(fixture.nativeElement.querySelector('.page-ph .btn-cta').textContent).toContain('Add workshop');

    tiles[2].click();
    fixture.detectChanges();
    expect(rows().length).toBe(2);
  }));

  it('a workshop:manage grant gets no Add button on any list', fakeAsync(() => {
    service.getSetup.and.callFake(() => Promise.resolve({ ...setupData(), canManage: false }));
    start();
    for (const tab of ['venue', 'workshop', 'category'] as const) {
      component.setTab(tab);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.page-ph .btn-cta')).toBeNull();
    }
  }));

  it('search filters the current list', fakeAsync(() => {
    start();
    component.search = 'river';
    component.applySearch();
    fixture.detectChanges();
    expect(rows().length).toBe(1);
    expect(rows()[0].textContent).toContain('River Deck');
  }));

  it('a row opens the side panel; Add opens an empty one for the current list', fakeAsync(() => {
    start();
    rows()[0].click();
    expect(component.panelOpen).toBeTrue();
    expect(component.panelItem?._id).toBe('v1');

    component.closePanel();
    component.setTab('category');
    component.openAdd();
    expect(component.panelKind).toBe('category');
    expect(component.panelItem).toBeNull();
  }));

  it('after a save, reloads and shows the saved item', fakeAsync(() => {
    start();
    component.openItem('venue', component.venues[1]);
    component.onChanged('v2');
    flushMicrotasks();
    expect(service.getSetup).toHaveBeenCalledTimes(2);
    expect(component.panelItem?._id).toBe('v2');
  }));

  it('asks to pick an event when none is selected', fakeAsync(() => {
    activeEvent.next(null);
    start();
    expect(service.getSetup).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('.empty-state').textContent).toContain('Pick an event');
  }));

  it('back from the Venue Map: reopens the kept venue form with the new area selected', fakeAsync(() => {
    sessionStorage.setItem('workshopVenueDraft', JSON.stringify(
      { eventId: 'e1', venueId: null, values: { name: 'Pine Grove', capacity: 30, area: '', amenities: '', notes: '' } }));
    qp = { venueArea: 'a9' };
    component.setTab('category');
    start();
    expect(component.tab).toBe('venue');
    expect(component.panelOpen).toBeTrue();
    expect(component.panelItem).toBeNull();
    expect(component.panelDraft!.values).toEqual(jasmine.objectContaining({ name: 'Pine Grove', area: 'a9' }));
    expect(sessionStorage.getItem('workshopVenueDraft')).toBeNull();
    expect(router.navigate).toHaveBeenCalled(); // clears ?venueArea from the address
  }));

  it('ignores a kept form from another event', fakeAsync(() => {
    sessionStorage.setItem('workshopVenueDraft', JSON.stringify(
      { eventId: 'other', venueId: null, values: { name: 'X', capacity: 1, area: '', amenities: '', notes: '' } }));
    start();
    expect(component.panelOpen).toBeFalse();
    expect(sessionStorage.getItem('workshopVenueDraft')).toBeNull();
  }));
});
