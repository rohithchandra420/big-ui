import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { of, throwError } from 'rxjs';

import { CounterFormComponent } from './counter-form.component';
import { BoxOfficeService } from '../../box-office.service';
import { NotificationService } from '../../../core/notification.service';
import { Shopcart } from '../../../models/ticket.model';

const mockShopItem: Shopcart = {
  _id: 's1', item_name: 'Festival Ticket', item_quantity: 1, order_id: 1,
  admissionId: null as any, isAdmitted: false, isActive: true,
  name: '', phone_no: '', email: ''
} as any;

describe('CounterFormComponent', () => {
  let component: CounterFormComponent;
  let fixture: ComponentFixture<CounterFormComponent>;
  let boxOfficeServiceSpy: jasmine.SpyObj<BoxOfficeService>;
  let notificationSpy: jasmine.SpyObj<NotificationService>;

  beforeEach(async () => {
    boxOfficeServiceSpy = jasmine.createSpyObj('BoxOfficeService', ['updateShopcartDetails']);
    notificationSpy = jasmine.createSpyObj('NotificationService', ['openSucessSnackBar', 'openErrorSnackBar']);

    await TestBed.configureTestingModule({
      declarations: [CounterFormComponent],
      imports: [ReactiveFormsModule],
      providers: [
        { provide: BoxOfficeService, useValue: boxOfficeServiceSpy },
        { provide: NotificationService, useValue: notificationSpy },
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();

    fixture = TestBed.createComponent(CounterFormComponent);
    component = fixture.componentInstance;
    component.shopItem = mockShopItem;
    fixture.detectChanges();
  });

  it('builds the form pre-filled from the shopcart item', () => {
    expect(component.form.value).toEqual({ name: '', phone_no: '', email: '', gender: '' });
  });

  it('isEditing is false when opened to fill in missing details', () => {
    expect(component.isEditing).toBeFalse();
  });

  it('isEditing is true when opened on an item that already has complete details', () => {
    const completeFixture = TestBed.createComponent(CounterFormComponent);
    completeFixture.componentInstance.shopItem = { ...mockShopItem, name: 'Arjun Mehta', phone_no: '9000000001', email: 'arjun@example.com' };
    completeFixture.detectChanges();
    expect(completeFixture.componentInstance.isEditing).toBeTrue();
  });

  it('does not save while the form is invalid', () => {
    component.save();
    expect(boxOfficeServiceSpy.updateShopcartDetails).not.toHaveBeenCalled();
  });

  it('saves trimmed details and emits saved on success (gender left unset)', () => {
    const updated = { ...mockShopItem, name: 'Kavya Reddy' };
    boxOfficeServiceSpy.updateShopcartDetails.and.returnValue(of(updated));
    const savedSpy = spyOn(component.saved, 'emit');

    // Validators.email rejects surrounding whitespace, so only name/phone (plain
    // "required" validators) exercise the trim-before-submit behavior here.
    component.form.setValue({ name: '  Kavya Reddy  ', phone_no: ' 9000000009 ', email: 'kavya@example.com', gender: '' });
    component.save();

    expect(boxOfficeServiceSpy.updateShopcartDetails).toHaveBeenCalledWith('s1', {
      name: 'Kavya Reddy', phone_no: '9000000009', email: 'kavya@example.com', gender: null
    });
    expect(notificationSpy.openSucessSnackBar).toHaveBeenCalled();
    expect(savedSpy).toHaveBeenCalledWith(updated);
    expect(component.saving).toBeFalse();
  });

  it('includes gender in the save payload when selected', () => {
    boxOfficeServiceSpy.updateShopcartDetails.and.returnValue(of(mockShopItem));

    component.form.setValue({ name: 'Kavya Reddy', phone_no: '9000000009', email: 'kavya@example.com', gender: 'Female' });
    component.save();

    expect(boxOfficeServiceSpy.updateShopcartDetails).toHaveBeenCalledWith('s1', {
      name: 'Kavya Reddy', phone_no: '9000000009', email: 'kavya@example.com', gender: 'Female'
    });
  });

  it('shows an error notification and does not emit saved when the request fails', () => {
    boxOfficeServiceSpy.updateShopcartDetails.and.returnValue(throwError(() => new Error('fail')));
    const savedSpy = spyOn(component.saved, 'emit');

    component.form.setValue({ name: 'Kavya Reddy', phone_no: '9000000009', email: 'kavya@example.com', gender: '' });
    component.save();

    expect(notificationSpy.openErrorSnackBar).toHaveBeenCalled();
    expect(savedSpy).not.toHaveBeenCalled();
    expect(component.saving).toBeFalse();
  });

  it('back() emits cancelled', () => {
    const cancelledSpy = spyOn(component.cancelled, 'emit');
    component.back();
    expect(cancelledSpy).toHaveBeenCalled();
  });
});
