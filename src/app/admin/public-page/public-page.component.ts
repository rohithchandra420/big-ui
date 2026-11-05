import { Component, OnInit } from '@angular/core';
import { AdminService, PublicEmergency, PublicHelpTile, PublicPageSettings } from '../admin.service';

export const MAX_CONTACTS = 3;
export const MAX_TILES = 4;
/** Same rule as the server: digits, spaces or dashes, optional + first. */
export const PHONE = /^\+?[0-9][0-9 -]{2,18}$/;
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

  // PH4a
  readonly maxContacts = MAX_CONTACTS;
  readonly maxTiles = MAX_TILES;
  // PH4b
  sosEnabled = false;
  sosDepartments = new Set<string>();
  /** Stored list for *ngFor. */
  departments: { _id: string; name: string }[] = [];
  contacts: { label: string; phone: string }[] = [];
  note = '';
  tiles: PublicHelpTile[] = [];
  /** Stored list for *ngFor. */
  helpIcons: string[] = [];

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

  /** null = fine, else the first problem with the contacts / tiles. */
  get infoProblem(): string | null {
    for (const c of this.contacts) {
      if (!c.label.trim() || c.label.trim().length > 40) return 'Each contact needs a name (up to 40 characters).';
      if (!PHONE.test(c.phone.trim())) return `"${c.label || 'Contact'}": the phone may have digits, spaces or dashes, and + at the start.`;
    }
    if (this.note.length > 200) return 'Emergency note: up to 200 characters.';
    for (const t of this.tiles) {
      if (!t.title.trim() || t.title.trim().length > 30) return 'Each help tile needs a title (up to 30 characters).';
      if (t.text.length > 300) return `"${t.title}": text up to 300 characters.`;
    }
    return null;
  }

  get canSave(): boolean {
    return !this.saving && this.daysValid && !this.infoProblem && (!this.enabled || !!this.eventId) && this.dirty;
  }

  get dirty(): boolean {
    const s = this.saved;
    return !s || s.enabled !== this.enabled || (s.event?._id ?? null) !== this.eventId
      || s.showBeforeDays !== this.showBeforeDays || s.showAfterDays !== this.showAfterDays
      || JSON.stringify(this.emergencyOut()) !== JSON.stringify(s.emergency)
      || JSON.stringify(this.tilesOut()) !== JSON.stringify(s.helpTiles)
      || this.sosEnabled !== !!s.sosEnabled
      || JSON.stringify([...this.sosDepartments].sort()) !== JSON.stringify([...(s.sosDepartments || [])].sort());
  }

  trackEvent = (_: number, e: { _id: string }) => e._id;
  trackIndex = (i: number) => i;
  trackIcon = (_: number, icon: string) => icon;

  addContact(): void { if (this.contacts.length < MAX_CONTACTS) this.contacts.push({ label: '', phone: '' }); }
  removeContact(i: number): void { this.contacts.splice(i, 1); }
  /** Make this contact the main line (first in the list). */
  makeMain(i: number): void { const [c] = this.contacts.splice(i, 1); this.contacts.unshift(c); }

  toggleSosDept(id: string): void {
    this.sosDepartments.has(id) ? this.sosDepartments.delete(id) : this.sosDepartments.add(id);
  }

  addTile(): void { if (this.tiles.length < MAX_TILES) this.tiles.push({ icon: 'info', title: '', text: '' }); }
  removeTile(i: number): void { this.tiles.splice(i, 1); }

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
      showBeforeDays: this.showBeforeDays, showAfterDays: this.showAfterDays,
      emergency: this.emergencyOut(), helpTiles: this.tilesOut(),
      sosEnabled: this.sosEnabled, sosDepartments: [...this.sosDepartments]
    }).subscribe({
      next: s => {
        this.apply(s);
        this.saving = false;
        this.notify.openSucessSnackBar(s.enabled ? 'Saved · public page is on' : 'Saved · public page is off');
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
    this.contacts = (s.emergency?.contacts || []).map(c => ({ ...c }));
    this.note = s.emergency?.note || '';
    this.tiles = (s.helpTiles || []).map(t => ({ ...t }));
    this.helpIcons = s.helpIcons || [];
    this.sosEnabled = !!s.sosEnabled;
    this.sosDepartments = new Set(s.sosDepartments || []);
    this.departments = s.departments || [];
  }

  private emergencyOut(): PublicEmergency {
    return { contacts: this.contacts.map(c => ({ label: c.label.trim(), phone: c.phone.trim() })), note: this.note.trim() };
  }

  private tilesOut(): PublicHelpTile[] {
    return this.tiles.map(t => ({ icon: t.icon, title: t.title.trim(), text: t.text.trim() }));
  }
}
