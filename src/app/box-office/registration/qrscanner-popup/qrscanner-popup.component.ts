import { AfterViewInit, Component, ViewChild } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import { NgxScannerQrcodeComponent, ScannerQRCodeConfig, ScannerQRCodeResult } from 'ngx-scanner-qrcode';

import { BoxOfficeService } from '../../box-office.service';

@Component({
  selector: 'app-box-office-qrscanner-popup',
  templateUrl: './qrscanner-popup.component.html',
  styleUrls: ['./qrscanner-popup.component.css']
})
export class BoxOfficeQrscannerPopupComponent implements AfterViewInit {

  // https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia#front_and_back_camera
  config: ScannerQRCodeConfig = {
    constraints: {
      video: {
        width: window.innerWidth
      },
    },
  };

  @ViewChild('action') action!: NgxScannerQrcodeComponent;

  /** Shown under the camera when a scanned code is rejected. */
  message = '';
  private checking = false;
  /** The scanner reports the same code many times a second — don't re-check a code just rejected. */
  private lastRejected = '';

  constructor(
    public dialogRef: MatDialogRef<BoxOfficeQrscannerPopupComponent>,
    private boxOfficeService: BoxOfficeService
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

  // Email epic: ticket QRs are signed, and only big-api holds the key, so
  // every scan is checked there. A valid code closes the dialog with the
  // booking id (the caller opens Booking Found); a rejected one shows the
  // reason and keeps the camera running for the next attempt.
  onEvent(results: ScannerQRCodeResult[], action?: any): void {
    const text = results?.[0]?.value;
    if (!text || this.checking || text === this.lastRejected) return;
    this.checking = true;
    this.boxOfficeService.verifyQr(text).subscribe({
      next: res => {
        this.checking = false;
        action?.stop();
        this.dialogRef.close(res.ticketId);
      },
      error: err => {
        this.checking = false;
        this.lastRejected = text;
        this.message = err?.error?.message || 'Could not check this QR code. Please try again.';
      }
    });
  }

  close(): void {
    this.dialogRef.close();
  }
}
