import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';

import { Ticket } from '../../models/ticket.model';
import { BoxOfficeService } from '../box-office.service';
import { NotificationService } from '../../core/notification.service';

@Component({
  selector: 'app-ticket-edit-form',
  templateUrl: './ticket-edit-form.component.html',
  styleUrls: ['./ticket-edit-form.component.css']
})
export class TicketEditFormComponent implements OnInit {

  @Input() ticket!: Ticket;
  @Output() saved = new EventEmitter<Ticket>();
  @Output() cancelled = new EventEmitter<void>();

  form!: FormGroup;
  saving = false;

  constructor(
    private boxOfficeService: BoxOfficeService,
    private notificationService: NotificationService
  ) { }

  ngOnInit() {
    this.form = new FormGroup({
      first_name: new FormControl(this.ticket.first_name || '', Validators.required),
      last_name: new FormControl(this.ticket.last_name || '', Validators.required),
      email: new FormControl(this.ticket.email || '', [Validators.required, Validators.email]),
      phone_no: new FormControl(this.ticket.phone_no || '', Validators.required),
    });
  }

  save() {
    if (this.form.invalid || this.saving) {
      return;
    }
    this.saving = true;
    const { first_name, last_name, email, phone_no } = this.form.value;

    const updatedTicket: Ticket = {
      ...this.ticket,
      first_name: first_name!.trim(),
      last_name: last_name!.trim(),
      email: email!.trim(),
      phone_no: phone_no!.trim(),
    };

    this.boxOfficeService.updateTicketDetails(updatedTicket).subscribe({
      next: (updated) => {
        this.saving = false;
        this.notificationService.openSucessSnackBar('Ticket details saved');
        this.saved.emit(updated);
      },
      error: () => {
        this.saving = false;
        this.notificationService.openErrorSnackBar('Failed to save ticket details');
      }
    });
  }

  cancel() {
    this.cancelled.emit();
  }
}
