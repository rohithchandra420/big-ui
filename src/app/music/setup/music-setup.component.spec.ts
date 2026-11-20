import { ComponentFixture, TestBed, fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject, of } from 'rxjs';
import { MusicSetupComponent } from './music-setup.component';
import { SlidePanelComponent } from '../../shared/slide-panel/slide-panel.component';
import { EventService } from '../../core/event.service';
import { NotificationService } from '../../core/notification.service';
import { ConfirmationService } from '../../shared/confirm-dialog/confirmation.service';
import { MusicService } from '../music.service';
import { MusicData } from '../music.model';

const data = (extra: Partial<MusicData> = {}): MusicData => ({
  canEdit: true, canManage: true,
  stages: [
    { _id: 'st2', name: 'Willow Tent', notes: '', area: null, amenities: [], extraAmenities: [], slotCount: 0 },
    { _id: 'st1', name: 'Riverside Stage', notes: 'generator behind', area: { _id: 'ar1', name: 'Meadow' }, amenities: ['power', 'sound'], extraAmenities: ['Piano'], slotCount: 3 }
  ],
  acts: [{ _id: 'a1', name: 'The Saltmarsh Choir', genre: 'Folk', contactName: 'Oren Vale', contactPhone: '98765', notes: '', slotCount: 1 }],
  slots: [],
  ...extra
});

describe('MusicSetupComponent', () => {
  let fixture: ComponentFixture<MusicSetupComponent>;
  let component: MusicSetupComponent;
  let service: jasmine.SpyObj<MusicService>;
  let confirm: jasmine.SpyObj<ConfirmationService>;
  let current: MusicData;

  beforeEach(async () => {
    current = data();
    service = jasmine.createSpyObj('MusicService', ['load', 'stageAreas', 'addStage', 'updateStage', 'removeStage', 'addAct', 'updateAct', 'removeAct']);
    service.load.and.callFake(() => Promise.resolve(current));
    service.stageAreas.and.returnValue(Promise.resolve([
      { _id: 'ar1', name: 'Meadow', usedBy: { _id: 'st1', name: 'Riverside Stage' } },
      { _id: 'ar2', name: 'Hilltop', usedBy: null }
    ]));
    service.addStage.and.returnValue(Promise.resolve({} as any));
    service.updateStage.and.returnValue(Promise.resolve({} as any));
    service.addAct.and.returnValue(Promise.resolve({} as any));
    service.removeAct.and.returnValue(Promise.resolve({ deleted: true }));
    confirm = jasmine.createSpyObj('ConfirmationService', ['confirm']);
    await TestBed.configureTestingModule({
      declarations: [MusicSetupComponent, SlidePanelComponent],
      imports: [FormsModule],
      providers: [
        { provide: EventService, useValue: { activeEvent: new BehaviorSubject<any>({ _id: 'e1', name: 'BiG 7.0' }) } },
        { provide: NotificationService, useValue: jasmine.createSpyObj('NotificationService', ['openSucessSnackBar', 'openErrorSnackBar']) },
        { provide: ConfirmationService, useValue: confirm },
        { provide: MusicService, useValue: service }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();
    fixture = TestBed.createComponent(MusicSetupComponent);
    component = fixture.componentInstance;
  });

  const start = () => { fixture.detectChanges(); flushMicrotasks(); fixture.detectChanges(); };

  it('lists stages sorted by name and acts', fakeAsync(() => {
    start();
    const rows = Array.from(fixture.nativeElement.querySelectorAll('.mu-row')) as HTMLElement[];
    expect(rows.length).toBe(3);
    expect(rows[0].textContent).toContain('Riverside Stage');
    expect(rows[1].textContent).toContain('Willow Tent');
    expect(rows[2].textContent).toContain('The Saltmarsh Choir');
  }));

  it('a stage offers only free Stage areas (and its own), and saves the link', fakeAsync(() => {
    start();
    component.openStage(null);
    expect(component.freeAreas.map(a => a._id)).toEqual(['ar2']);
    component.saveStage();
    expect(component.formError).toBe('Give the stage a name.');
    component.stageForm = { name: ' Hill Stage ', area: 'ar2', notes: '', amenities: [], extraAmenities: [] };
    component.saveStage();
    flushMicrotasks();
    expect(service.addStage).toHaveBeenCalledWith('e1', { name: 'Hill Stage', area: 'ar2', notes: '', amenities: [], extraAmenities: [] });
    expect(component.mode).toBe('closed');

    component.openStage(current.stages[1]);
    expect(component.freeAreas.map(a => a._id)).toEqual(['ar1', 'ar2']);
    expect(component.stageForm.area).toBe('ar1');
  }));

  it('stage amenities: chips toggle in list order, extras added / removed, and saved (2026-11-20)', fakeAsync(() => {
    start();
    component.openStage(current.stages[1]);
    expect(component.stageForm.amenities).toEqual(['power', 'sound']);
    component.toggleAmenity('wheelchair');
    component.toggleAmenity('power');
    component.toggleAmenity('lights');
    expect(component.stageForm.amenities).toEqual(['sound', 'lights', 'wheelchair']);   // list order
    component.extraDraft = ' fog machine ';
    component.addExtra();
    component.extraDraft = 'PIANO';                  // a duplicate in any case is ignored
    component.addExtra();
    expect(component.stageForm.extraAmenities).toEqual(['Piano', 'fog machine']);
    component.removeExtra('Piano');
    component.extraDraft = 'Hammock';                // typed, not entered: still saved
    component.saveStage();
    flushMicrotasks();
    expect(service.updateStage).toHaveBeenCalledWith('st1', jasmine.objectContaining({
      amenities: ['sound', 'lights', 'wheelchair'], extraAmenities: ['fog machine', 'Hammock']
    }));
  }));

  it('at most 5 other amenities', fakeAsync(() => {
    start();
    component.openStage(null);
    for (const x of ['a', 'b', 'c', 'd', 'e', 'f']) { component.extraDraft = x; component.addExtra(); }
    expect(component.stageForm.extraAmenities.length).toBe(5);
    expect(component.formError).toContain('Up to 5');
  }));

  it('the Stages table shows the amenities (icons + extras), and both tables are full width', fakeAsync(() => {
    start();
    const cell = fixture.nativeElement.querySelector('.mu-row .mu-am-cell') as HTMLElement;   // Riverside Stage (sorted first)
    expect(cell.querySelectorAll('.mu-am').length).toBe(3);
    expect(cell.textContent).toContain('Sound system');
    expect(cell.textContent).toContain('Piano');
    const tables = Array.from(fixture.nativeElement.querySelectorAll('table')) as HTMLElement[];
    expect(tables.length).toBe(2);
    expect(tables.every(t => t.classList.contains('tbl'))).toBeTrue();
  }));

  it('adds and deletes an act', fakeAsync(() => {
    confirm.confirm.and.returnValue(of(true));
    start();
    component.openAct(null);
    component.actForm.name = 'Copper Lanterns';
    component.actForm.genre = 'Indie';
    component.saveAct();
    flushMicrotasks();
    expect(service.addAct).toHaveBeenCalledWith('e1', { name: 'Copper Lanterns', genre: 'Indie', contactName: '', contactPhone: '', notes: '' });
    component.removeAct(current.acts[0]);
    flushMicrotasks();
    expect(service.removeAct).toHaveBeenCalledWith('a1');
  }));

  it('view-only: no Add buttons, and a row opens its details instead of the form', fakeAsync(() => {
    current = data({ canEdit: false, canManage: false });
    start();
    expect(fixture.nativeElement.textContent).not.toContain('Add act');
    expect(fixture.nativeElement.textContent).not.toContain('Add stage');
    component.openAct(null);
    expect(component.mode).toBe('closed');
    component.openAct(current.acts[0]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.mu-dl').textContent).toContain('Oren Vale');
    expect(fixture.nativeElement.querySelector('#mu-ac-name')).toBeNull();
  }));

  it('music:write without manage: acts yes, stages read-only', fakeAsync(() => {
    current = data({ canEdit: true, canManage: false });
    start();
    expect(fixture.nativeElement.textContent).toContain('Add act');
    expect(fixture.nativeElement.textContent).not.toContain('Add stage');
    component.openStage(null);
    expect(component.mode).toBe('closed');
  }));
});
