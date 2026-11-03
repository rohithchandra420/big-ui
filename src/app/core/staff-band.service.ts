import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { BoxOfficeQrscannerPopupComponent, QrScannerData } from '../box-office/registration/qrscanner-popup/qrscanner-popup.component';

export interface StaffBandInfo {
  current: { _id: string; code: string } | null;
  bands: { _id: string; code: string; status: 'active' | 'replaced'; reason: string; linkedAt: string; retiredAt: string | null;
    linkedBy: { name: string } | null; retiredBy: { name: string } | null }[];
  canChange: boolean;
}

/**
 * Staff wrist bands (Hospitality H5), per event. Who may link / replace:
 * DEV/DIR/ADMIN, the Hospitality team, a TL for their own department — the
 * server decides (403 otherwise).
 */
@Injectable({ providedIn: 'root' })
export class StaffBandService {
  private url = environment.URL + '/bands/staff';

  constructor(private http: HttpClient, private dialog: MatDialog) {}

  get(userId: string, eventId: string): Promise<StaffBandInfo> {
    return firstValueFrom(this.http.get<StaffBandInfo>(this.url, { params: { user: userId, event: eventId } }));
  }
  link(userId: string, eventId: string, raw: string): Promise<{ band: { _id: string; code: string } }> {
    return firstValueFrom(this.http.post<{ band: { _id: string; code: string } }>(this.url + '/link', { user: userId, event: eventId, raw }));
  }
  replace(userId: string, eventId: string, raw: string, reason: string): Promise<{ band: { _id: string; code: string } }> {
    return firstValueFrom(this.http.post<{ band: { _id: string; code: string } }>(this.url + '/replace', { user: userId, event: eventId, raw, reason }));
  }

  /** Opens the camera and resolves with what was scanned (null if closed). */
  scan(title: string): Promise<string | null> {
    const data: QrScannerData = { mode: 'raw', title };
    return firstValueFrom(this.dialog.open(BoxOfficeQrscannerPopupComponent, { width: '90%', maxWidth: '480px', data }).afterClosed())
      .then(raw => (typeof raw === 'string' && raw ? raw : null));
  }
}
