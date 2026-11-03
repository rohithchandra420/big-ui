import { AfterViewInit, Component, Inject, OnDestroy, Optional, ViewChild } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { Observable, map } from 'rxjs';
import { NgxScannerQrcodeComponent, ScannerQRCodeConfig, ScannerQRCodeResult } from 'ngx-scanner-qrcode';

import { BandLookup, BoxOfficeService } from '../../box-office.service';
import { lookupErrorMessage } from '../../box-office.utils';
import { GateFeedbackService } from '../../../core/gate-feedback.service';

/** Connection/server failures are retried this many times before giving up. */
export const SCAN_MAX_RETRIES = 3;
export const SCAN_RETRY_DELAY_MS = 1500;

export type BandPurpose = 'admit' | 'link' | 'replace';

/**
 * 'booking' (default, Registration's Scan QR) reads a ticket QR or a wrist
 * band and closes with the booking id. 'band' reads the wrist band for one
 * Festival Pass (Admit / Link band / Replace band) and closes with a
 * BandScanResult — the caller saves it. 'raw' (Workshops lists and door)
 * closes with the scanned text straight away: the caller's server call checks
 * it and plays the sound for what it finds.
 */
export interface QrScannerData {
  mode?: 'booking' | 'band' | 'raw';
  purpose?: BandPurpose;
  /** Raw mode: the dialog title. */
  title?: string;
  /** Band mode: whose band is being scanned, shown under the title. */
  attendeeName?: string;
  /** Band mode: the Festival Pass, so its own band is recognised. */
  passId?: string;
}

export interface BandScanResult {
  raw: string;
  code: string;
  /** Replace only. */
  reason?: string;
}

const TITLES: Record<BandPurpose, string> = {
  admit: 'Admit: Scan Wrist Band',
  link: 'Link Wrist Band',
  replace: 'Replace Wrist Band'
};
const CONFIRM: Record<BandPurpose, string> = {
  admit: 'Admit and link band',
  link: 'Link band',
  replace: 'Replace band'
};

/** Ticket email QRs are JSON; everything else is treated as a band. */
const isTicketQr = (text: string) => text.trim().startsWith('{');

type CheckResult = { kind: 'ticket'; ticketId: string } | { kind: 'band'; band: BandLookup };

@Component({
  selector: 'app-box-office-qrscanner-popup',
  templateUrl: './qrscanner-popup.component.html',
  styleUrls: ['./qrscanner-popup.component.css']
})
export class BoxOfficeQrscannerPopupComponent implements AfterViewInit, OnDestroy {

  // https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia#front_and_back_camera
  config: ScannerQRCodeConfig = {
    // The library beeps and vibrates on EVERY camera frame that contains a
    // QR (up to 30 a second) — off, so only GateFeedbackService's one
    // Found / Not Found / Error sound plays per scan.
    isBeep: false,
    vibrate: 0,
    constraints: {
      video: {
        width: window.innerWidth
      },
    },
  };

  @ViewChild('action') action!: NgxScannerQrcodeComponent;

  /** Shown under the camera when a scanned code is rejected or couldn't be checked. */
  message = '';
  /** True when the message is about the connection/server, not the QR code itself. */
  isError = false;
  /** Offered after the retries ran out, to check the same code again. */
  canScanAgain = false;
  private checking = false;
  /** The scanner reports the same code many times a second — don't re-check a code just rejected. */
  private lastRejected = '';
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  readonly mode: 'booking' | 'band' | 'raw';
  private readonly rawTitle: string;
  readonly purpose: BandPurpose;
  readonly attendeeName: string;
  private readonly passId: string;

  /** Camera stopped (and hidden) while a scanned band waits for staff. */
  paused = false;
  /** The scanned text while paused. */
  private pausedRaw = '';
  /** The last band looked up — shown while paused. */
  band: BandLookup | null = null;
  /** Band mode: the scanned band can be used for this pass. */
  bandOk = false;
  /** Replace only. */
  reason = '';

  constructor(
    public dialogRef: MatDialogRef<BoxOfficeQrscannerPopupComponent>,
    private boxOfficeService: BoxOfficeService,
    private gateFeedback: GateFeedbackService,
    @Optional() @Inject(MAT_DIALOG_DATA) data: QrScannerData | null
  ) {
    this.mode = data?.mode ?? 'booking';
    this.purpose = data?.purpose ?? 'admit';
    this.attendeeName = data?.attendeeName ?? '';
    this.passId = data?.passId ?? '';
    this.rawTitle = data?.title ?? 'Scan Wrist Band';
  }

  get title(): string {
    if (this.mode === 'raw') return this.rawTitle;
    return this.mode === 'band' ? TITLES[this.purpose] : 'Scan Ticket QR or Band';
  }

  get confirmLabel(): string {
    return CONFIRM[this.purpose];
  }

  /** Band mode: whether the band is the pass's own (already linked). */
  get isOwnBand(): boolean {
    return this.band?.state === 'active' && this.band.owner?.passId === this.passId;
  }

  ngAfterViewInit(): void {
    this.action.isReady.subscribe(() => this.startCamera());
  }

  private startCamera(): void {
    const playDeviceFacingBack = (devices: any[]) => {
      const device = devices.find((d: any) => /back|rear|environment/gi.test(d.label));
      this.action.playDevice(device ? device.deviceId : devices[0]?.deviceId);
    };
    this.action.start(playDeviceFacingBack).subscribe();
  }

  ngOnDestroy(): void {
    this.clearRetry();
  }

  // Email epic: ticket QRs are signed, and only big-api holds the key, so
  // every scan is checked there. Bands are looked up there too. A rejected
  // code shows the reason and keeps the camera running for the next attempt.
  onEvent(results: ScannerQRCodeResult[], action?: any): void {
    const text = results?.[0]?.value;
    if (!text || this.checking || this.paused) return;
    if (this.mode === 'raw') {
      // One read is enough: hand it back; the caller checks it and plays the sound.
      this.checking = true;
      action?.stop();
      this.dialogRef.close(text);
      return;
    }
    if (this.mode === 'booking' && text === this.lastRejected) return;
    if (this.mode === 'band') {
      // One band per scan: stop the camera and wait for staff.
      this.pause(text, action);
    }
    this.check(text, action, 0);
  }

  private request(text: string): Observable<CheckResult> {
    if (this.mode === 'booking' && isTicketQr(text)) {
      return this.boxOfficeService.verifyQr(text).pipe(map(res => ({ kind: 'ticket' as const, ticketId: res.ticketId })));
    }
    return this.boxOfficeService.lookupBand(text).pipe(map(band => ({ kind: 'band' as const, band })));
  }

  // A connection/server failure says nothing about the QR itself, so it is
  // retried (up to SCAN_MAX_RETRIES, with a pause each time) before giving
  // up. `checking` stays true while waiting so camera frames don't start a
  // parallel check.
  private check(text: string, action: any, retry: number): void {
    this.checking = true;
    this.request(text).subscribe({
      next: res => {
        this.checking = false;
        this.message = '';
        this.isError = false;
        if (res.kind === 'ticket') {
          this.gateFeedback.found();
          action?.stop();
          this.dialogRef.close(res.ticketId);
        } else if (this.mode === 'band') {
          this.onBandForPass(res.band);
        } else {
          this.onBandAtGate(res.band, text, action);
        }
      },
      error: err => {
        const transient = err?.status === 0 || err?.status >= 500;
        const reason = lookupErrorMessage(err, 'Could not check this QR code. Please try again.');
        this.isError = transient;
        if (transient && retry < SCAN_MAX_RETRIES) {
          this.message = `${reason} Retrying (${retry + 1} of ${SCAN_MAX_RETRIES})…`;
          this.retryTimer = setTimeout(() => {
            this.retryTimer = null;
            this.check(text, action, retry + 1);
          }, SCAN_RETRY_DELAY_MS);
          return;
        }
        this.checking = false;
        this.message = reason;
        if (this.mode === 'booking') {
          this.lastRejected = text;
          this.canScanAgain = transient;
        }
        if (transient) {
          this.gateFeedback.error();
        } else {
          this.gateFeedback.notFound();
        }
      }
    });
  }

  /** Band mode: can this band go on (or already be on) this pass? */
  private onBandForPass(band: BandLookup): void {
    this.band = band;
    this.bandOk = false;
    if (band.state === 'replaced') {
      this.gateFeedback.notFound();
      return;
    }
    if (band.state === 'active' && !this.isOwnBand) {
      const order = band.owner?.orderId != null ? ` (order ${band.owner.orderId})` : '';
      const staff = band.owner?.kind === 'staff' ? ' (staff)' : '';
      this.message = `This band is already linked to ${band.owner?.name || 'someone else'}${staff}${order}.`;
      this.gateFeedback.notFound();
      return;
    }
    if (this.isOwnBand && this.purpose === 'replace') {
      this.message = 'This is the band they already have. Scan the new band.';
      this.gateFeedback.notFound();
      return;
    }
    this.bandOk = true;
    this.gateFeedback.found();
  }

  /** Booking mode: a band scanned at the gate opens its owner's booking. */
  private onBandAtGate(band: BandLookup, text: string, action: any): void {
    if (band.owner?.kind === 'staff') {
      // Hospitality H5: a staff band has no booking.
      this.lastRejected = text;
      this.message = `This is a staff band (${band.owner.name || 'staff member'}${band.state === 'replaced' ? ', replaced' : ''}). Staff don't have bookings.`;
      this.gateFeedback.notFound();
      return;
    }
    if (band.state === 'active' && band.owner?.ticketId) {
      this.gateFeedback.found();
      action?.stop();
      this.dialogRef.close(band.owner.ticketId);
      return;
    }
    if (band.state === 'replaced') {
      // Flag and block: staff decide whether to open the old owner's booking.
      this.pause(text, action);
      this.band = band;
      this.gateFeedback.notFound();
      return;
    }
    this.lastRejected = text;
    this.message = band.state === 'unknown'
      ? 'This band isn\'t linked to anyone yet. Find the booking and Admit to link it.'
      : 'No booking matches this band.';
    this.gateFeedback.notFound();
  }

  private pause(text: string, action: any): void {
    this.paused = true;
    this.pausedRaw = text;
    action?.stop();
  }

  /** Discard the scanned band and turn the camera back on. */
  scanBandAgain(): void {
    this.gateFeedback.unlock();
    this.clearRetry();
    this.checking = false;
    this.paused = false;
    this.pausedRaw = '';
    this.band = null;
    this.bandOk = false;
    this.message = '';
    this.isError = false;
    this.startCamera();
  }

  /** Band mode: hand the band to the caller, who saves it. */
  confirmBand(): void {
    if (!this.bandOk || !this.band) return;
    if (this.purpose === 'replace' && !this.reason.trim()) return;
    const result: BandScanResult = { raw: this.pausedRaw, code: this.band.code };
    if (this.purpose === 'replace') result.reason = this.reason.trim();
    this.dialogRef.close(result);
  }

  /** Booking mode, replaced band: staff checked the person and open the booking anyway. */
  openFlaggedBooking(): void {
    const ticketId = this.band?.owner?.ticketId;
    if (ticketId) this.dialogRef.close(ticketId);
  }

  /** After the retries ran out: allow the same code to be checked again. */
  scanAgain(): void {
    this.gateFeedback.unlock();
    this.lastRejected = '';
    this.message = '';
    this.isError = false;
    this.canScanAgain = false;
  }

  close(): void {
    this.clearRetry();
    this.dialogRef.close();
  }

  private clearRetry(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }
}
