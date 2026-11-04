import { Component, OnInit } from '@angular/core';
import { AdminService, PublicPageSettings } from '../admin.service';
import { NotificationService } from '../../core/notification.service';
import { environment } from 'src/environments/environment.development';

/**
 * Admin › Public Page (PUBLIC_HOME_CONTEXT.md, PH1). Switches the public
 * participant page (rchomeproject.in/live) on / off, picks the event it shows
 * (active events with dates only — several can be active at once) and how
 * many days before / after the event it is visible. DEV/DIR/ADMIN only;
 * the backend checks the same rule. Later stories add emergency contacts,
 * SOS recipients, photos and stats here.
 */
@Component({
  selector: 'app-public-page',
  templateUrl: './public-page.component.html',
  styleUrls: ['./public-page.component.css']
})
export class PublicPageComponent implements OnInit {
  readonly maxDays = 60;
  readonly publicUrl = environment.publicPageUrl;

  loading = true;
  saving = false;
  loadError = '';
  saveError = '';

  saved: PublicPageSettings | null = null;
  /** Stored list (set only when a response arrives), not a getter — see the *ngFor / <app-option> rule. */
  events: PublicPageSettings['events'] = [];

  enabled = false;
  eventId: string | null = null;
  showBeforeDays = 14;
  showAfterDays = 14;

  constructor(private admin: AdminService, private notify: NotificationService) {}

  ngOnInit(): void {
    this.admin.getPublicPage().subscribe({
      next: s => { this.apply(s); this.loading = false; },
      error: () => { this.loadError = 'Could not load the public page settings.'; this.loading = false; }
    });
  }

  /** The saved event is no longer active, so the public page is off for now. */
  get savedEventInactive(): boolean {
    return !!this.saved?.event && !this.saved.event.active;
  }

  get daysValid(): boolean {
    const ok = (n: number) => Number.isInteger(n) && n >= 0 && n <= this.maxDays;
    return ok(this.showBeforeDays) && ok(this.showAfterDays);
  }

  get canSave(): boolean {
    return !this.saving && this.daysValid && (!this.enabled || !!this.eventId) && this.dirty;
  }

  get dirty(): boolean {
    const s = this.saved;
    return !s || s.enabled !== this.enabled || (s.event?._id ?? null) !== this.eventId
      || s.showBeforeDays !== this.showBeforeDays || s.showAfterDays !== this.showAfterDays;
  }

  trackEvent = (_: number, e: { _id: string }) => e._id;

  setEnabled(on: boolean): void {
    this.enabled = on;
    this.saveError = '';
  }

  save(): void {
    if (!this.canSave) return;
    this.saving = true;
    this.saveError = '';
    this.admin.savePublicPage({
      enabled: this.enabled, event: this.eventId,
      showBeforeDays: this.showBeforeDays, showAfterDays: this.showAfterDays
    }).subscribe({
      next: s => {
        this.apply(s);
        this.saving = false;
        this.notify.openSucessSnackBar(s.enabled ? 'Public page is on' : 'Public page is off');
      },
      error: err => {
        this.saving = false;
        this.saveError = err?.error?.message || err?.error?.errors?.[0]?.msg || 'Could not save. Please try again.';
      }
    });
  }

  private apply(s: PublicPageSettings): void {
    this.saved = s;
    this.events = s.events;
    this.enabled = s.enabled;
    // An event that is no longer active can't be picked again; leave the picker empty.
    this.eventId = s.event && s.events.some(e => e._id === s.event!._id) ? s.event._id : null;
    this.showBeforeDays = s.showBeforeDays;
    this.showAfterDays = s.showAfterDays;
  }
}
