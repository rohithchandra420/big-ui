import { Injectable } from "@angular/core";
import { Gender, PassCategory, Shopcart, Ticket } from "../models/ticket.model";
import { HttpClient, HttpParams } from "@angular/common/http";
import { AuthService } from "../core/auth.service";
import { environment } from "src/environments/environment.development";

export interface BulkUploadResult {
    message: string;
    ticketCount?: number;
}

/** External Booking Import (I2): a pass type in the file that the event doesn't have yet. */
export interface ExternalImportUnknownPassType {
    externalCode: string | null;
    name: string;
    category: PassCategory;
    /** Beds per pass (tent only), from item_guests ÷ quantity. */
    beds: number | null;
    rows: number[];
}

/** A booking in the file that can't be imported, with its row numbers. */
export interface ExternalImportError {
    reference: string | null;
    rows: number[];
    messages: string[];
}

/** What a preview found, or what an import did (`created` set). */
export interface ExternalImportResult {
    message?: string;
    rows: number;
    bookings: number;
    toCreate: number;
    passes: number;
    skipped: string[];
    changedSince: string[];
    unknownPassTypes: ExternalImportUnknownPassType[];
    errors: ExternalImportError[];
    canCreatePassTypes?: boolean;
    created?: number;
}

/** One sales system booking that could not be applied (reference + reasons). */
export interface SalesSyncProblem {
    reference: string | null;
    messages: string[];
}

/** A pass type the sales system's bookings use that the event doesn't have yet. */
export interface SalesSyncUnknownPassType {
    externalCode: string | null;
    name: string;
    category: PassCategory;
    beds: number | null;
    /** How many bookings in this pull need it. */
    bookings: number;
}

/** What one pull did (POST /box-office/sales-sync/pull). */
export interface SalesSyncReport {
    fetched: number;
    created: number;
    updated: number;
    cancelled: number;
    skipped: number;
    /** Bookings not stored: bad data (listed in `errors`) + missing pass types. */
    errorCount: number;
    errors: SalesSyncProblem[];
    unknownCodes: string[];
    unknownPassTypes: SalesSyncUnknownPassType[];
    flagged: string[];
    pending?: number;
    /** Top roles may create the missing pass types here. */
    canCreatePassTypes?: boolean;
}

/** Check & repair › Check all bookings: the pull report + the count comparison. */
export interface SalesSyncCheck extends SalesSyncReport {
    salesPaid: number;
    inBig: number;
    /** Booking IDs that were missing in BiG and are now stored. */
    missing: string[];
    /** Booking IDs in BiG (from the sales system) that it doesn't list as paid. */
    extraInBig: string[];
    extraCount: number;
}

/** Check & repair › Fetch one booking. */
export interface SalesSyncFetch extends SalesSyncReport {
    result: 'created' | 'updated' | 'cancelled' | 'skipped' | 'error' | 'unknown';
    reference: string;
    messages: string[];
    flags: string[];
}

/** One webhook call or pull in the sync log. */
export interface SalesSyncLogEntry {
    via: 'webhook' | 'pull';
    kind: string | null;
    at: string;
    counts: { fetched: number; created: number; updated: number; cancelled: number; skipped: number; errors: number };
    problems: SalesSyncProblem[];
    unknownCodes: string[];
    flagged: string[];
    note: string | null;
}

/** GET /box-office/sales-sync — the sync for one event. */
export interface SalesSyncStatus {
    on: boolean;
    syncEvent: { _id: string; name: string } | null;
    pullReady: boolean;
    webhookReady: boolean;
    masked: boolean; // UAT-MASK: remove before Production
    lastPullAt: string | null;
    lastWebhookAt: string | null;
    pending: number;
    logs: SalesSyncLogEntry[];
}

/** Who a band (or a band conflict) belongs to. */
export interface BandOwner {
    /** 'staff' = a staff member's band (Hospitality H5): no pass, no booking. */
    kind?: 'pass' | 'staff';
    passId?: string;
    ticketId?: string | null;
    orderId?: number | null;
    name: string;
    passTypeName?: string;
    isAdmitted?: boolean;
    userId?: string;
    department?: string | null;
}

/** GET /bands/lookup — what a scanned band is. 'replaced' must be flagged and block. */
export interface BandLookup {
    state: 'active' | 'replaced' | 'unknown';
    code: string;
    owner?: BandOwner;
    currentCode?: string | null;
    reason?: string;
}

export interface BandChange {
    pass: Shopcart;
    band: { _id: string; code: string };
}

export interface BandHistoryEntry {
    _id: string;
    code: string;
    status: 'active' | 'replaced';
    reason?: string;
    linkedAt: string;
    retiredAt?: string | null;
    linkedBy?: { name: string } | null;
    retiredBy?: { name: string } | null;
}

/** The Box Office's status: `pin` null = no Box Office pin on the Venue Map yet. */
export interface BoxOfficeStatus {
    pin: { _id: string; name: string } | null;
    open: boolean;
    note: string;
    at: string | null;
    by: string | null;
    canChange: boolean;
}

@Injectable({ providedIn: 'root' })
export class BoxOfficeService {
    url = environment.URL;

    constructor(private http: HttpClient, private authService: AuthService) { }

    // ── Box Office open / closed on the Venue Map (2026-11-04): lives on the event's
    //    one Box Office pin. Changing it: the Box Office TL and DEV/DIR/ADMIN. ──
    getStatus(eventId: string) {
        return this.http.get<BoxOfficeStatus>(this.url + "/box-office/status", { params: new HttpParams().set('event', eventId) });
    }
    setStatus(eventId: string, open: boolean, note: string) {
        return this.http.put<BoxOfficeStatus>(this.url + "/box-office/status", { event: eventId, open, note });
    }

    // ── Spot Registration — hits the Box Office duplicate (/box-office/createTicket),
    //    which allows omitting order_id/transaction_id so the backend auto-assigns them. ──
    createBoxOfficeTicket(ticketDetails: Partial<Ticket>) {
        return this.http.post<Ticket>(this.url + "/box-office/createTicket", ticketDetails);
    }

    // ── Bulk Upload of Bookings — hits the Box Office duplicate (/box-office/uploadExcel),
    //    same auth level as the rest of Box Office (not admin-only like the legacy route). ──
    uploadBoxOfficeExcel(excelFile: FormData) {
        return this.http.post<BulkUploadResult>(this.url + "/box-office/uploadExcel", excelFile);
    }

    // ── External Booking Import (I2): same people as Bulk Upload. `form` holds
    //    `file` (.csv / .xlsx) and `eventId`. Preview saves nothing. ──
    previewExternalImport(form: FormData) {
        return this.http.post<ExternalImportResult>(this.url + "/box-office/external-import/preview", form);
    }
    runExternalImport(form: FormData) {
        return this.http.post<ExternalImportResult>(this.url + "/box-office/external-import", form);
    }

    // ── Sales system sync (I3 / I4): same people as Bulk Upload. ──
    getSalesSync(eventId: string) {
        return this.http.get<SalesSyncStatus>(this.url + "/box-office/sales-sync", { params: new HttpParams().set('eventId', eventId) });
    }
    pullSalesSync(eventId: string) {
        return this.http.post<SalesSyncReport>(this.url + "/box-office/sales-sync/pull", { eventId });
    }
    checkSalesSync(eventId: string) {
        return this.http.post<SalesSyncCheck>(this.url + "/box-office/sales-sync/check", { eventId });
    }
    fetchSalesBooking(eventId: string, reference: string) {
        return this.http.post<SalesSyncFetch>(this.url + "/box-office/sales-sync/fetch", { eventId, reference });
    }

    // ── Bookings / Registration — duplicated from TicketsService, hitting the /box-office
    //    router (same Ticket/ShopCart models underneath). Modify these independently as
    //    Box Office requirements diverge from Tickets. ──
    getAllTickets(eventId: string) {
        return this.http.get<[Ticket]>(this.url + "/box-office/getalltickets", {
            params: new HttpParams().set('eventId', eventId)
        });
    }

    getTicketById(ticketId: string) {
        return this.http.get<Ticket>(this.url + "/box-office/tickets/" + ticketId);
    }

    updateTicketDetails(updatedTicket: Ticket) {
        return this.http.post<Ticket>(this.url + "/box-office/updateTicketDetails", updatedTicket);
    }

    updateTicketToAdmit(shopItem: Shopcart) {
        return this.http.post<Shopcart>(this.url + "/box-office/admitTicket", shopItem);
    }

    toggleShopItemActive(shopItemId: string) {
        const data = { _id: shopItemId };
        return this.http.post<Shopcart>(this.url + "/box-office/toggleShopItemActive", data);
    }

    deleteTicketById(ticketId: string) {
        return this.http.delete<Shopcart>(this.url + "/box-office/deleteTicket/" + ticketId);
    }

    searchTickets(query: string, eventId: string) {
        return this.http.get<Ticket[]>(this.url + "/box-office/search", {
            params: new HttpParams().set('q', query).set('eventId', eventId)
        });
    }

    updateShopcartDetails(shopItemId: string, details: { name: string; phone_no: string; email: string; gender?: Gender | null }) {
        return this.http.post<Shopcart>(this.url + "/box-office/updateShopcartDetails", {
            _id: shopItemId,
            ...details
        });
    }

    /** Email epic — ticket QRs are signed server-side; the gate sends what it
     *  scanned and gets back the booking to open (or a 400/404 with a reason). */
    verifyQr(payload: string) {
        return this.http.post<{ ticketId: string; orderId: number; event?: string; signed: boolean }>(
            this.url + "/box-office/verifyQr", { payload });
    }

    /** Admit — the wrist band (raw scanned text) is linked in the same call. */
    checkIn(shopItemId: string, band: string) {
        return this.http.post<Shopcart>(this.url + "/box-office/checkIn", { _id: shopItemId, band });
    }

    // ── Wrist bands (Workshops epic, W1) ──
    lookupBand(raw: string) {
        return this.http.get<BandLookup>(this.url + "/bands/lookup", { params: new HttpParams().set('raw', raw) });
    }

    /** For a pass admitted before bands existed. */
    linkBand(passId: string, raw: string) {
        return this.http.post<BandChange>(this.url + "/bands/link", { passId, raw });
    }

    replaceBand(passId: string, raw: string, reason: string) {
        return this.http.post<BandChange>(this.url + "/bands/replace", { passId, raw, reason });
    }

    bandHistory(passId: string) {
        return this.http.get<{ bands: BandHistoryEntry[]; canReplace: boolean }>(
            this.url + "/bands/history", { params: new HttpParams().set('pass', passId) });
    }
}
