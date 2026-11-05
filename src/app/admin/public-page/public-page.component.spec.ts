import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { of, throwError } from 'rxjs';

import { PublicPageComponent } from './public-page.component';
import { AdminService, PublicPageSettings } from '../admin.service';
import { NotificationService } from '../../core/notification.service';
import { AppSelectComponent } from '../../shared/app-select/app-select.component';
import { AppOptionComponent } from '../../shared/app-select/app-option.component';

const settings = (over: Partial<PublicPageSettings> = {}): PublicPageSettings => ({
  enabled: false, event: null, showBeforeDays: 14, showAfterDays: 14, updatedAt: null, updatedBy: null,
  events: [{ _id: 'ev1', name: 'BiG 7.0', startDate: '2026-12-10', endDate: '2026-12-12' }],
  emergency: { contacts: [], note: '' }, helpTiles: [], helpIcons: ['info', 'support_agent'],
  sosEnabled: false, sosDepartments: [], departments: [{ _id: 'd1', name: 'Medical' }],
  stats: [], statIcons: ['groups', 'local_florist'],
  ...over
});

describe('PublicPageComponent', () => {
  let fixture: ComponentFixture<PublicPageComponent>;
  let component: PublicPageComponent;
  let adminSpy: jasmine.SpyObj<AdminService>;
  let notifySpy: jasmine.SpyObj<NotificationService>;

  const create = (s: PublicPageSettings) => {
    adminSpy.getPublicPage.and.returnValue(of(s));
    fixture = TestBed.createComponent(PublicPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  };

  beforeEach(async () => {
    adminSpy = jasmine.createSpyObj('AdminService', ['getPublicPage', 'savePublicPage']);
    notifySpy = jasmine.createSpyObj('NotificationService', ['openSucessSnackBar', 'openErrorSnackBar']);
    await TestBed.configureTestingModule({
      declarations: [PublicPageComponent, AppSelectComponent, AppOptionComponent],
      imports: [FormsModule],
      providers: [
        { provide: AdminService, useValue: adminSpy },
        { provide: NotificationService, useValue: notifySpy }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();
  });

  it('loads the settings: off, nothing to save yet', () => {
    create(settings());
    expect(component.loading).toBeFalse();
    expect(component.enabled).toBeFalse();
    expect(component.events.length).toBe(1);
    expect(component.canSave).toBeFalse();
    expect(fixture.nativeElement.textContent).toContain('Off');
  });

  it('needs an event before it can be switched on', () => {
    create(settings());
    component.setEnabled(true);
    expect(component.canSave).toBeFalse();
    component.eventId = 'ev1';
    expect(component.canSave).toBeTrue();
  });

  it('checks the day counts', () => {
    create(settings());
    component.showBeforeDays = 61;
    expect(component.daysValid).toBeFalse();
    component.showBeforeDays = 3;
    component.showAfterDays = null as any;
    expect(component.daysValid).toBeFalse();
    component.showAfterDays = 0;
    expect(component.daysValid).toBeTrue();
  });

  it('saves and shows the new state', () => {
    create(settings());
    const saved = settings({ enabled: true, event: { _id: 'ev1', name: 'BiG 7.0', active: true }, updatedBy: 'Sam Admin', updatedAt: '2026-11-05T10:00:00Z' });
    adminSpy.savePublicPage.and.returnValue(of(saved));
    component.setEnabled(true);
    component.eventId = 'ev1';
    component.save();
    expect(adminSpy.savePublicPage).toHaveBeenCalledWith({ enabled: true, event: 'ev1', showBeforeDays: 14, showAfterDays: 14,
      emergency: { contacts: [], note: '' }, helpTiles: [], sosEnabled: false, sosDepartments: [], stats: [] });
    expect(notifySpy.openSucessSnackBar).toHaveBeenCalledWith('Saved · public page is on');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('On · showing BiG 7.0');
    expect(component.dirty).toBeFalse();
  });

  it('shows the server message when saving fails', () => {
    create(settings());
    adminSpy.savePublicPage.and.returnValue(throwError(() => ({ error: { message: 'Only an active event can be shown on the public page' } })));
    component.eventId = 'ev1';
    component.save();
    expect(component.saveError).toBe('Only an active event can be shown on the public page');
    expect(component.saving).toBeFalse();
  });

  it('says it is off for now when the saved event is no longer active', () => {
    create(settings({ enabled: true, event: { _id: 'old', name: 'BiG 6.0', active: false }, events: [] }));
    expect(component.savedEventInactive).toBeTrue();
    expect(component.eventId).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('BiG 6.0 is no longer active');
  });

  it('shows an error when the settings cannot load', () => {
    adminSpy.getPublicPage.and.returnValue(throwError(() => new Error('down')));
    fixture = TestBed.createComponent(PublicPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    expect(component.loadError).toContain('Could not load');
  });

  describe('emergency contacts and help tiles (PH4a)', () => {
    it('loads them; editing makes the page saveable', () => {
      create(settings({ emergency: { contacts: [{ label: 'Line', phone: '112233' }], note: 'Stay calm' }, helpTiles: [{ icon: 'info', title: 'FAQs', text: '' }] }));
      expect(component.contacts.length).toBe(1);
      expect(component.tiles.length).toBe(1);
      expect(component.dirty).toBeFalse();
      component.note = 'Stay where you are';
      expect(component.dirty).toBeTrue();
    });

    it('up to 3 contacts; the chosen one moves first as main line', () => {
      create(settings());
      component.addContact(); component.addContact(); component.addContact(); component.addContact();
      expect(component.contacts.length).toBe(3);
      component.contacts[0].label = 'A'; component.contacts[1].label = 'B';
      component.makeMain(1);
      expect(component.contacts.map(c => c.label)).toEqual(['B', 'A', '']);
    });

    it('checks names, phones and tile titles before saving', () => {
      create(settings());
      component.addContact();
      expect(component.infoProblem).toContain('needs a name');
      component.contacts[0].label = 'Line';
      component.contacts[0].phone = 'call me';
      expect(component.infoProblem).toContain('digits');
      component.contacts[0].phone = '+91 98765 43210';
      expect(component.infoProblem).toBeNull();
      component.addTile();
      expect(component.infoProblem).toContain('help tile needs a title');
      component.tiles[0].title = 'Helpdesk';
      expect(component.infoProblem).toBeNull();
      component.addTile(); component.addTile(); component.addTile(); component.addTile();
      expect(component.tiles.length).toBe(4);
    });

    it('sends them trimmed with the rest', () => {
      create(settings());
      adminSpy.savePublicPage.and.returnValue(of(settings()));
      component.eventId = 'ev1';
      component.addContact();
      component.contacts[0] = { label: ' Line ', phone: ' 112233 ' };
      component.addTile();
      component.tiles[0] = { icon: 'support_agent', title: ' Helpdesk ', text: ' Gate 1 ' };
      component.save();
      expect(adminSpy.savePublicPage).toHaveBeenCalledWith(jasmine.objectContaining({
        emergency: { contacts: [{ label: 'Line', phone: '112233' }], note: '' },
        helpTiles: [{ icon: 'support_agent', title: 'Helpdesk', text: 'Gate 1' }]
      }));
    });
  });

  describe('SOS switch and departments (PH4b)', () => {
    it('is off by default; switching on and picking departments makes it saveable and is sent', () => {
      create(settings());
      expect(component.sosEnabled).toBeFalse();
      component.sosEnabled = true;
      component.toggleSosDept('d1');
      expect(component.dirty).toBeTrue();
      adminSpy.savePublicPage.and.returnValue(of(settings({ sosEnabled: true, sosDepartments: ['d1'] })));
      component.save();
      expect(adminSpy.savePublicPage).toHaveBeenCalledWith(jasmine.objectContaining({ sosEnabled: true, sosDepartments: ['d1'] }));
      expect(component.dirty).toBeFalse();
    });

    it('warns when on with no department picked', () => {
      create(settings());
      component.sosEnabled = true;
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Only Directors, Admins and Developers will get SOS alerts');
    });
  });

  describe('Through the years (PH6)', () => {
    it('editions with up to 4 numbers each, checked and sent trimmed', () => {
      create(settings());
      component.addEdition();
      expect(component.infoProblem).toContain('edition needs a name');
      component.stats[0].edition = ' BiG 2026 ';
      expect(component.infoProblem).toContain('each number needs a value');
      component.stats[0].items[0] = { value: ' 2,000 ', label: ' participants ', icon: 'groups' };
      expect(component.infoProblem).toBeNull();
      for (let i = 0; i < 5; i++) component.addStat(component.stats[0]);
      expect(component.stats[0].items.length).toBe(4);
      component.stats[0].items.splice(1);
      adminSpy.savePublicPage.and.returnValue(of(settings()));
      component.save();
      expect(adminSpy.savePublicPage).toHaveBeenCalledWith(jasmine.objectContaining({
        stats: [{ edition: 'BiG 2026', items: [{ value: '2,000', label: 'participants', icon: 'groups' }] }]
      }));
    });
  });
});
