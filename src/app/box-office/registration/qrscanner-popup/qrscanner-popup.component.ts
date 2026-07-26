import { AfterViewInit, Component, ViewChild } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import { NgxScannerQrcodeComponent, ScannerQRCodeConfig, ScannerQRCodeResult } from 'ngx-scanner-qrcode';

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

  constructor(public dialogRef: MatDialogRef<BoxOfficeQrscannerPopupComponent>) { }

  ngAfterViewInit(): void {
    this.action.isReady.subscribe(() => {
      const playDeviceFacingBack = (devices: any[]) => {
        const device = devices.find((d: any) => /back|rear|environment/gi.test(d.label));
        this.action.playDevice(device ? device.deviceId : devices[0]?.deviceId);
      };
      this.action.start(playDeviceFacingBack).subscribe();
    });
  }

  // On a successful scan, close the dialog immediately with the ticket id —
  // unlike the Tickets version, there's no manual "Copy" step here; the caller
  // navigates straight to the Booking Found page.
  onEvent(results: ScannerQRCodeResult[], action?: any): void {
    try {
      const data = JSON.parse(results[0].value);
      const keys = Object.keys(data);
      const validKeys = keys.includes('_id') && keys.includes('oid') && keys.includes('tid');
      if (validKeys) {
        action?.stop();
        this.dialogRef.close(data._id);
      }
    } catch {
      // Not a recognized booking QR payload — keep scanning.
    }
  }

  close(): void {
    this.dialogRef.close();
  }
}
