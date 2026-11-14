import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { BehaviorSubject, of, throwError } from 'rxjs';

import { TentFieldComponent } from './tent-field.component';
import { FieldGridComponent } from './field-grid.component';
import { FieldDetail, TentFieldService } from '../tent-field.service';
import { NotificationService } from '../../core/notification.service';
import { ConfirmationService } from '../../shared/confirm-dialog/confirmation.service';
import { AuthService } from '../../core/auth.service';
import { AccomodationService } from '../../accomodation/accomodation.service';
import { LocationService } from '../../venue-map/location.service';

@Component({ selector: 'app-section-header', template: '' })
class SectionHeaderStubComponent {}

const SH = { _id: 'p1', name: 'Shared Tent', code: 'SH' };
const detail = (canEdit: boolean): FieldDetail => ({
  field: { _id: 'f1', event: 'e1', name: 'Shanti Field', rows: 4, cols: 5, paths: [[3, 0]], layoutVersion: 2 },
  counts: { placed: 1, empty: 0, partly: 1, full: 0 },
  tents: [{ _id: 't1', tent_no: 'SH1', passType: SH, capacity: 2, state: 'partly', row: 0, col: 0, occupants: [{ _id: 'o1', name: 'Ravi Kumar', isAdmitted: true, gender: 'Male', phone_no: '9000000001', email: 'ravi@example.com', order_id: 1042 }] }],
  unplaced: canEdit ? [
    { _id: 't10', tent_no: 'SH10', passType: SH, capacity: 2, state: 'empty' },
    { _id: 't2', tent_no: 'SH2', passType: SH, capacity: 2, state: 'empty' },
  ] : [],
  canEdit,
});

describe('TentFieldComponent', () => {
  let fixture: ComponentFixture<TentFieldComponent>;
  let c: TentFieldComponent;
  let service: jasmine.SpyObj<TentFieldService>;
  let confirm: jasmine.SpyObj<ConfirmationService>;
  let accom: jasmine.SpyObj<AccomodationService>;
  let role = 'VOL';
  let perms: string[] = [];

  const setup = async (canEdit: boolean) => {
    service = jasmine.createSpyObj('TentFieldService', ['get', 'saveLayout', 'update', 'remove']);
    service.get.and.returnValue(of(detail(canEdit)));
    confirm = jasmine.createSpyObj('ConfirmationService', ['confirm']);
    confirm.confirm.and.returnValue(of(true));
    accom = jasmine.createSpyObj('AccomodationService', ['vacateTentSlot']);
    accom.vacateTentSlot.and.returnValue(of({} as any));
    const auth = {
      get currentUser() { return { role, permissions: perms }; },
      // Vacate: DEV/DIR/ADMIN, Tenting Write and up, or Box Office Write (as the real service).
      canVacateTents: (u: any) => ['DEV', 'DIR', 'ADMIN'].includes(u?.role) || perms.includes('tenting:write') || perms.includes('box-office:write')
    };
    await TestBed.configureTestingModule({
      imports: [FormsModule, MatIconModule, RouterTestingModule],
      declarations: [TentFieldComponent, FieldGridComponent, SectionHeaderStubComponent],
      providers: [
        { provide: TentFieldService, useValue: service },
        { provide: NotificationService, useValue: jasmine.createSpyObj('NotificationService', ['openSucessSnackBar', 'openErrorSnackBar']) },
        { provide: ConfirmationService, useValue: confirm },
        { provide: AuthService, useValue: auth },
        { provide: AccomodationService, useValue: accom },
        { provide: LocationService, useValue: { listAreas: () => Promise.resolve({ areas: [], canDraw: false, canDrawBoundary: false }) } },
        { provide: ActivatedRoute, useValue: { paramMap: new BehaviorSubject(convertToParamMap({ id: 'f1' })), snapshot: { queryParamMap: convertToParamMap({}) } } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(TentFieldComponent);
    c = fixture.componentInstance;
    fixture.detectChanges();
  };

  const el = () => fixture.nativeElement as HTMLElement;
  const apply = (r: number, col: number) => (c as any).apply(r, col);

  describe('as a viewer', () => {
    beforeEach(() => setup(false));

    it('draws the placed tents and walkways, with no edit button', () => {
      expect(c.tentViews.length).toBe(1);
      expect(c.tentViews[0]).toEqual(jasmine.objectContaining({ no: 'SH1', fill: '#fde68a', x: 0, y: 0 }));
      expect(c.pathViews.length).toBe(1);
      expect(el().textContent).not.toContain('Edit layout');
      expect(el().querySelector('.page-ph-title')!.textContent).toContain('Shanti Field');
    });

    it('finds a tent by an occupant and shows who is in it', () => {
      c.search = 'ravi';
      c.runSearch();
      expect(c.matches).toEqual(['t1']);
      expect(c.selected?.tent_no).toBe('SH1');
      fixture.detectChanges();
      expect(el().querySelector('.tf-d-no')!.textContent).toContain('SH1');
      expect(el().textContent).toContain('Admitted');
      expect(el().textContent).toContain('9000000001');
      expect(el().textContent).toContain('Order #1042');
      expect(c.genderMix(c.selected!)).toBe('1 Male');
      expect(c.rowColOf(c.selected!)).toBe('Row 1 · Column 1');
      expect(el().textContent).not.toContain('Open in Inventory');
    });

    it('offers Vacate only with Box Office write access, and keeps the tent open after', () => {
      c.selected = c.tents.get('t1')!;
      role = 'VOL'; perms = [];
      fixture.detectChanges();
      expect(el().querySelector('.tf-vacate')).toBeNull();
      perms = ['box-office:write'];
      fixture.detectChanges();
      (el().querySelector('.tf-vacate') as HTMLButtonElement).click();
      expect(confirm.confirm).toHaveBeenCalled();
      expect(accom.vacateTentSlot).toHaveBeenCalledWith('o1');
      expect(service.get).toHaveBeenCalledTimes(2);   // reloaded
      expect(c.selected?._id).toBe('t1');
    });
  });

  describe('as an editor', () => {
    beforeEach(() => setup(true));

    it('lists the tents to place in number order and places the next one', () => {
      c.startEdit();
      expect(c.groups[0].tents.map(t => t.tent_no)).toEqual(['SH2', 'SH10']);
      expect(c.nextTent?.tent_no).toBe('SH2');
      apply(1, 1);
      expect(c.layout.cells['1:1']).toBe('t2');
      expect(c.nextTent?.tent_no).toBe('SH10');
      apply(3, 0);                         // a walkway: nothing placed
      expect(c.layout.cells['3:0']).toBeUndefined();
      expect(c.changes).toBe(1);
    });

    it('undoes, removes and moves', () => {
      c.startEdit();
      const before = c.layout;
      apply(1, 1);
      (c as any).undoStack.push(before);
      c.undo();
      expect(c.layout.cells['1:1']).toBeUndefined();

      c.setTool('erase');
      apply(0, 0);
      expect(c.layout.cells['0:0']).toBeUndefined();
      expect(c.groups[0].tents.map(t => t.tent_no)).toContain('SH1');

      c.undo();                            // nothing pushed by a direct apply → no-op safe
      c.setTool('move');
      c.layout = { cells: { '0:0': 't1' }, paths: {} };
      (c as any).moveTap(0, 0);
      expect(c.moving).toBe('t1');
      (c as any).moveTap(2, 4);
      expect(c.layout.cells['2:4']).toBe('t1');
      expect(c.moving).toBe('');
    });

    it('removes all tents in one click (after a confirm), keeps walkways, and can undo', () => {
      c.startEdit();
      apply(1, 1);
      expect(c.placedNow).toBe(2);
      c.clearAll();
      expect(confirm.confirm).toHaveBeenCalled();
      expect(c.placedNow).toBe(0);
      expect(c.layout.paths['3:0']).toBeTrue();
      expect(c.groups[0].tents.map(t => t.tent_no)).toEqual(['SH1', 'SH2', 'SH10']);
      c.undo();
      expect(c.placedNow).toBe(2);
    });

    it('saves the whole layout with the version it was loaded at', () => {
      service.saveLayout.and.returnValue(of({ field: { ...detail(true).field, layoutVersion: 3 }, counts: { placed: 2, empty: 1, partly: 1, full: 0 } }));
      c.startEdit();
      apply(1, 1);
      c.saveLayout();
      const [id, body] = service.saveLayout.calls.mostRecent().args;
      expect(id).toBe('f1');
      expect(body.version).toBe(2);
      expect(body.placements).toEqual(jasmine.arrayWithExactContents([{ tent: 't1', row: 0, col: 0 }, { tent: 't2', row: 1, col: 1 }]));
      expect(body.paths).toEqual([[3, 0]]);
      expect(c.editing).toBeFalse();
      expect(c.field?.layoutVersion).toBe(3);
    });

    it('keeps the changes when saving fails', () => {
      service.saveLayout.and.returnValue(throwError(() => ({ status: 409, error: { message: 'Someone else saved this layout meanwhile.' } })));
      c.startEdit();
      apply(1, 1);
      c.saveLayout();
      expect(c.editing).toBeTrue();
      expect(c.changes).toBe(1);
    });

    it('asks before leaving with unsaved changes', () => {
      c.startEdit();
      let left: boolean | undefined;
      c.canLeave().subscribe(v => left = v);
      expect(confirm.confirm).not.toHaveBeenCalled();
      expect(left).toBeTrue();
      apply(1, 1);
      c.canLeave().subscribe();
      expect(confirm.confirm).toHaveBeenCalled();
    });
  });
});
