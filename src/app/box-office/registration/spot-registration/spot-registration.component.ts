import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { FormArray, FormControl, FormGroup, Validators } from '@angular/forms';

import { Ticket } from '../../../models/ticket.model';
import { BoxOfficeService } from '../../box-office.service';
import { NotificationService } from '../../../core/notification.service';
import { EventService } from '../../../core/event.service';
import { PassType } from '../../../models/event.model';
import { EmailConfig } from '../../../models/email.model';
import { EmailService } from '../../../core/email.service';
import { EmailBatchTrackerService } from '../../../core/email-batch-tracker.service';
import { isValidEmail, recallTester, rememberTester } from '../../email/email-tester';

/**
 * On-the-spot ticket creation for walk-ins with no prior online booking.
 * Reuses the same POST /box-office/createTicket endpoint and shopcart
 * (Add/Remove) pattern as the old BoxOfficeComponent's "Register Participant"
 * form — order_id/transaction_id are omitted here so the backend
 * auto-assigns them, instead of staff typing them in manually.
 *
 * Introducing Events: the item_name text dropdown is replaced with a live
 * PassType picker, sourced from the currently active event (see
 * INTRODUCING_EVENTS_CONTEXT.md) — options come from
 * EventService.getEventDetail(), not a hardcoded list.
 */
@Component({
  selector: 'app-spot-registration',
  templateUrl: './spot-registration.component.html',
  styleUrls: ['./spot-registration.component.css']
})
export class SpotRegistrationComponent implements OnInit {

  @Output() registered = new EventEmitter<Ticket>();
  @Output() cancelled = new EventEmitter<void>();

  passTypeOptions: PassType[] = [];
  loadingPassTypes = false;

  form!: FormGroup;
  saving = false;

  // Email epic — "Email ticket to buyer" right after registering (default on
  // for people who can send). In test mode the email goes to a tester address.
  emailConfig: EmailConfig | null = null;
  emailTicket = true;
  tester = recallTester();

  constructor(
    private boxOfficeService: BoxOfficeService,
    private notificationService: NotificationService,
    private eventService: EventService,
    private emailService: EmailService,
    private emailTracker: EmailBatchTrackerService
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
    this.loadPassTypes();
    this.emailService.getConfig(true).subscribe(config => this.emailConfig = config);
  }

  get willEmail(): boolean {
    return !!this.emailConfig?.canSendTicket && this.emailTicket;
  }

  get testerNeeded(): boolean {
    return this.willEmail && !!this.emailConfig?.safeMode;
  }

  get testerValid(): boolean {
    return !this.testerNeeded || isValidEmail(this.tester);
  }

  private loadPassTypes() {
    const activeEvent = this.eventService.currentActiveEvent;
    if (!activeEvent) return;
    this.loadingPassTypes = true;
    this.eventService.getEventDetail(activeEvent._id).subscribe({
      next: (detail) => {
        this.passTypeOptions = detail.passTypes;
        this.loadingPassTypes = false;
      },
      error: () => {
        this.notificationService.openErrorSnackBar('Error loading pass types for this event');
        this.loadingPassTypes = false;
      }
    });
  }

  get shopcart(): FormArray {
    return this.form.get('shopcart') as FormArray;
  }

  private newItemGroup(): FormGroup {
    return new FormGroup({
      passTypeId: new FormControl('', Validators.required),
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
    const activeEvent = this.eventService.currentActiveEvent;
    if (this.form.invalid || this.saving || !activeEvent || !this.testerValid) {
      if (!activeEvent) this.notificationService.openErrorSnackBar('No event selected');
      return;
    }
    this.saving = true;
    const { first_name, last_name, email, phone_no, totalPrice, shopcart } = this.form.value;

    const ticket: any = {
      eventId: activeEvent._id,
      first_name: first_name!.trim(),
      last_name: last_name!.trim(),
      email: email!.trim(),
      phone_no: phone_no!.trim(),
      totalPrice: Number(totalPrice),
      shopcart: shopcart,
    };

    this.boxOfficeService.createBoxOfficeTicket(ticket).subscribe({
      next: (created) => {
        this.saving = false;
        this.notificationService.openSucessSnackBar('Registered — Order #' + created.order_id);
        if (this.willEmail && created._id) this.emailTicketFor(created);
        this.registered.emit(created);
      },
      error: (err) => {
        this.saving = false;
        this.notificationService.openErrorSnackBar(err?.error?.message || 'Failed to register attendee');
      }
    });
  }

  /** Sends the new booking's Ticket Email in the background; the progress
   *  card follows it. Registration has already succeeded either way. */
  private emailTicketFor(created: Ticket) {
    const tester = this.testerNeeded ? this.tester.trim() : undefined;
    if (tester) rememberTester(tester);
    this.emailService.sendTicketEmails([created._id!], 'unsent', tester).subscribe({
      next: batch => this.emailTracker.track(batch, `Ticket email · ${created.first_name} ${created.last_name}`.trim()),
      error: err => this.notificationService.openErrorSnackBar(
        'Registered, but the ticket email could not be sent: ' + (err?.error?.message || 'please try again from Booking Found'))
    });
  }

  cancel() {
    this.cancelled.emit();
  }
}
