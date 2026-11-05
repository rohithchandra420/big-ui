import { Component, EventEmitter, HostListener, Input, Output } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { PublicApiService, PublicMapArea, PublicMapPin } from '../core/public-api.service';
import { timeLabel } from '../core/festival-time';
import { I18nService, TPipe } from '../core/i18n';
import { mapsLinkFor, nearest, placesFor } from '../core/map-data';
import { MyLocationService } from '../core/my-location.service';

type Contact = { label: string; phone: string };

/** tel: / sms: / wa.me want digits (and a leading + for tel / sms). */
export const telOf = (phone: string) => 'tel:' + phone.replace(/[\s-]/g, '');
export const smsOf = (phone: string, text: string) => `sms:${phone.replace(/[\s-]/g, '')}?&body=${encodeURIComponent(text)}`;
export const whatsappOf = (phone: string, text: string) => `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;

/**
 * Emergency button + sheet (PH4a), shown during the festival. Contacts come
 * from Admin › Public Page (first = main line); 112 is always there. "Share my
 * location" only opens the person's own SMS / WhatsApp with a Maps link — the
 * location is never sent to our server (SOS to staff is PH4b).
 */
@Component({
  selector: 'pub-emergency',
  standalone: true,
  imports: [NgIf, NgFor, TPipe],
  template: `
    <button type="button" class="sos" (click)="open = true; step = 'menu'"><span class="ms fill">sos</span>{{ 'sos.button' | t }}</button>
    <ng-container *ngIf="open">
      <div class="scrim" (click)="open = false"></div>
      <div class="sheet sos-sheet" role="dialog" aria-modal="true" [attr.aria-label]="'sos.title' | t">
        <div class="grab"></div>
        <button type="button" class="sheet-x" (click)="open = false" [attr.aria-label]="'sheet.closeAll' | t"><span class="ms">close</span></button>
        <h3><span class="ms fill">sos</span>{{ 'sos.title' | t }}</h3>
        <p class="sub">{{ note || ('sos.note' | t) }}</p>

        <!-- PH4b: SOS to the team (only when staff switched it on) -->
        <ng-container *ngIf="sos && step === 'confirm'">
          <div class="sos-confirm">
            <b>{{ 'sos.confirmTitle' | t }}</b>
            <p>{{ 'sos.confirmText' | t }}</p>
            <div class="sos-loc" *ngIf="finding">{{ 'sos.finding' | t }}</div>
            <div class="sos-loc" *ngIf="here">{{ 'sos.locFound' | t: { m: here.accuracy } }}</div>
            <div class="sos-loc warn" *ngIf="locProblem">{{ (locProblem === 'denied' ? 'map.meDenied' : 'map.meUnavailable') | t }}</div>
            <textarea rows="2" maxlength="200" [placeholder]="'sos.msgPh' | t" [value]="sosMessage" (input)="sosMessage = $any($event.target).value"></textarea>
            <input type="tel" maxlength="20" [placeholder]="'sos.phonePh' | t" [value]="sosPhone" (input)="sosPhone = $any($event.target).value">
            <div class="sos-err" *ngIf="sendError">{{ sendError }}</div>
            <div class="row">
              <button type="button" (click)="step = 'menu'">{{ 'sos.cancel' | t }}</button>
              <button type="button" class="send" [disabled]="!here || sending" (click)="sendSos()">{{ (sending ? 'sos.sending' : 'sos.send') | t }}</button>
            </div>
          </div>
        </ng-container>
        <div class="sos-sent" *ngIf="step === 'sent'">
          <span class="ms fill">check_circle</span>
          <b>{{ 'sos.sentTitle' | t }}</b>
          <p>{{ 'sos.sentText' | t: { time: sentAt } }}</p>
          <small *ngIf="main">{{ 'sos.alsoSend' | t }}</small>
        </div>
        <button type="button" class="sos-btn primary" *ngIf="sos && step === 'menu'" (click)="startSos()">
          <span class="ms fill">emergency_share</span><div><b>{{ 'sos.team' | t }}</b><small>{{ 'sos.teamText' | t }}</small></div>
        </button>

        <a class="sos-btn" [class.primary]="!sos" *ngIf="main" [href]="tel(main.phone)">
          <span class="ms fill">call</span><div><b>{{ 'sos.callMain' | t: { label: main.label } }}</b><small>{{ main.phone }}</small></div>
        </a>
        <p class="sub" *ngIf="!main">{{ 'sos.noContacts' | t }}</p>

        <div class="sos-btn share" *ngIf="main">
          <span class="ms">my_location</span>
          <div>
            <b>{{ 'sos.share' | t }}</b><small>{{ 'sos.shareText' | t: { label: main.label } }}</small>
            <small *ngIf="finding">{{ 'sos.finding' | t }}</small>
            <small *ngIf="locProblem">{{ (locProblem === 'denied' ? 'map.meDenied' : 'map.meUnavailable') | t }}</small>
            <div class="share-row">
              <button type="button" (click)="share('sms')">{{ 'sos.sms' | t }}</button>
              <button type="button" (click)="share('whatsapp')">{{ 'sos.whatsapp' | t }}</button>
            </div>
          </div>
        </div>

        <a class="sos-btn" *ngFor="let c of others; let i = index; trackBy: trackIndex" [href]="tel(c.phone)">
          <span class="ms">call</span><div><b>{{ 'sos.call' | t: { label: c.label } }}</b><small>{{ c.phone }}</small></div>
        </a>

        <button type="button" class="sos-btn" *ngIf="firstAidId" (click)="goFirstAid()">
          <span class="ms red">local_hospital</span><div><b>{{ 'sos.firstAid' | t }}</b><small>{{ firstAidName }}</small></div>
        </button>

        <a class="sos-btn" href="tel:112">
          <span class="ms">local_police</span><div><b>{{ 'sos.112' | t }}</b><small>{{ 'sos.112Text' | t }}</small></div>
        </a>
      </div>
    </ng-container>`,
})
export class EmergencyComponent {
  @Input() contacts: Contact[] = [];
  @Input() note = '';
  @Input() pins: PublicMapPin[] = [];
  @Input() areas: PublicMapArea[] = [];
  /** PH4b: staff switched SOS to the team on. */
  @Input() sos = false;
  /** Open the map on a place (nearest first aid). */
  @Output() openMap = new EventEmitter<string>();

  open = false;
  finding = false;
  locProblem: 'denied' | 'unavailable' | null = null;

  // PH4b
  step: 'menu' | 'confirm' | 'sent' = 'menu';
  here: { at: [number, number]; accuracy: number } | null = null;
  sosMessage = '';
  sosPhone = '';
  sending = false;
  sendError = '';
  sentAt = '';

  constructor(private me: MyLocationService, private i18n: I18nService, private api: PublicApiService) {}

  /** "Send SOS?" step: find the location first. */
  async startSos(): Promise<void> {
    this.step = 'confirm';
    this.sendError = '';
    this.locProblem = null;
    this.finding = true;
    const loc = await this.me.request();
    this.finding = false;
    this.here = loc;
    if (!loc) this.locProblem = this.me.problem || 'unavailable';
  }

  sendSos(): void {
    if (!this.here || this.sending) return;
    this.sending = true;
    this.sendError = '';
    this.api.sendSos({
      lat: this.here.at[0], lng: this.here.at[1], accuracy: this.here.accuracy ?? null,
      message: this.sosMessage.trim(), phone: this.sosPhone.trim()
    }).subscribe({
      next: () => {
        this.sending = false;
        this.step = 'sent';
        this.sentAt = timeLabel(Date.now(), this.i18n.lang);
      },
      error: err => {
        this.sending = false;
        this.sendError = err?.error?.message || this.i18n.t('sos.failed');
      }
    });
  }

  get main(): Contact | null { return this.contacts[0] || null; }
  get others(): Contact[] { return this.contacts.slice(1); }
  private get firstAid() { return nearest(placesFor('firstAid', this.pins, this.areas), this.me.current?.at || null); }
  get firstAidId(): string | null { return this.firstAid?.place.id || null; }
  get firstAidName(): string { return this.firstAid?.place.name || ''; }

  trackIndex = (i: number) => i;
  tel = telOf;

  @HostListener('document:keydown.escape') onEsc(): void { this.open = false; }

  goFirstAid(): void {
    if (!this.firstAidId) return;
    this.open = false;
    this.openMap.emit(this.firstAidId);
  }

  /** Gets the location, then opens the person's own SMS / WhatsApp with a Maps link. */
  async share(how: 'sms' | 'whatsapp'): Promise<void> {
    if (!this.main) return;
    this.finding = true;
    this.locProblem = null;
    const loc = this.me.current || await this.me.request();
    this.finding = false;
    if (!loc) { this.locProblem = this.me.problem || 'unavailable'; return; }
    const text = this.i18n.t('sos.message', { link: mapsLinkFor(loc.at) });
    const url = how === 'sms' ? smsOf(this.main.phone, text) : whatsappOf(this.main.phone, text);
    window.location.href = url;
  }
}
