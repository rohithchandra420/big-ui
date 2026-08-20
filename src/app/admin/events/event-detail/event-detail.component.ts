import { Component, OnInit } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { EventService } from '../../../core/event.service';
import { NotificationService } from '../../../core/notification.service';
import { EventDetail, EventStatus, PassType, PassTypeCategory } from '../../../models/event.model';

@Component({
  selector: 'app-event-detail',
  templateUrl: './event-detail.component.html',
  styleUrls: ['./event-detail.component.css']
})
export class EventDetailComponent implements OnInit {
  detail: EventDetail | null = null;
  loading = false;
  editMode = false;
  saving = false;

  readonly statuses: EventStatus[] = ['draft', 'active', 'archived'];
  readonly categories: PassTypeCategory[] = ['festival', 'tent', 'addon'];

  editForm = new FormGroup({
    name: new FormControl('', Validators.required),
    description: new FormControl(''),
    startDate: new FormControl(''),
    endDate: new FormControl(''),
    status: new FormControl<EventStatus>('draft')
  });

  // New pass type form, shown inline below the pass type list. `code` is
  // only really meaningful for category 'tent' (see ACCOMMODATION_CONTEXT.md
  // decision #11) but shown for every category — harmless if unused.
  addingPassType = false;
  passTypeForm = new FormGroup({
    name: new FormControl('', Validators.required),
    category: new FormControl<PassTypeCategory>('festival', Validators.required),
    code: new FormControl('', Validators.maxLength(4))
  });
  savingPassType = false;

  editingPassTypeId: string | null = null;
  editPassTypeForm = new FormGroup({
    name: new FormControl('', Validators.required),
    category: new FormControl<PassTypeCategory>('festival', Validators.required),
    code: new FormControl('', Validators.maxLength(4))
  });

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private eventService: EventService,
    private notificationService: NotificationService
  ) {}

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) this.loadDetail(id);
  }

  loadDetail(id: string) {
    this.loading = true;
    this.eventService.getEventDetail(id).subscribe({
      next: (d) => { this.detail = d; this.loading = false; },
      error: () => { this.notificationService.openErrorSnackBar('Error loading event'); this.loading = false; }
    });
  }

  enterEditMode() {
    if (!this.detail) return;
    this.editForm.setValue({
      name: this.detail.name,
      description: this.detail.description || '',
      startDate: this.detail.startDate ? this.detail.startDate.substring(0, 10) : '',
      endDate: this.detail.endDate ? this.detail.endDate.substring(0, 10) : '',
      status: this.detail.status
    });
    this.editMode = true;
  }

  cancelEdit() {
    this.editMode = false;
  }

  save() {
    if (!this.detail || this.editForm.invalid || this.saving) return;
    this.saving = true;
    const { name, description, startDate, endDate, status } = this.editForm.value;
    this.eventService.updateEvent(this.detail._id, {
      name: name!.trim(),
      description: description || '',
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      status: status || undefined
    }).subscribe({
      next: () => {
        this.saving = false;
        this.editMode = false;
        this.notificationService.openSucessSnackBar('Event updated');
        this.loadDetail(this.detail!._id);
        this.eventService.loadEvents(); // refresh the shared selector list too — status may have changed
      },
      error: (err) => {
        this.saving = false;
        this.notificationService.openErrorSnackBar(err?.error?.message || 'Error saving event');
      }
    });
  }

  deleteEvent() {
    if (!this.detail) return;
    if (!window.confirm(`Delete "${this.detail.name}"? This cannot be undone.`)) return;
    this.eventService.deleteEvent(this.detail._id).subscribe({
      next: () => {
        this.notificationService.openSucessSnackBar('Event deleted');
        this.eventService.loadEvents();
        this.router.navigate(['/admin/events']);
      },
      error: (err) => this.notificationService.openErrorSnackBar(err?.error?.message || 'Error deleting event')
    });
  }

  goBack() {
    this.router.navigate(['/admin/events']);
  }

  // ── Pass types ────────────────────────────────────────────

  startAddPassType() {
    this.passTypeForm.reset({ name: '', category: 'festival', code: '' });
    this.addingPassType = true;
  }

  cancelAddPassType() {
    this.addingPassType = false;
  }

  savePassType() {
    if (!this.detail || this.passTypeForm.invalid || this.savingPassType) return;
    this.savingPassType = true;
    const { name, category, code } = this.passTypeForm.value;
    this.eventService.createPassType(this.detail._id, { name: name!.trim(), category: category!, code: code?.trim() || undefined }).subscribe({
      next: () => {
        this.savingPassType = false;
        this.addingPassType = false;
        this.notificationService.openSucessSnackBar('Pass type added');
        this.loadDetail(this.detail!._id);
      },
      error: (err) => {
        this.savingPassType = false;
        this.notificationService.openErrorSnackBar(err?.error?.message || 'Error adding pass type');
      }
    });
  }

  startEditPassType(pt: PassType) {
    this.editingPassTypeId = pt._id;
    this.editPassTypeForm.setValue({ name: pt.name, category: pt.category, code: pt.code || '' });
  }

  cancelEditPassType() {
    this.editingPassTypeId = null;
  }

  saveEditPassType(pt: PassType) {
    if (!this.detail || this.editPassTypeForm.invalid) return;
    const { name, category, code } = this.editPassTypeForm.value;
    this.eventService.updatePassType(this.detail._id, pt._id, { name: name!.trim(), category: category!, code: code?.trim() || '' }).subscribe({
      next: () => {
        this.editingPassTypeId = null;
        this.notificationService.openSucessSnackBar('Pass type updated');
        this.loadDetail(this.detail!._id);
      },
      error: (err) => this.notificationService.openErrorSnackBar(err?.error?.message || 'Error updating pass type')
    });
  }

  deletePassType(pt: PassType) {
    if (!this.detail) return;
    if (!window.confirm(`Delete pass type "${pt.name}"?`)) return;
    this.eventService.deletePassType(this.detail._id, pt._id).subscribe({
      next: () => {
        this.notificationService.openSucessSnackBar('Pass type deleted');
        this.loadDetail(this.detail!._id);
      },
      error: (err) => this.notificationService.openErrorSnackBar(err?.error?.message || 'Error deleting pass type')
    });
  }
}
