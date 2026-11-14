import { Component, Input, OnChanges } from '@angular/core';
import { NotificationService } from '../../core/notification.service';
import { VolunteersService } from '../volunteers.service';
import { NeedInfo } from '../volunteers.model';
import { NeedStatus, needStatus } from '../volunteers.utils';

/**
 * "Volunteers needed" for one department on one event (My Department).
 * The department's own Team Lead (and DEV/DIR/ADMIN) sets the number; the
 * Volunteers board shows it against how many the department has. People who
 * may not see it get nothing (the server answers 403 and the row stays hidden).
 *
 *   <app-volunteer-need [departmentId]="id" [eventId]="event._id"></app-volunteer-need>
 */
@Component({
  selector: 'app-volunteer-need',
  templateUrl: './volunteer-need.component.html',
  styleUrls: ['./volunteer-need.component.css']
})
export class VolunteerNeedComponent implements OnChanges {
  @Input() departmentId = '';
  @Input() eventId = '';

  info: NeedInfo | null = null;
  status: NeedStatus | null = null;
  editing = false;
  value: number | null = null;
  error = '';
  busy = false;

  constructor(private volunteers: VolunteersService, private notify: NotificationService) {}

  ngOnChanges() {
    this.editing = false;
    this.load();
  }

  private set(info: NeedInfo | null) {
    this.info = info;
    this.status = info ? needStatus(info.have, info.needed) : null;
  }

  async load() {
    const dept = this.departmentId, event = this.eventId;
    this.set(null);
    if (!dept || !event || dept === 'ALL') return;
    try {
      const info = await this.volunteers.need(event, dept);
      if (dept === this.departmentId && event === this.eventId) this.set(info);
    } catch {
      this.set(null);   // no access, or no such event: show nothing
    }
  }

  edit() {
    this.value = this.info?.needed || null;
    this.error = '';
    this.editing = true;
  }

  async save() {
    if (this.busy) return;
    const n = Number(this.value ?? 0);
    if (!Number.isInteger(n) || n < 0 || n > 1000) { this.error = 'A whole number from 0 to 1000 (0 = no number).'; return; }
    this.busy = true;
    this.error = '';
    try {
      this.set(await this.volunteers.setNeed(this.eventId, this.departmentId, n));
      this.editing = false;
      this.notify.openSucessSnackBar('Saved');
    } catch (err: any) {
      this.error = err?.error?.message || 'Could not save the number.';
    } finally {
      this.busy = false;
    }
  }
}
