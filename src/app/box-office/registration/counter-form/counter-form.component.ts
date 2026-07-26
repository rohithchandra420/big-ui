import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';

import { Gender, Shopcart } from '../../../models/ticket.model';
import { BoxOfficeService } from '../../box-office.service';
import { NotificationService } from '../../../core/notification.service';

@Component({
  selector: 'app-counter-form',
  templateUrl: './counter-form.component.html',
  styleUrls: ['./counter-form.component.css']
})
export class CounterFormComponent implements OnInit {

  @Input() shopItem!: Shopcart;
  @Output() saved = new EventEmitter<Shopcart>();
  @Output() cancelled = new EventEmitter<void>();

  form!: FormGroup;
  saving = false;

  /** Captured before any edits — distinguishes "correcting existing details" (opened via Edit) from "filling in missing ones" (opened via Fill at the Counter), for the banner/title wording only. */
  isEditing = false;

  readonly genderOptions: Gender[] = ['Male', 'Female', 'Prefer not to say'];

  constructor(
    private boxOfficeService: BoxOfficeService,
    private notificationService: NotificationService
  ) { }

  ngOnInit() {
    this.isEditing = !!this.shopItem.name && !!this.shopItem.phone_no && !!this.shopItem.email;
    this.form = new FormGroup({
      name: new FormControl(this.shopItem.name || '', Validators.required),
      phone_no: new FormControl(this.shopItem.phone_no || '', Validators.required),
      email: new FormControl(this.shopItem.email || '', [Validators.required, Validators.email]),
      gender: new FormControl(this.shopItem.gender || ''),
    });
  }

  save() {
    if (this.form.invalid || this.saving) {
      return;
    }
    this.saving = true;
    const { name, phone_no, email, gender } = this.form.value;

    this.boxOfficeService.updateShopcartDetails(this.shopItem._id!, {
      name: name!.trim(),
      phone_no: phone_no!.trim(),
      email: email!.trim(),
      gender: gender || null
    }).subscribe({
      next: (updated) => {
        this.saving = false;
        this.notificationService.openSucessSnackBar('Details saved');
        this.saved.emit(updated);
      },
      error: () => {
        this.saving = false;
        this.notificationService.openErrorSnackBar('Failed to save details');
      }
    });
  }

  back() {
    this.cancelled.emit();
  }
}
