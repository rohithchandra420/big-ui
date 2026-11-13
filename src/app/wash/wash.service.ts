import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { BoxOfficeQrscannerPopupComponent, QrScannerData } from '../box-office/registration/qrscanner-popup/qrscanner-popup.component';
import {
  NewFacility, StockItem, StockItemInput, StockList, StockLogEntry, StockMoveKind, StockMoveResult,
  WashAction, WashFacility, WashList, WashLogEntry, WashPin, WashReport, WashSticker
} from './wash.model';
import { parseWashQr } from './wash.utils';

/** WASH: facilities, their log, the Setup place picker, options and QR stickers. */
@Injectable({ providedIn: 'root' })
export class WashService {
  private url = environment.URL + '/wash';

  constructor(private http: HttpClient, private dialog: MatDialog) {}

  facilities(eventId: string): Promise<WashList> {
    return firstValueFrom(this.http.get<WashList>(this.url + '/facilities', { params: { event: eventId } }));
  }

  pins(eventId: string): Promise<WashPin[]> {
    return firstValueFrom(this.http.get<WashPin[]>(this.url + '/pins', { params: { event: eventId } }));
  }

  history(id: string): Promise<WashLogEntry[]> {
    return firstValueFrom(this.http.get<WashLogEntry[]>(`${this.url}/facilities/${id}/history`));
  }

  add(data: NewFacility): Promise<WashFacility> {
    return firstValueFrom(this.http.post<WashFacility>(this.url + '/facilities', data));
  }

  update(id: string, data: { intervalHours?: number; capacityLitres?: number | null }): Promise<WashFacility> {
    return firstValueFrom(this.http.patch<WashFacility>(`${this.url}/facilities/${id}`, data));
  }

  remove(id: string): Promise<{ ok: boolean; logs: number }> {
    return firstValueFrom(this.http.delete<{ ok: boolean; logs: number }>(`${this.url}/facilities/${id}`));
  }

  /** `qr`: the code from the facility's sticker when the log follows a scan (the server checks it). */
  log(id: string, action: WashAction, note = '', qr: string | null = null): Promise<WashFacility> {
    return firstValueFrom(this.http.post<WashFacility>(`${this.url}/facilities/${id}/log`, { action, note, ...(qr ? { qr } : {}) }));
  }

  setRequireQr(eventId: string, requireQr: boolean): Promise<{ requireQr: boolean }> {
    return firstValueFrom(this.http.put<{ requireQr: boolean }>(this.url + '/settings', { event: eventId, requireQr }));
  }

  /** One sticker per facility; the QR links to this app (its own address is sent as `base`). */
  stickers(eventId: string): Promise<WashSticker[]> {
    return firstValueFrom(this.http.get<WashSticker[]>(this.url + '/stickers', { params: { event: eventId, base: window.location.origin } }));
  }

  /** WA5: the report of one festival day ("YYYY-MM-DD", India time); no date = today. */
  report(eventId: string, date = ''): Promise<WashReport> {
    return firstValueFrom(this.http.get<WashReport>(this.url + '/report', { params: { event: eventId, ...(date ? { date } : {}) } }));
  }

  // ── Stock (WA3) ──

  stock(eventId: string): Promise<StockList> {
    return firstValueFrom(this.http.get<StockList>(this.url + '/stock', { params: { event: eventId } }));
  }

  addItem(eventId: string, data: StockItemInput): Promise<StockItem> {
    return firstValueFrom(this.http.post<StockItem>(this.url + '/stock', { event: eventId, ...data }));
  }

  updateItem(id: string, data: Partial<StockItemInput>): Promise<StockItem> {
    return firstValueFrom(this.http.patch<StockItem>(`${this.url}/stock/${id}`, data));
  }

  deleteItem(id: string): Promise<{ ok: boolean; logs: number }> {
    return firstValueFrom(this.http.delete<{ ok: boolean; logs: number }>(`${this.url}/stock/${id}`));
  }

  moveStock(id: string, kind: StockMoveKind, quantity: number, note = ''): Promise<StockMoveResult> {
    return firstValueFrom(this.http.post<StockMoveResult>(`${this.url}/stock/${id}/move`, { kind, quantity, note }));
  }

  stockHistory(id: string): Promise<StockLogEntry[]> {
    return firstValueFrom(this.http.get<StockLogEntry[]>(`${this.url}/stock/${id}/history`));
  }

  /**
   * Opens the camera for a facility's QR sticker. Resolves with its facility id
   * and code; 'other' for some other QR; null when closed without a scan.
   */
  scan(title = 'Scan the facility\'s QR sticker'): Promise<{ id: string; token: string } | 'other' | null> {
    const data: QrScannerData = { mode: 'raw', title };
    return firstValueFrom(this.dialog.open(BoxOfficeQrscannerPopupComponent, { width: '90%', maxWidth: '480px', data }).afterClosed())
      .then(raw => (typeof raw === 'string' && raw ? (parseWashQr(raw) || 'other') : null));
  }
}
