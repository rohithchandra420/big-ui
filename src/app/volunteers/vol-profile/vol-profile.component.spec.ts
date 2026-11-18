import { ComponentFixture, TestBed, fakeAsync, flush, flushMicrotasks } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { NO_ERRORS_SCHEMA, SimpleChange } from '@angular/core';
import { VolProfileComponent } from './vol-profile.component';
import { VolunteersService } from '../volunteers.service';
import { DepartmentService } from '../../core/department.service';
import { StaffBandService } from '../../core/staff-band.service';
import { NotificationService } from '../../core/notification.service';
import { VolProfile } from '../volunteers.model';

// The shared profile (Volunteers + My Department, 2026-11-19).
const base: VolProfile = {
  _id: 'u1', name: 'Anil', email: 'anil@example.com', phone: '', avatarVersion: 0, role: 'VOL',
  department: { _id: 'd1', name: 'Stage Crew' }, unassigned: false, dateOfJoining: null, foodPreference: 'veg', gender: '',
  stay: null, band: false, meals: 0, deposit: { status: 'none' },
  attendance: [{ date: '2026-11-18', morning: false, afternoon: false, night: false }, { date: '2026-11-19', morning: false, afternoon: true, night: false }]
};

describe('VolProfileComponent', () => {
  let fixture: ComponentFixture<VolProfileComponent>;
  let c: VolProfileComponent;
  let vols: jasmine.SpyObj<VolunteersService>;
  let depts: jasmine.SpyObj<DepartmentService>;
  const el = () => fixture.nativeElement as HTMLElement;

  beforeEach(async () => {
    vols = jasmine.createSpyObj('VolunteersService', ['profile', 'location', 'askLocation']);
    depts = jasmine.createSpyObj('DepartmentService', ['memberProfile']);
    vols.location.and.returnValue(Promise.resolve({ sharing: true, waiting: false, latest: null, requestHours: 2, log: [] }));
    const bands = jasmine.createSpyObj('StaffBandService', ['get']);
    bands.get.and.returnValue(Promise.reject({ status: 403 }));
    await TestBed.configureTestingModule({
      declarations: [VolProfileComponent],
      imports: [FormsModule],
      providers: [
        { provide: VolunteersService, useValue: vols },
        { provide: DepartmentService, useValue: depts },
        { provide: StaffBandService, useValue: bands },
        { provide: NotificationService, useValue: jasmine.createSpyObj('NotificationService', ['openSucessSnackBar', 'openErrorSnackBar']) }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();
    fixture = TestBed.createComponent(VolProfileComponent);
    c = fixture.componentInstance;
  });

  const open = (inputs: Partial<VolProfileComponent>) => {
    Object.assign(c, { eventId: 'e1', userId: 'u1', ...inputs });
    c.ngOnChanges({ userId: new SimpleChange(null, 'u1', true) });
    flushMicrotasks(); fixture.detectChanges(); flush(); fixture.detectChanges();
  };

  it('My Department: loads through the department; location follows the server\'s "can"', fakeAsync(() => {
    depts.memberProfile.and.returnValue(Promise.resolve({ ...base, can: { role: true, location: true } }));
    let got: VolProfile | null = null;
    c.loaded.subscribe(p => got = p);
    open({ departmentId: 'd1' });
    expect(depts.memberProfile).toHaveBeenCalledWith('d1', 'u1', 'e1');
    expect(vols.profile).not.toHaveBeenCalled();
    expect(got!.name).toBe('Anil');
    expect(c.markedToday).toBeTrue();                                   // a slot today, no "marked" input
    expect(vols.location).toHaveBeenCalledWith('e1', 'u1');
    expect(el().textContent).toContain('Location');
  }));

  it('My Department: no location when the server says no; an error is shown', fakeAsync(() => {
    depts.memberProfile.and.returnValue(Promise.resolve({ ...base, can: { role: false, location: false } }));
    open({ departmentId: 'd1' });
    expect(vols.location).not.toHaveBeenCalled();
    depts.memberProfile.and.returnValue(Promise.reject({ error: { message: 'Only this department\'s volunteers and Team Leads on this event open here' } }));
    c.load();
    flushMicrotasks(); fixture.detectChanges();
    expect(el().querySelector('.alert')!.textContent).toContain('Team Leads on this event');
  }));

  it('Volunteers: loads through Volunteers; location only for the Manage group; the picked-day mark wins', fakeAsync(() => {
    vols.profile.and.returnValue(Promise.resolve(base));
    open({ marked: false, canAskLocation: false });
    expect(vols.profile).toHaveBeenCalledWith('e1', 'u1');
    expect(c.markedToday).toBeFalse();
    expect(vols.location).not.toHaveBeenCalled();
  }));

  it('asks this one person for their location', fakeAsync(() => {
    vols.profile.and.returnValue(Promise.resolve(base));
    vols.askLocation.and.returnValue(Promise.resolve({ asked: 1, notSharing: 0, alreadyAsked: 0, skipped: 0 }));
    open({ canAskLocation: true });
    c.askLocation();
    flushMicrotasks(); flush();
    expect(vols.askLocation).toHaveBeenCalledWith('e1', ['u1']);
    expect(vols.location).toHaveBeenCalledTimes(2);
  }));
});
