import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { FormArray, FormControl, FormGroup, Validators } from '@angular/forms';

import { Ticket } from '../../../models/ticket.model';
import { BoxOfficeService } from '../../box-office.service';
import { NotificationService } from '../../../core/notification.service';
import { ALL_ITEM_NAMES } from '../../box-office.utils';

/**
 * On-the-spot ticket creation for walk-ins with no prior online booking.
 * Reuses the same POST /box-office/createTicket endpoint and shopcart
 * (item_name + quantity, Add/Remove) pattern as the old BoxOfficeComponent's
 * "Register Participant" form — order_id/transaction_id are omitted here so
 * the backend auto-assigns them, instead of staff typing them in manually.
 */
@Component({
  selector: 'app-spot-registration',
  templateUrl: './spot-registration.component.html',
  styleUrls: ['./spot-registration.component.css']
})
export class SpotRegistrationComponent implements OnInit {

  @Output() registered = new EventEmitter<Ticket>();
  @Output() cancelled = new EventEmitter<void>();

  readonly itemNameOptions = ALL_ITEM_NAMES;

  form!: FormGroup;
  saving = false;

  constructor(
    private boxOfficeService: BoxOfficeService,
    private notificationService: NotificationService
  ) { }

  ngOnInit() {
    this.form = new FormGroup({
      first_name: new FormControl('', Validators.required),
      last_name: new FormControl('', Validators.required),
      email: new FormControl('', [Validators.required, Validators.email]),
      phone_no: new FormControl('', Validators.required),
      totalPrice: new FormControl(null, [Validators.required, Validators.min(0)]),
      shopcart: new FormArray([this.newItemGroup()]),
    });
  }

  get shopcart(): FormArray {
    return this.form.get('shopcart') as FormArray;
  }

  private newItemGroup(): FormGroup {
    return new FormGroup({
      item_name: new FormControl('', Validators.required),
      quantity: new FormControl(1, [Validators.required, Validators.min(1)]),
    });
  }

  addItem() {
    this.shopcart.push(this.newItemGroup());
  }

  removeItem(index: number) {
    if (this.shopcart.length > 1) {
      this.shopcart.removeAt(index);
    }
  }

  save() {
    if (this.form.invalid || this.saving) {
      return;
    }
    this.saving = true;
    const { first_name, last_name, email, phone_no, totalPrice, shopcart } = this.form.value;

    const ticket: Partial<Ticket> = {
      first_name: first_name!.trim(),
      last_name: last_name!.trim(),
      email: email!.trim(),
      phone_no: phone_no!.trim(),
      totalPrice: Number(totalPrice),
      hasEmailSent: 'Not Yet',
      shopcart: shopcart as any,
    };

    this.boxOfficeService.createBoxOfficeTicket(ticket).subscribe({
      next: (created) => {
        this.saving = false;
        this.notificationService.openSucessSnackBar('Registered — Order #' + created.order_id);
        this.registered.emit(created);
      },
      error: (err) => {
        this.saving = false;
        this.notificationService.openErrorSnackBar(err?.error?.message || 'Failed to register attendee');
      }
    });
  }

  cancel() {
    this.cancelled.emit();
  }
}
