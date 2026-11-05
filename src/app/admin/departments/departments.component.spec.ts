import { EventService } from '../../core/event.service';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { DepartmentsComponent } from './departments.component';
import { AdminService, DeptSummary, DeptDetail } from '../admin.service';
import { NotificationService } from '../../core/notification.service';

const mockDepts: DeptSummary[] = [
  { _id: 'd1', name: 'Box Office', description: 'Ticket sales', tls: [{ _id: 'u1', name: 'Alice' }], volunteerCount: 3 },
  { _id: 'd2', name: 'Finance', description: '', tls: [], volunteerCount: 0 }
];

const mockDetail: DeptDetail = {
  _id: 'd1', name: 'Box Office', description: 'Ticket sales',
  tls: [{ _id: 'u1', name: 'Alice' }],
  volunteers: [{ _id: 'v1', name: 'Bob', departments: [] }]
};

describe('DepartmentsComponent', () => {
  let component: DepartmentsComponent;
  let fixture: ComponentFixture<DepartmentsComponent>;
  let adminServiceSpy: jasmine.SpyObj<AdminService>;
  let notificationSpy: jasmine.SpyObj<NotificationService>;
  let dialogSpy: jasmine.SpyObj<MatDialog>;
  let router: Router;

  beforeEach(async () => {
    adminServiceSpy = jasmine.createSpyObj('AdminService', [
      'getDepartmentsSummary', 'getDepartmentDetail', 'deleteDepartment'
    ]);
    notificationSpy = jasmine.createSpyObj('NotificationService', ['openSucessSnackBar', 'openErrorSnackBar']);
    dialogSpy = jasmine.createSpyObj('MatDialog', ['open']);

    adminServiceSpy.getDepartmentsSummary.and.returnValue(of(mockDepts));

    await TestBed.configureTestingModule({
      declarations: [DepartmentsComponent],
      imports: [RouterTestingModule],
      providers: [
        { provide: EventService, useValue: { activeEvent: new BehaviorSubject<any>({ _id: 'e1', name: 'BiG 7.0' }), currentActiveEvent: { _id: 'e1', name: 'BiG 7.0' } } },
        { provide: AdminService, useValue: adminServiceSpy },
        { provide: NotificationService, useValue: notificationSpy },
        { provide: MatDialog, useValue: dialogSpy }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();

    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(DepartmentsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('loads departments on init', () => {
    expect(adminServiceSpy.getDepartmentsSummary).toHaveBeenCalled();
    expect(component.departments).toEqual(mockDepts);
  });

  it('shows error notification when load fails', () => {
    adminServiceSpy.getDepartmentsSummary.and.returnValue(throwError(() => new Error('fail')));
    component.loadDepartments();
    expect(notificationSpy.openErrorSnackBar).toHaveBeenCalledWith('Error loading departments');
  });

  describe('tlNames()', () => {
    it('returns comma-joined TL names', () => {
      const dept = { ...mockDepts[0], tls: [{ _id: 'u1', name: 'Alice' }, { _id: 'u2', name: 'Bob' }] };
      expect(component.tlNames(dept)).toBe('Alice, Bob');
    });

    it('returns em-dash when no TLs assigned', () => {
      expect(component.tlNames(mockDepts[1])).toBe('—');
    });
  });

  it('clicking a card opens that department in the side panel, without leaving the page', () => {
    const navSpy = spyOn(router, 'navigate');
    (fixture.nativeElement.querySelector('.dept-card') as HTMLElement).click();
    fixture.detectChanges();
    expect(component.panelOpen).toBeTrue();
    expect(component.panelDeptId).toBe('d1');
    expect(fixture.nativeElement.querySelector('.panel.open app-department-detail')).toBeTruthy();
    expect(navSpy).not.toHaveBeenCalled();
  });

  it('Delete on a card does not open the department, and there is no Edit button', () => {
    spyOn(component, 'openDeleteDialog');
    fixture.detectChanges();
    const card = fixture.nativeElement.querySelector('.dept-card') as HTMLElement;
    (card.querySelector('.btn-sm-danger') as HTMLElement).click();
    expect(component.openDeleteDialog).toHaveBeenCalled();
    expect(component.panelOpen).toBeFalse();
    expect(card.textContent).not.toContain('Edit');
  });

  it('Create Department opens an empty panel (Create mode), not a dialog', () => {
    (fixture.nativeElement.querySelector('.page-ph .btn-cta') as HTMLElement).click();
    fixture.detectChanges();
    expect(component.panelOpen).toBeTrue();
    expect(component.panelDeptId).toBeNull();
    expect(dialogSpy.open).not.toHaveBeenCalled();
  });

  it('after a create or save, refreshes the cards and shows that department', () => {
    component.openCreate();
    component.onDeptChanged('d3');
    expect(adminServiceSpy.getDepartmentsSummary).toHaveBeenCalledTimes(2);
    expect(component.panelDeptId).toBe('d3');
    expect(component.panelOpen).toBeTrue();
  });

  it('closing the panel hides it', () => {
    component.openDepartment(mockDepts[0]);
    component.closePanel();
    expect(component.panelOpen).toBeFalse();
  });

  it('openDeleteDialog() fetches detail then opens delete dialog', () => {
    adminServiceSpy.getDepartmentDetail.and.returnValue(of(mockDetail));
    const afterClosedSpy = jasmine.createSpyObj({ afterClosed: of(false) });
    dialogSpy.open.and.returnValue(afterClosedSpy);

    component.openDeleteDialog(mockDepts[0]);

    expect(adminServiceSpy.getDepartmentDetail).toHaveBeenCalledWith('d1');
    expect(dialogSpy.open).toHaveBeenCalled();
  });

  it('openDeleteDialog() calls deleteDepartment with force=true when confirmed and users exist', () => {
    adminServiceSpy.getDepartmentDetail.and.returnValue(of(mockDetail));
    adminServiceSpy.deleteDepartment.and.returnValue(of({ message: 'ok' }));
    const afterClosedSpy = jasmine.createSpyObj({ afterClosed: of(true) });
    dialogSpy.open.and.returnValue(afterClosedSpy);

    component.openDeleteDialog(mockDepts[0]);

    expect(adminServiceSpy.deleteDepartment).toHaveBeenCalledWith('d1', true);
    expect(notificationSpy.openSucessSnackBar).toHaveBeenCalledWith('Department deleted');
  });

  it('openDeleteDialog() calls deleteDepartment with force=false when dept is empty', () => {
    const emptyDetail: DeptDetail = { _id: 'd2', name: 'Finance', description: '', tls: [], volunteers: [] };
    adminServiceSpy.getDepartmentDetail.and.returnValue(of(emptyDetail));
    adminServiceSpy.deleteDepartment.and.returnValue(of({ message: 'ok' }));
    const afterClosedSpy = jasmine.createSpyObj({ afterClosed: of(true) });
    dialogSpy.open.and.returnValue(afterClosedSpy);

    component.openDeleteDialog(mockDepts[1]);

    expect(adminServiceSpy.deleteDepartment).toHaveBeenCalledWith('d2', false);
  });
});
