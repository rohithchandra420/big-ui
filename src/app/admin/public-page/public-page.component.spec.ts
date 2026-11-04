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
    expect(adminSpy.savePublicPage).toHaveBeenCalledWith({ enabled: true, event: 'ev1', showBeforeDays: 14, showAfterDays: 14 });
    expect(notifySpy.openSucessSnackBar).toHaveBeenCalledWith('Public page is on');
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
});
