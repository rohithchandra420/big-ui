import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { of, throwError } from 'rxjs';

import { BulkUsersComponent, cellText, headerKey, toBulkRows } from './bulk-users.component';
import { AdminService, BulkUsersResponse } from '../../admin.service';
import { NotificationService } from '../../../core/notification.service';
import { EventService } from '../../../core/event.service';
import { AppSelectComponent } from '../../../shared/app-select/app-select.component';
import { AppOptionComponent } from '../../../shared/app-select/app-option.component';

describe('Bulk Add users helpers', () => {
  it('normalises header names', () => {
    expect(headerKey(' Home Department ')).toBe('home_department');
    expect(headerKey('date-of-joining')).toBe('date_of_joining');
  });

  it('turns cells into text and dates into yyyy-mm-dd', () => {
    expect(cellText(new Date(2026, 9, 1))).toBe('2026-10-01');
    expect(cellText('  Asha ')).toBe('Asha');
    expect(cellText(null)).toBe('');
  });

  it('builds rows with sheet row numbers and drops empty rows', () => {
    const rows = toBulkRows([
      { Name: 'Asha', Email: 'a@x.com', Password: 'Strong@123', Role: 'VOL', 'Home Department': 'Box Office' },
      { Name: '', Email: '' },
      { name: 'Ravi', email: 'r@x.com', password: 1234, role: 'TL', home_department: 'Workshop', gender: 'Male' }
    ]);
    expect(rows.length).toBe(2);
    expect(rows[0]).toEqual(jasmine.objectContaining({ row: 2, name: 'Asha', home_department: 'Box Office' }));
    expect(rows[1].row).toBe(4);
    expect(rows[1].password).toBe('1234');
    expect(rows[1].gender).toBe('Male');
  });
});

describe('BulkUsersComponent', () => {
  let fixture: ComponentFixture<BulkUsersComponent>;
  let component: BulkUsersComponent;
  let admin: jasmine.SpyObj<AdminService>;
  let dialogRef: jasmine.SpyObj<MatDialogRef<BulkUsersComponent>>;

  const row = (n: number) => ({ row: n, name: 'P' + n, email: `p${n}@x.com`, password: 'Strong@123', role: 'VOL', home_department: 'Box Office' });
  const preview: BulkUsersResponse = {
    results: [
      { row: 2, name: 'P2', email: 'p2@x.com', role: 'VOL', home_department: 'Box Office', status: 'ready' },
      { row: 3, name: 'P3', email: 'p3@x.com', role: 'VOL', home_department: 'Box Office', status: 'duplicate', reason: 'A user with this email already exists' }
    ],
    counts: { ready: 1, duplicate: 1 }
  };
  const el = () => fixture.nativeElement as HTMLElement;

  beforeEach(async () => {
    admin = jasmine.createSpyObj('AdminService', ['bulkUsers']);
    dialogRef = jasmine.createSpyObj('MatDialogRef', ['close']);
    await TestBed.configureTestingModule({
      declarations: [BulkUsersComponent, AppSelectComponent, AppOptionComponent],
      imports: [FormsModule, MatDialogModule, MatIconModule],
      providers: [
        { provide: AdminService, useValue: admin },
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: EventService, useValue: { currentActiveEvent: { _id: 'ev1', name: 'BiG 7.0' } } },
        { provide: NotificationService, useValue: jasmine.createSpyObj('NotificationService', ['openSucessSnackBar', 'openErrorSnackBar']) }
      ]
    }).compileComponents();
    fixture = TestBed.createComponent(BulkUsersComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  const check = (rows: any[]) => (component as any).check(rows);

  it('checks the rows as a dry run and shows the preview', () => {
    admin.bulkUsers.and.returnValue(of(preview));
    check([row(2), row(3)]);
    fixture.detectChanges();
    expect(admin.bulkUsers).toHaveBeenCalledWith([row(2), row(3)] as any, true);
    expect(component.phase).toBe('preview');
    expect(el().querySelectorAll('tbody tr').length).toBe(2);
    expect(el().textContent).toContain('A user with this email already exists');
    expect(el().textContent).toContain('Add 1 user');
  });

  it('refuses more than 500 rows without calling the server', () => {
    check(Array.from({ length: 501 }, (_, i) => row(i + 2)));
    expect(admin.bulkUsers).not.toHaveBeenCalled();
    expect(component.error).toContain('501 rows');
  });

  it('says so when the sheet has no users', () => {
    check([]);
    expect(component.error).toContain('No users found');
  });

  it('adds the ready rows, then closes with true', () => {
    admin.bulkUsers.and.returnValues(of(preview), of({
      results: [{ ...preview.results[0], status: 'created' }, preview.results[1]],
      counts: { created: 1, duplicate: 1 }
    }));
    check([row(2), row(3)]);
    component.add();
    expect(admin.bulkUsers.calls.mostRecent().args[1]).toBeFalse();
    expect(admin.bulkUsers.calls.mostRecent().args[2]).toBe('ev1');
    expect(component.phase).toBe('done');
    expect(component.added).toBe(1);
    component.close();
    expect(dialogRef.close).toHaveBeenCalledWith(true);
  });

  it('keeps the preview when adding fails', () => {
    admin.bulkUsers.and.returnValues(of(preview), throwError(() => ({ error: { msg: 'Bulk add failed' } })));
    check([row(2)]);
    component.add();
    expect(component.phase).toBe('preview');
    expect(component.error).toBe('Bulk add failed');
  });

  it('cannot add when nothing is ready', () => {
    admin.bulkUsers.and.returnValue(of({ results: [preview.results[1]], counts: { duplicate: 1 } }));
    check([row(3)]);
    component.add();
    expect(admin.bulkUsers).toHaveBeenCalledTimes(1);
  });

  it('can skip adding them to the event', () => {
    admin.bulkUsers.and.returnValues(of(preview), of({ results: [], counts: { created: 0 } }));
    check([row(2)]);
    component.addToEvent = false;
    component.add();
    expect(admin.bulkUsers.calls.mostRecent().args[2]).toBe('');
  });

  it('closes with false when nobody was added', () => {
    component.close();
    expect(dialogRef.close).toHaveBeenCalledWith(false);
  });

  it('rejects files that are not .xlsx', () => {
    component.handleFile(new File(['x'], 'users.csv'));
    expect(component.error).toContain('.xlsx');
  });
});
