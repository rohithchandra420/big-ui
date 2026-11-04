import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription, firstValueFrom } from 'rxjs';
import { EventService } from '../../core/event.service';
import { NotificationService } from '../../core/notification.service';
import { BoxOfficeService, BoxOfficeStatus } from '../box-office.service';

/**
 * Registration › the Box Office's open / closed status (2026-11-04), shown to
 * everyone on the Venue Map (on the event's Box Office pin). Everyone here sees
 * it; the Box Office TL and DEV/DIR/ADMIN change it (the server checks too).
 */
@Component({
  selector: 'app-box-office-status',
  templateUrl: './box-office-status.component.html',
  styleUrls: ['./box-office-status.component.css']
})
export class BoxOfficeStatusComponent implements OnInit, OnDestroy {
  status: BoxOfficeStatus | null = null;
  note = '';
  saving = false;
  private eventId = '';
  private sub = new Subscription();

  constructor(
    private boxOffice: BoxOfficeService,
    private events: EventService,
    private notify: NotificationService
  ) {}

  ngOnInit() {
    this.sub.add(this.events.activeEvent.subscribe(ev => {
      this.eventId = ev?._id || '';
      this.status = null;
      if (this.eventId) this.load();
    }));
  }

  ngOnDestroy() {
    this.sub.unsubscribe();
  }

  async load() {
    try {
      this.status = await firstValueFrom(this.boxOffice.getStatus(this.eventId));
      this.note = this.status.note;
    } catch {
      this.status = null;   // the bar simply doesn't show
    }
  }

  /** The note changed but isn't saved yet. */
  get noteDirty(): boolean { return !!this.status && this.note.trim() !== this.status.note; }

  async set(open: boolean) {
    if (!this.status || this.saving) return;
    this.saving = true;
    try {
      this.status = await firstValueFrom(this.boxOffice.setStatus(this.eventId, open, this.note.trim()));
      this.note = this.status.note;
      this.notify.openSucessSnackBar(open ? 'Box Office open on the map' : 'Box Office closed on the map');
    } catch (err: any) {
      this.notify.openErrorSnackBar(err?.error?.message || 'Could not change the Box Office status');
    } finally {
      this.saving = false;
    }
  }

  time(iso: string | null): string {
    return iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '';
  }
}
