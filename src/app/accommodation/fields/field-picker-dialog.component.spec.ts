import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, flush } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { of } from 'rxjs';

import { FieldPickerDialogComponent, FieldPickerData } from './field-picker-dialog.component';
import { TentFieldService } from '../tent-field.service';
import { AppSelectComponent } from '../../shared/app-select/app-select.component';
import { AppOptionComponent } from '../../shared/app-select/app-option.component';

@Component({ selector: 'app-field-grid', template: '' })
class FieldGridStubComponent {
  @Input() rows = 1; @Input() cols = 1; @Input() name = ''; @Input() tents: any; @Input() paths: any; @Input() gridPath = '';
  @Input() zoom = 1; @Input() selectedId = ''; @Input() allowed: any; @Input() warn: any;
  @Output() cellDown = new EventEmitter<any>();
}

const SH = { _id: 'p1', name: 'Shared Tent', code: 'SH' };
const SO = { _id: 'p2', name: 'Solo Tent', code: 'SO' };

describe('FieldPickerDialogComponent (B4)', () => {
  let fixture: ComponentFixture<FieldPickerDialogComponent>;
  let c: FieldPickerDialogComponent;
  let ref: jasmine.SpyObj<MatDialogRef<FieldPickerDialogComponent, string>>;
  let service: jasmine.SpyObj<TentFieldService>;

  beforeEach(async () => {
    service = jasmine.createSpyObj('TentFieldService', ['list', 'get']);
    service.list.and.returnValue(of({
      fields: [
        { _id: 'f1', event: 'e1', name: 'Shanti Field', rows: 3, cols: 3, paths: [], layoutVersion: 1, types: [{ passType: 'p1', code: 'SH', name: 'Shared Tent', count: 3 }] },
        { _id: 'f2', event: 'e1', name: 'Solo Field', rows: 3, cols: 3, paths: [], layoutVersion: 1, types: [{ passType: 'p2', code: 'SO', name: 'Solo Tent', count: 2 }] },
      ],
      unplaced: 0, canEdit: false,
    }));
    service.get.and.returnValue(of({
      field: { _id: 'f1', event: 'e1', name: 'Shanti Field', rows: 3, cols: 3, paths: [], layoutVersion: 1 },
      counts: { placed: 4, empty: 1, partly: 1, full: 1 },
      tents: [
        { _id: 'a', tent_no: 'SH1', passType: SH, capacity: 2, state: 'empty', row: 0, col: 0, occupants: [] },
        { _id: 'b', tent_no: 'SH2', passType: SH, capacity: 2, state: 'partly', row: 0, col: 1, occupants: [{ _id: 'o1', name: 'Asha', isAdmitted: true, gender: 'Female' }] },
        { _id: 'c', tent_no: 'SH3', passType: SH, capacity: 2, state: 'full', row: 0, col: 2, occupants: [{ _id: 'o2', name: 'X', isAdmitted: true }, { _id: 'o3', name: 'Y', isAdmitted: true }] },
        { _id: 'd', tent_no: 'SO1', passType: SO, capacity: 1, state: 'empty', row: 1, col: 0, occupants: [] },
      ],
      unplaced: [], canEdit: false,
    }));
    ref = jasmine.createSpyObj('MatDialogRef', ['close']);
    const data: FieldPickerData = { eventId: 'e1', passTypeId: 'p1', passTypeName: 'Shared Tent', gender: 'Male' };
    await TestBed.configureTestingModule({
      imports: [FormsModule, MatIconModule, MatDialogModule],
      declarations: [FieldPickerDialogComponent, FieldGridStubComponent, AppSelectComponent, AppOptionComponent],
      providers: [
        { provide: TentFieldService, useValue: service },
        { provide: MatDialogRef, useValue: ref },
        { provide: MAT_DIALOG_DATA, useValue: data },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(FieldPickerDialogComponent);
    c = fixture.componentInstance;
  });

  it('offers only fields with this tent type, and only its tents with a free place', fakeAsync(() => {
    fixture.detectChanges();
    flush();
    expect(c.fields.map(f => f.name)).toEqual(['Shanti Field']);
    expect(service.get).toHaveBeenCalledWith('f1');
    expect([...c.allowed].sort()).toEqual(['a', 'b']);   // SH3 full, SO1 another type
    expect([...c.warn]).toEqual(['b']);                    // a woman inside, allocating a man
  }));

  it('picks a bright tent and returns it; faded tents cannot be picked', fakeAsync(() => {
    fixture.detectChanges();
    flush();
    c.onDown({ r: 0, c: 2, ev: {} as PointerEvent });     // full
    expect(c.selected).toBeNull();
    c.onDown({ r: 0, c: 1, ev: {} as PointerEvent });
    expect(c.selected?.tent_no).toBe('SH2');
    expect(c.freeOf(c.selected!)).toBe(1);
    c.choose();
    expect(ref.close).toHaveBeenCalledWith('b');
  }));
});
