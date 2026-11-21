import { Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { ConfirmationService } from '../confirm-dialog/confirmation.service';
import { NotificationService } from '../../core/notification.service';
import { ReportedService } from '../../core/reported.service';
import { JOIN_STATE_LABEL, JoinState, joinState, localDateTime } from '../../core/join-time';

export interface ReportedChange {
  reportedAt: string | null;
  reportedBy: { _id: string; name: string } | null;
}

/**
 * Joining Time: one person's Expected Join Time and Reported Time, with Mark
 * reported / Change time / Undo for the people allowed (core/reported-access.ts;
 * the server checks again). Used in Admin › Users and the Volunteers profile.
 */
@Component({
  selector: 'app-reported',
  templateUrl: './reported.component.html'
})
export class ReportedComponent implements OnChanges {
  @Input() userId = '';
  @Input() eventId = '';
  @Input() name = '';
  @Input() role = '';
  /** Home department id ('' = none / the Volunteer pool). */
  @Input() home: string | null = '';
  @Input() expectedAt: string | null = null;
  @Input() reportedAt: string | null = null;
  @Input() reportedBy: { _id: string; name: string } | null = null;
  @Output() changed = new EventEmitter<ReportedChange>();

  state: JoinState = 'unknown';
  label = '';
  canSet = false;
  editing = false;
  when = '';
  maxNow = '';
  busy = false;

  constructor(private reported: ReportedService, private confirm: ConfirmationService, private notify: NotificationService) {}

  ngOnChanges() {
    this.state = joinState(this.expectedAt, this.reportedAt);
    this.label = JOIN_STATE_LABEL[this.state];
    this.canSet = !!this.eventId && this.reported.canSet(this.role, this.home);
    this.editing = false;
  }

  startEdit() {
    const now = new Date();
    this.maxNow = localDateTime(now);
    this.when = this.reportedAt ? localDateTime(new Date(this.reportedAt)) : this.maxNow;
    this.editing = true;
  }

  async save() {
    const at = new Date(this.when);
    if (!this.when || isNaN(at.getTime())) return;
    if (at.getTime() > Date.now() + 60_000) { this.notify.openErrorSnackBar('The Reported Time cannot be in the future'); return; }
    this.busy = true;
    try {
      const res = await this.reported.mark(this.userId, this.eventId, at.toISOString());
      this.notify.openSucessSnackBar(`${this.name} marked reported` + (res.marked ? ` · ${res.marked} attendance slot${res.marked === 1 ? '' : 's'} marked` : ''));
      this.changed.emit({ reportedAt: res.reportedAt, reportedBy: res.reportedBy });
      this.editing = false;
    } catch (err: any) {
      this.notify.openErrorSnackBar(err?.error?.message || err?.error?.errors?.[0]?.msg || 'Could not mark them reported');
    } finally {
      this.busy = false;
    }
  }

  undo() {
    this.confirm.confirm({
      title: 'Undo Reported?',
      message: `${this.name} goes back to "not reported yet". Attendance marked automatically when they reported is removed; marks made by hand stay.`,
      confirmText: 'Undo Reported', danger: true
    }).subscribe(async ok => {
      if (!ok) return;
      this.busy = true;
      try {
        await this.reported.undo(this.userId, this.eventId);
        this.notify.openSucessSnackBar(`${this.name} is not reported any more`);
        this.changed.emit({ reportedAt: null, reportedBy: null });
      } catch (err: any) {
        this.notify.openErrorSnackBar(err?.error?.message || 'Could not undo Reported');
      } finally {
        this.busy = false;
      }
    });
  }
}
