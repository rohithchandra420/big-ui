import { ComponentFixture, TestBed, fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { BehaviorSubject, of } from 'rxjs';
import { WashStockComponent } from './wash-stock.component';
import { SlidePanelComponent } from '../../shared/slide-panel/slide-panel.component';
import { EventService } from '../../core/event.service';
import { NotificationService } from '../../core/notification.service';
import { ConfirmationService } from '../../shared/confirm-dialog/confirmation.service';
import { WashService } from '../wash.service';
import { StockItem } from '../wash.model';

const item = (id: string, name: string, quantity: number, lowLimit: number): StockItem =>
  ({ _id: id, name, unit: 'rolls', quantity, lowLimit, low: lowLimit > 0 && quantity <= lowLimit });

describe('WashStockComponent', () => {
  let fixture: ComponentFixture<WashStockComponent>;
  let component: WashStockComponent;
  let service: jasmine.SpyObj<WashService>;
  let notify: jasmine.SpyObj<NotificationService>;
  let confirm: jasmine.SpyObj<ConfirmationService>;
  let canManage: boolean;

  beforeEach(async () => {
    canManage = true;
    service = jasmine.createSpyObj('WashService', ['stock', 'addItem', 'updateItem', 'deleteItem', 'moveStock', 'stockHistory']);
    service.stock.and.callFake(() => Promise.resolve({
      items: [item('s1', 'Soap', 40, 10), item('s2', 'Toilet paper', 20, 30), item('s3', 'Bin bags', 0, 0)], canManage
    }));
    service.stockHistory.and.returnValue(Promise.resolve([]));
    notify = jasmine.createSpyObj('NotificationService', ['openSucessSnackBar', 'openErrorSnackBar']);
    confirm = jasmine.createSpyObj('ConfirmationService', ['confirm']);
    await TestBed.configureTestingModule({
      declarations: [WashStockComponent, SlidePanelComponent],
      imports: [FormsModule],
      providers: [
        { provide: EventService, useValue: { activeEvent: new BehaviorSubject<any>({ _id: 'e1', name: 'BiG 7.0' }) } },
        { provide: NotificationService, useValue: notify },
        { provide: ConfirmationService, useValue: confirm },
        { provide: WashService, useValue: service }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();
    fixture = TestBed.createComponent(WashStockComponent);
    component = fixture.componentInstance;
  });

  const start = () => { fixture.detectChanges(); flushMicrotasks(); fixture.detectChanges(); };

  it('lists the store with low items first; view-only people get no buttons', fakeAsync(() => {
    canManage = false;
    start();
    expect(component.rows.map(r => r.item.name)).toEqual(['Toilet paper', 'Bin bags', 'Soap']);
    expect(component.lowCount).toBe(1);
    expect(fixture.nativeElement.querySelectorAll('.wk-row.low').length).toBe(1);
    expect(fixture.nativeElement.querySelectorAll('.wk-acts').length).toBe(0);
    expect(fixture.nativeElement.querySelector('.btn-cta')).toBeNull();
  }));

  it('warns when Used is more than the store, still saves, and says what was short', fakeAsync(() => {
    start();
    component.startMove(component.items[1], 'used');
    component.moveQty = 25;
    fixture.detectChanges();
    expect(component.overBy).toBe(5);
    expect(fixture.nativeElement.querySelector('.wk-warn').textContent).toContain('Saving sets Toilet paper to 0');

    service.moveStock.and.returnValue(Promise.resolve({ item: item('s2', 'Toilet paper', 0, 30), short: 5, becameLow: false }));
    component.saveMove();
    flushMicrotasks();
    expect(service.moveStock).toHaveBeenCalledWith('s2', 'used', 25, '');
    expect(notify.openErrorSnackBar).toHaveBeenCalledWith('Only 20 rolls were in store — Toilet paper is now at 0.');
    expect(component.mode).toBe('view');
    expect(component.items.find(i => i._id === 's2')!.quantity).toBe(0);
  }));

  it('refuses a bad quantity and records Received', fakeAsync(() => {
    start();
    component.startMove(component.items[0], 'received');
    component.moveQty = 0;
    component.saveMove();
    expect(component.formError).toContain('1 or more');
    service.moveStock.and.returnValue(Promise.resolve({ item: item('s1', 'Soap', 90, 10), short: 0, becameLow: false }));
    component.moveQty = 50;
    component.moveNote = ' Delivery ';
    component.saveMove();
    flushMicrotasks();
    expect(service.moveStock).toHaveBeenCalledWith('s1', 'received', 50, 'Delivery');
    expect(notify.openSucessSnackBar).toHaveBeenCalledWith('Soap: 90 rolls in store');
  }));

  it('adds, edits and deletes an item', fakeAsync(() => {
    start();
    component.startNew();
    component.saveItem();
    expect(component.formError).toBe('Give the item a name.');
    component.form = { name: ' Sanitiser ', unit: 'litres', lowLimit: 8, quantity: 30 };
    service.addItem.and.returnValue(Promise.resolve(item('s4', 'Sanitiser', 30, 8)));
    component.saveItem();
    flushMicrotasks();
    expect(service.addItem).toHaveBeenCalledWith('e1', { name: 'Sanitiser', unit: 'litres', lowLimit: 8, quantity: 30 });

    component.startEdit(component.items[0]);
    component.form.lowLimit = 15;
    service.updateItem.and.returnValue(Promise.resolve(item('s1', 'Soap', 40, 15)));
    component.saveItem();
    flushMicrotasks();
    expect(service.updateItem).toHaveBeenCalledWith('s1', { name: 'Soap', unit: 'rolls', lowLimit: 15 });

    confirm.confirm.and.returnValue(of(true));
    service.deleteItem.and.returnValue(Promise.resolve({ ok: true, logs: 2 }));
    component.remove(component.items[0]);
    flushMicrotasks();
    expect(service.deleteItem).toHaveBeenCalledWith('s1');
  }));
});
