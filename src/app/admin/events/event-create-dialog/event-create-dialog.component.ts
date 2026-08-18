import { Component } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { MatDialogRef } from '@angular/material/dialog';
import { EventService } from '../../../core/event.service';
import { NotificationService } from '../../../core/notification.service';

@Component({
  selector: 'app-event-create-dialog',
  templateUrl: './event-create-dialog.component.html',
})
export class EventCreateDialogComponent {
  form = new FormGroup({
    name: new FormControl('', Validators.required),
    description: new FormControl(''),
    startDate: new FormControl(''),
    endDate: new FormControl('')
  });
  saving = false;

  constructor(
    private dialogRef: MatDialogRef<EventCreateDialogComponent>,
    private eventService: EventService,
    private notificationService: NotificationService
  ) {}

  save() {
    if (this.form.invalid || this.saving) return;
    this.saving = true;
    const { name, description, startDate, endDate } = this.form.value;
    this.eventService.createEvent({
      name: name!.trim(),
      description: description || '',
      startDate: startDate || undefined,
      endDate: endDate || undefined
    }).subscribe({
      next: (event) => {
        this.saving = false;
        this.dialogRef.close(event);
      },
      error: (err) => {
        this.saving = false;
        this.notificationService.openErrorSnackBar(err?.error?.message || 'Error creating event');
      }
    });
  }

  cancel() {
    this.dialogRef.close(null);
  }
}
