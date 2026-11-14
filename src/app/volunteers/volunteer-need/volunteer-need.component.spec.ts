import { ComponentFixture, TestBed, fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { VolunteerNeedComponent } from './volunteer-need.component';
import { NotificationService } from '../../core/notification.service';
import { VolunteersService } from '../volunteers.service';

describe('VolunteerNeedComponent', () => {
  let fixture: ComponentFixture<VolunteerNeedComponent>;
  let component: VolunteerNeedComponent;
  let service: jasmine.SpyObj<VolunteersService>;
  const el = () => fixture.nativeElement as HTMLElement;

  beforeEach(async () => {
    service = jasmine.createSpyObj('VolunteersService', ['need', 'setNeed']);
    await TestBed.configureTestingModule({
      declarations: [VolunteerNeedComponent],
      imports: [FormsModule],
      providers: [
        { provide: VolunteersService, useValue: service },
        { provide: NotificationService, useValue: jasmine.createSpyObj('NotificationService', ['openSucessSnackBar', 'openErrorSnackBar']) }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();
    fixture = TestBed.createComponent(VolunteerNeedComponent);
    component = fixture.componentInstance;
    component.departmentId = 'd2';
    component.eventId = 'e1';
  });

  const start = () => { component.ngOnChanges(); flushMicrotasks(); fixture.detectChanges(); };

  it('shows have of needed, and lets the Team Lead change it', fakeAsync(() => {
    service.need.and.returnValue(Promise.resolve({ needed: 5, have: 3, canSet: true }));
    start();
    expect(service.need).toHaveBeenCalledWith('e1', 'd2');
    expect(el().querySelector('.vn-value')!.textContent).toContain('3 of 5');
    expect(el().querySelector('.vl-pill')!.textContent).toContain('2 short');

    service.setNeed.and.returnValue(Promise.resolve({ needed: 3, have: 3, canSet: true }));
    component.edit();
    component.value = 3;
    component.save();
    flushMicrotasks();
    fixture.detectChanges();
    expect(service.setNeed).toHaveBeenCalledWith('e1', 'd2', 3);
    expect(el().querySelector('.vl-pill')!.textContent).toContain('Met');
  }));

  it('has no button for people who cannot set it, and shows nothing when refused', fakeAsync(() => {
    service.need.and.returnValue(Promise.resolve({ needed: 0, have: 1, canSet: false }));
    start();
    expect(el().querySelector('.vn-value')!.textContent).toContain('No number given');
    expect(el().querySelector('.pill-btn')).toBeNull();

    service.need.and.returnValue(Promise.reject({ status: 403 }));
    start();
    expect(el().querySelector('.vn')).toBeNull();
  }));

  it('skips the ALL view', fakeAsync(() => {
    component.departmentId = 'ALL';
    start();
    expect(service.need).not.toHaveBeenCalled();
  }));
});
