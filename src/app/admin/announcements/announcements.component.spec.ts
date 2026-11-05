import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { of } from 'rxjs';
import { AnnouncementsComponent } from './announcements.component';
import { PushService } from '../../core/push.service';
import { NotificationService } from '../../core/notification.service';
import { ConfirmationService } from '../../shared/confirm-dialog/confirmation.service';
import { AdminService } from '../admin.service';
import { AuthService } from '../../core/auth.service';
import { AppSelectComponent } from '../../shared/app-select/app-select.component';
import { AppOptionComponent } from '../../shared/app-select/app-option.component';

describe('AnnouncementsComponent', () => {
  let fixture: ComponentFixture<AnnouncementsComponent>;
  let component: AnnouncementsComponent;
  let push: any;
  let confirm: jasmine.SpyObj<ConfirmationService>;
  let snack: jasmine.SpyObj<NotificationService>;
  let auth: any;
  const past: any = {
    _id: 'a1', type: 'weather', title: 'Old', message: 'Earlier', roles: ['VOL'],
    departments: [{ _id: 'd-bo', name: 'Box Office' }], resentFrom: null,
    sentBy: { _id: 'u', name: 'Maya' }, recipients: 3, devices: 2, delivered: 2, createdAt: '2026-10-30T10:00:00Z'
  };
  const depts = [{ _id: 'd-ops', name: 'Operations' }, { _id: 'd-bo', name: 'Box Office' }];
  const el = () => fixture.nativeElement as HTMLElement;

  beforeEach(async () => {
    push = {
      listAnnouncements: jasmine.createSpy('listAnnouncements').and.resolveTo([past]),
      sendAnnouncement: jasmine.createSpy('sendAnnouncement').and.callFake((b: any) =>
        Promise.resolve({ ...past, _id: 'a2', ...b, departments: depts.filter(d => b.departments.includes(d._id)), delivered: 5 })),
      resendAnnouncement: jasmine.createSpy('resendAnnouncement').and.resolveTo({ ...past, _id: 'a3', resentFrom: 'a1', delivered: 1 })
    };
    auth = { currentUser: { role: 'DIR' } };
    confirm = jasmine.createSpyObj('ConfirmationService', ['confirm']);
    confirm.confirm.and.returnValue(of(true));
    snack = jasmine.createSpyObj('NotificationService', ['openSucessSnackBar', 'openErrorSnackBar']);
    TestBed.configureTestingModule({
      imports: [FormsModule, MatIconModule],
      declarations: [AnnouncementsComponent, AppSelectComponent, AppOptionComponent],
      providers: [
        { provide: PushService, useValue: push },
        { provide: AdminService, useValue: { getDepartments: () => of(depts) } },
        { provide: AuthService, useValue: auth },
        { provide: ConfirmationService, useValue: confirm },
        { provide: NotificationService, useValue: snack }
      ]
    });
    fixture = TestBed.createComponent(AnnouncementsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('lists past announcements with type, audience and sender', () => {
    const text = el().textContent!;
    expect(text).toContain('Old');
    expect(text).toContain('Weather');
    expect(text).toContain('To Volunteers in Box Office');
    expect(text).toContain('by Maya');
  });

  it('offers the departments sorted by name', () => {
    expect(component.departmentOptions.map(d => d.name)).toEqual(['Box Office', 'Operations']);
  });

  it('needs a title, a message and a role or a department', () => {
    expect(component.canSend).toBeFalse();
    component.title = 'Gates open'; component.message = 'At 2 pm';
    expect(component.canSend).toBeFalse();
    component.toggleDepartment('d-bo', true);
    expect(component.canSend).toBeTrue();
  });

  it('Select all / Clear toggles every role and every department', () => {
    component.toggleAllRoles();
    expect(component.roles.size).toBe(4);   // Developers isn't offered to a Director
    expect(component.allRolesSelected).toBeTrue();
    component.toggleAllRoles();
    expect(component.roles.size).toBe(0);
    component.toggleAllDepartments();
    expect([...component.departments].sort()).toEqual(['d-bo', 'd-ops']);
    component.toggleAllDepartments();
    expect(component.departments.size).toBe(0);
  });

  it('tiles and chips have no visible radio buttons or checkboxes, but keep them for keyboards', () => {
    fixture.detectChanges();
    const inputs = Array.from(el().querySelectorAll<HTMLInputElement>('.ann-type input, .ann-chip input'));
    expect(inputs.length).toBe(6 + 4 + 2);   // 6 types, 4 roles (no Developers), 2 departments
    expect(inputs.every(i => i.classList.contains('sr-only'))).toBeTrue();
  });

  describe('Developers as an audience', () => {
    it('is not offered to a non-Developer', () => {
      expect(component.roleOptions.map(r => r.value)).not.toContain('DEV');
      expect(el().textContent).not.toContain('Developers');
    });

    it('is offered to a Developer', () => {
      auth.currentUser = { role: 'DEV' };
      component.ngOnInit();
      expect(component.roleOptions.map(r => r.value)).toContain('DEV');
    });

    it('a non-Developer cannot "Send again" one that went to Developers, and Copy to form drops Developers', () => {
      const toDevs: any = { ...past, roles: ['DEV', 'TL'] };
      expect(component.canResend(toDevs)).toBeFalse();
      expect(component.canResend(past)).toBeTrue();
      component.copyToForm(toDevs);
      expect([...component.roles]).toEqual(['TL']);
    });
  });

  describe('sent-announcement filters', () => {
    const more: any[] = [
      { ...past, _id: 'b1', type: 'urgent', title: 'Storm warning', message: 'Leave the stage', roles: ['TL'], departments: [{ _id: 'd-ops', name: 'Operations' }] },
      { ...past, _id: 'b2', type: 'task', title: 'Restock water', message: 'Gate 2 needs crates', roles: ['VOL'], departments: [] }
    ];
    beforeEach(() => {
      component.history = [...more, past];
      component.applyFilters();
    });

    it('shows everything with no filters', () => {
      expect(component.visibleHistory.length).toBe(3);
      expect(component.hasFilters).toBeFalse();
    });

    it('searches title and message, ignoring case', () => {
      component.search = 'CRATES'; component.applyFilters();
      expect(component.visibleHistory.map(a => a._id)).toEqual(['b2']);
      component.search = 'storm'; component.applyFilters();
      expect(component.visibleHistory.map(a => a._id)).toEqual(['b1']);
    });

    it('filters by type, department and role, together', () => {
      component.filterType = 'urgent'; component.applyFilters();
      expect(component.visibleHistory.map(a => a._id)).toEqual(['b1']);
      component.filterType = ''; component.filterDept = 'd-bo'; component.applyFilters();
      expect(component.visibleHistory.map(a => a._id)).toEqual(['a1']);
      component.filterDept = ''; component.filterRole = 'VOL'; component.applyFilters();
      expect(component.visibleHistory.map(a => a._id)).toEqual(['b2', 'a1']);
      component.filterType = 'task'; component.applyFilters();
      expect(component.visibleHistory.map(a => a._id)).toEqual(['b2']);
    });

    it('shows "x of y" and a no-match message, and Clear filters resets', () => {
      component.search = 'nothing like this'; component.applyFilters();
      fixture.detectChanges();
      expect(el().textContent).toContain('Showing 0 of 3');
      expect(el().textContent).toContain('No announcements match these filters.');
      component.clearFilters();
      expect(component.visibleHistory.length).toBe(3);
      expect(component.hasFilters).toBeFalse();
    });

    it('keeps a newly sent announcement visible only if it matches', fakeAsync(() => {
      component.filterType = 'weather'; component.applyFilters();
      component.type = 'general'; component.title = 'Hello'; component.message = 'World'; component.toggleRole('VOL', true);
      component.send(); tick();
      expect(component.history[0]._id).toBe('a2');
      expect(component.visibleHistory.some(a => a._id === 'a2')).toBeFalse();   // it's General, filter is Weather
    }));
  });

  it('offers a Task type with its prefix', () => {
    component.type = 'task'; component.title = 'Restock water';
    fixture.detectChanges();
    expect(el().querySelector('.ann-phone-note')!.textContent).toContain('Task: Restock water');
  });

  it('describes the audience before sending', () => {
    expect(component.audiencePreview).toBe('Pick at least one role, department or the public page');
    component.toggleDepartment('d-bo', true);
    expect(component.audiencePreview).toBe('Everyone in Box Office');
    component.toggleRole('VOL', true); component.toggleRole('TL', true);
    expect(component.audiencePreview).toBe('Team Leads, Volunteers in Box Office');
  });

  it('confirms, sends type + roles (server order) + departments, and resets the form', fakeAsync(() => {
    component.type = 'schedule';
    component.title = ' Gates open '; component.message = 'At 3 pm now';
    component.toggleRole('VOL', true); component.toggleRole('TL', true);
    component.toggleDepartment('d-ops', true);
    component.send(); tick();
    expect(confirm.confirm).toHaveBeenCalled();
    expect(push.sendAnnouncement).toHaveBeenCalledWith({
      type: 'schedule', title: 'Gates open', message: 'At 3 pm now', roles: ['TL', 'VOL'], departments: ['d-ops'], public: false
    });
    expect(snack.openSucessSnackBar).toHaveBeenCalledWith('Sent to 5 devices');
    expect(component.type).toBe('general');
    expect(component.roles.size).toBe(0);
    expect(component.departments.size).toBe(0);
    expect(component.history[0]._id).toBe('a2');
  }));

  it('marks an urgent send as dangerous in the confirmation', fakeAsync(() => {
    component.type = 'urgent'; component.title = 'Storm'; component.message = 'Leave now'; component.toggleRole('VOL', true);
    component.send(); tick();
    const arg = confirm.confirm.calls.mostRecent().args[0];
    expect(arg.danger).toBeTrue();
    expect(arg.message).toContain('Urgent: Storm');
  }));

  it('does not send when the confirmation is cancelled', fakeAsync(() => {
    confirm.confirm.and.returnValue(of(false));
    component.title = 'x'; component.message = 'y'; component.toggleRole('VOL', true);
    component.send(); tick();
    expect(push.sendAnnouncement).not.toHaveBeenCalled();
  }));

  it('Send again confirms, re-sends the original, and adds the new one on top marked Resent', fakeAsync(() => {
    component.sendAgain(component.history[0]); tick();
    expect(push.resendAnnouncement).toHaveBeenCalledWith('a1');
    expect(component.history[0]._id).toBe('a3');
    fixture.detectChanges();
    expect(el().querySelector('.ann-item .ann-badge.resent')).toBeTruthy();
  }));

  it('Copy to form fills type, text and audience', () => {
    component.copyToForm(past);
    expect(component.type).toBe('weather');
    expect(component.title).toBe('Old');
    expect(component.message).toBe('Earlier');
    expect([...component.roles]).toEqual(['VOL']);
    expect([...component.departments]).toEqual(['d-bo']);
  });

  describe('public page (PH3)', () => {
    it('can be the only audience; Task / Reminder are not allowed then', () => {
      component.title = 'Gates open'; component.message = 'At 2 pm';
      component.type = 'task';
      component.setPublic(true);
      expect(component.type).toBe('general');
      expect(component.canSend).toBeTrue();
      expect(component.audiencePreview).toBe('the public page only (no staff)');
      component.setType('reminder');
      expect(component.type).toBe('general');
      component.setType('weather');
      expect(component.type).toBe('weather');
    });

    it('public + staff in one send', async () => {
      component.title = 'Gates open'; component.message = 'At 2 pm';
      component.toggleRole('VOL', true);
      component.setPublic(true);
      expect(component.audiencePreview).toBe('Volunteers and the public page');
      await component.send();
      expect(push.sendAnnouncement).toHaveBeenCalledWith(jasmine.objectContaining({ public: true, roles: ['VOL'] }));
      expect(confirm.confirm.calls.mostRecent().args[0].message).toContain('anyone on the internet can read it');
      expect(component.publicPost).toBeFalse();   // form reset
    });

    it('a public-only send says "Posted on the public page"', async () => {
      push.sendAnnouncement.and.resolveTo({ ...past, _id: 'a9', roles: [], departments: [], public: true, delivered: 0 });
      component.title = 'Gates open'; component.message = 'At 2 pm';
      component.setPublic(true);
      await component.send();
      expect(snack.openSucessSnackBar).toHaveBeenCalledWith('Posted on the public page');
    });

    it('history: Public badge and Remove from public page; Removed afterwards', async () => {
      const pub = { ...past, _id: 'p1', public: true, publicRemovedAt: null };
      component.history = [pub];
      component.applyFilters();
      fixture.detectChanges();
      expect(el().textContent).toContain('Public');
      expect(component.historyAudience(pub)).toBe('Volunteers in Box Office and the public page');

      push.unpublishAnnouncement = jasmine.createSpy('unpublishAnnouncement').and.resolveTo(
        { ...pub, publicRemovedAt: '2026-11-06T10:00:00Z', publicRemovedBy: { _id: 'u2', name: 'Asha' } });
      await component.removeFromPublic(pub);
      fixture.detectChanges();
      expect(push.unpublishAnnouncement).toHaveBeenCalledWith('p1');
      expect(component.isLivePublic(component.history[0])).toBeFalse();
      expect(el().textContent).toContain('Removed');
      expect(el().textContent).toContain('removed from the public page by Asha');
    });

    it('Copy to form keeps the public choice', () => {
      component.copyToForm({ ...past, public: true, type: 'general' });
      expect(component.publicPost).toBeTrue();
    });
  });

  it('shows the type marker in the lock-screen preview', () => {
    component.type = 'reminder'; component.title = 'Attendance'; component.message = 'Closes at 9';
    fixture.detectChanges();
    const preview = el().querySelector('.ann-phone-note')!.textContent!;
    expect(preview).toContain('Reminder: Attendance');
    expect(preview).toContain('Closes at 9');
  });
});
