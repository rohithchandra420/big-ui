import { Injectable } from "@angular/core";
import { Gender, Shopcart, Ticket } from "../models/ticket.model";
import { HttpClient, HttpParams } from "@angular/common/http";
import { AuthService } from "../core/auth.service";
import { environment } from "src/environments/environment.development";

export interface BulkUploadResult {
    message: string;
    ticketCount?: number;
}

@Injectable({ providedIn: 'root' })
export class BoxOfficeService {
    url = environment.URL;

    constructor(private http: HttpClient, private authService: AuthService) { }

    // ── Old upload/register form (BoxOfficeComponent) — untouched, deferred (see Task 2/10).
    //    Hits the SHARED /createTicket in ticket.js (not /box-office/*) — do not repoint
    //    this at the Box Office duplicate, the old form's behavior must stay exactly as-is. ──
    createTicket(ticketDetails: Ticket) {
        return this.http.post<Ticket>(this.url + "/createTicket", ticketDetails);
    }

    // ── Spot Registration — hits the Box Office duplicate (/box-office/createTicket),
    //    which allows omitting order_id/transaction_id so the backend auto-assigns them. ──
    createBoxOfficeTicket(ticketDetails: Partial<Ticket>) {
        return this.http.post<Ticket>(this.url + "/box-office/createTicket", ticketDetails);
    }

    getTicketsById(ticketId: string) {
        return this.http.get<Ticket>(this.url + "/getTicketById/" + ticketId, {
            params: new HttpParams().set('id', ticketId),
            responseType: 'json'
        });
    }

    // ── Old upload form (BoxOfficeComponent) — untouched, deferred. Hits the SHARED,
    //    adminAuth-only /uploadexcel in excelUpload.js — do not repoint this either. ──
    uploadExcel(excelFile: FormData) {
        return this.http.post(this.url + "/uploadexcel", excelFile);
    }

    // ── Bulk Upload of Bookings — hits the Box Office duplicate (/box-office/uploadExcel),
    //    same auth level as the rest of Box Office (not admin-only like the legacy route). ──
    uploadBoxOfficeExcel(excelFile: FormData) {
        return this.http.post<BulkUploadResult>(this.url + "/box-office/uploadExcel", excelFile);
    }

    // ── Bookings / Registration — duplicated from TicketsService, hitting the /box-office
    //    router (same Ticket/ShopCart models underneath). Modify these independently as
    //    Box Office requirements diverge from Tickets. ──
    getAllTickets() {
        return this.http.get<[Ticket]>(this.url + "/box-office/getalltickets");
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

    searchTickets(query: string) {
        return this.http.get<Ticket[]>(this.url + "/box-office/search", {
            params: new HttpParams().set('q', query)
        });
    }

    updateShopcartDetails(shopItemId: string, details: { name: string; phone_no: string; email: string; gender?: Gender | null }) {
        return this.http.post<Shopcart>(this.url + "/box-office/updateShopcartDetails", {
            _id: shopItemId,
            ...details
        });
    }

    checkIn(shopItemId: string) {
        return this.http.post<Shopcart>(this.url + "/box-office/checkIn", { _id: shopItemId });
    }
}
