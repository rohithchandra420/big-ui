import { ComponentFixture, TestBed, fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { DateTimeComponent } from '../../shared/date-time/date-time.component';
import { FormsModule } from '@angular/forms';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { BehaviorSubject, of } from 'rxjs';
import { VolunteerDepositsComponent } from './volunteer-deposits.component';
import { SlidePanelComponent } from '../../shared/slide-panel/slide-panel.component';
import { EventService } from '../../core/event.service';
import { NotificationService } from '../../core/notification.service';
import { ConfirmationService } from '../../shared/confirm-dialog/confirmation.service';
import { VolunteersService } from '../volunteers.service';
import { DepositList, DepositRow } from '../volunteers.model';

const row = (id: string, name: string, extra: Partial<DepositRow> = {}): DepositRow =>
  ({ _id: id, name, avatarVersion: 0, phone: '', department: 'WASH', status: 'none', flag: '', ...extra });
const held = { status: 'held' as const, amount: 500, mode: 'cash' as const, note: '', collectedAt: '2026-11-12T08:00:00.000Z', collectedBy: 'Lead One', log: [] };

describe('VolunteerDepositsComponent', () => {
  let fixture: ComponentFixture<VolunteerDepositsComponent>;
  let component: VolunteerDepositsComponent;
  let service: jasmine.SpyObj<VolunteersService>;
  let notify: jasmine.SpyObj<NotificationService>;
  let confirm: jasmine.SpyObj<ConfirmationService>;
  let canManage: boolean;
  let seeAmounts: boolean;
  const el = () => fixture.nativeElement as HTMLElement;

  const list = (): DepositList => ({
    canManage, seeAmounts, modes: ['cash', 'upi', 'bank', 'other'],
    ...(seeAmounts ? { defaultAmount: 1000 } : {}),
    totals: { held: 2, none: 1, refunded: 0, ...(seeAmounts ? { heldAmount: 1000, refundedAmount: 0 } : {}) },
    rows: [
      row('1', 'Anil'),
      row('2', 'Bela', seeAmounts ? held : { status: 'held' }),
      row('3', 'Chand', { ...(seeAmounts ? held : { status: 'held' as const }), flag: 'left', department: '' })
    ]
  });

  beforeEach(async () => {
    canManage = true;
    seeAmounts = true;
    service = jasmine.createSpyObj('VolunteersService', ['deposits', 'saveDeposit', 'refundDeposit', 'removeDeposit', 'setDefaultDeposit']);
    service.deposits.and.callFake(() => Promise.resolve(list()));
    notify = jasmine.createSpyObj('NotificationService', ['openSucessSnackBar', 'openErrorSnackBar']);
    confirm = jasmine.createSpyObj('ConfirmationService', ['confirm']);
    await TestBed.configureTestingModule({
      declarations: [DateTimeComponent, VolunteerDepositsComponent, SlidePanelComponent],
      imports: [FormsModule],
      providers: [
        { provide: EventService, useValue: { activeEvent: new BehaviorSubject<any>({ _id: 'e1', name: 'BiG 7.0' }) } },
        { provide: NotificationService, useValue: notify },
        { provide: ConfirmationService, useValue: confirm },
        { provide: VolunteersService, useValue: service }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();
    fixture = TestBed.createComponent(VolunteerDepositsComponent);
    component = fixture.componentInstance;
  });

  const start = () => { fixture.detectChanges(); flushMicrotasks(); fixture.detectChanges(); };

  it('lists everyone with the totals; people who left with a deposit held come first, flagged', fakeAsync(() => {
    start();
    expect(component.rows.map(r => r.name)).toEqual(['Chand', 'Anil', 'Bela']);
    expect(el().querySelector('.vl-pill.flag')!.textContent).toContain('Left the event');
    expect(el().querySelector('.vl-stat')!.textContent).toContain('₹1,000 held');
    expect(el().querySelector('.vl-std')!.textContent).toContain('₹1,000');
    component.setFilter('none');
    expect(component.rows.map(r => r.name)).toEqual(['Anil']);
  }));

  it('people who only see the status get no amounts, no export and no buttons', fakeAsync(() => {
    canManage = false;
    seeAmounts = false;
    start();
    expect(el().querySelectorAll('.vl-tbl th').length).toBe(3);
    expect(el().querySelector('.vl-std')).toBeNull();
    expect(el().querySelector('.page-ph .btn-ghost')).toBeNull();
    component.open(component.rows[2]);
    fixture.detectChanges();
    expect(component.mode).toBe('view');
    expect(el().querySelector('.vl-acts')).toBeNull();
    expect(el().querySelector('.vl-prof')!.textContent).toContain('Amounts are shown to people with Write access');
  }));

  it('records a deposit with the standard amount pre-filled', fakeAsync(() => {
    start();
    component.open(component.rows[1]);   // Anil: nothing recorded → the form
    expect(component.mode).toBe('record');
    expect(component.form.amount).toBe(1000);
    component.form.amount = 0;
    component.saveRecord();
    expect(component.formError).toContain('Amount');

    service.saveDeposit.and.returnValue(Promise.resolve(row('1', 'Anil', held)));
    component.form.amount = 750;
    component.form.mode = 'upi';
    component.form.note = ' Receipt 4 ';
    component.saveRecord();
    flushMicrotasks();
    expect(service.saveDeposit).toHaveBeenCalledWith('e1', '1', { amount: 750, mode: 'upi', note: 'Receipt 4' });
    expect(notify.openSucessSnackBar).toHaveBeenCalledWith('Deposit recorded: Anil, ₹750');
    expect(service.deposits).toHaveBeenCalledTimes(2);
  }));

  it('refunds in full, and removes a mistaken entry after a confirm', fakeAsync(() => {
    start();
    const bela = component.rows[2];
    component.open(bela);
    expect(component.mode).toBe('view');
    component.startRefund(bela);
    fixture.detectChanges();
    expect(el().querySelector('.vd-big')!.textContent).toContain('₹500');
    service.refundDeposit.and.returnValue(Promise.resolve(row('2', 'Bela', { ...held, status: 'refunded' })));
    component.refundForm.mode = 'bank';
    component.saveRefund();
    flushMicrotasks();
    expect(service.refundDeposit).toHaveBeenCalledWith('e1', '2', 'bank', '');
    expect(notify.openSucessSnackBar).toHaveBeenCalledWith('Refunded ₹500 to Bela');

    confirm.confirm.and.returnValue(of(true));
    service.removeDeposit.and.returnValue(Promise.resolve({ ok: true }));
    component.remove(bela);
    flushMicrotasks();
    expect(service.removeDeposit).toHaveBeenCalledWith('e1', '2');
  }));

  it('saves the standard deposit', fakeAsync(() => {
    start();
    component.startStandard();
    expect(component.standard).toBe(1000);
    service.setDefaultDeposit.and.returnValue(Promise.resolve({ defaultAmount: 1500 }));
    component.standard = 1500;
    component.saveStandard();
    flushMicrotasks();
    expect(service.setDefaultDeposit).toHaveBeenCalledWith('e1', 1500);
    expect(notify.openSucessSnackBar).toHaveBeenCalledWith('Standard deposit: ₹1,500');
  }));
});
