import { AfterViewInit, Component, OnDestroy, ViewChild } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import { NgxScannerQrcodeComponent, ScannerQRCodeConfig, ScannerQRCodeResult } from 'ngx-scanner-qrcode';

import { BoxOfficeService } from '../../box-office.service';
import { lookupErrorMessage } from '../../box-office.utils';
import { GateFeedbackService } from '../../../core/gate-feedback.service';

/** Connection/server failures are retried this many times before giving up. */
export const SCAN_MAX_RETRIES = 3;
export const SCAN_RETRY_DELAY_MS = 1500;

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

  constructor(
    public dialogRef: MatDialogRef<BoxOfficeQrscannerPopupComponent>,
    private boxOfficeService: BoxOfficeService,
    private gateFeedback: GateFeedbackService
  ) { }

  ngAfterViewInit(): void {
    this.action.isReady.subscribe(() => {
      const playDeviceFacingBack = (devices: any[]) => {
        const device = devices.find((d: any) => /back|rear|environment/gi.test(d.label));
        this.action.playDevice(device ? device.deviceId : devices[0]?.deviceId);
      };
      this.action.start(playDeviceFacingBack).subscribe();
    });
  }

  ngOnDestroy(): void {
    this.clearRetry();
  }

  // Email epic: ticket QRs are signed, and only big-api holds the key, so
  // every scan is checked there. A valid code closes the dialog with the
  // booking id (the caller opens Booking Found); a rejected one shows the
  // reason and keeps the camera running for the next attempt.
  onEvent(results: ScannerQRCodeResult[], action?: any): void {
    const text = results?.[0]?.value;
    if (!text || this.checking || text === this.lastRejected) return;
    this.verify(text, action, 0);
  }

  // A connection/server failure says nothing about the QR itself, so it is
  // retried (up to SCAN_MAX_RETRIES, with a pause each time) before giving
  // up. `checking` stays true while waiting so camera frames don't start a
  // parallel check.
  private verify(text: string, action: any, retry: number): void {
    this.checking = true;
    this.boxOfficeService.verifyQr(text).subscribe({
      next: res => {
        this.checking = false;
        this.message = '';
        this.gateFeedback.found();
        action?.stop();
        this.dialogRef.close(res.ticketId);
      },
      error: err => {
        const transient = err?.status === 0 || err?.status >= 500;
        const reason = lookupErrorMessage(err, 'Could not check this QR code. Please try again.');
        this.isError = transient;
        if (transient && retry < SCAN_MAX_RETRIES) {
          this.message = `${reason} Retrying (${retry + 1} of ${SCAN_MAX_RETRIES})…`;
          this.retryTimer = setTimeout(() => {
            this.retryTimer = null;
            this.verify(text, action, retry + 1);
          }, SCAN_RETRY_DELAY_MS);
          return;
        }
        this.checking = false;
        this.lastRejected = text;
        this.message = reason;
        this.canScanAgain = transient;
        if (transient) {
          this.gateFeedback.error();
        } else {
          this.gateFeedback.notFound();
        }
      }
    });
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
