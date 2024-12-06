import { Injectable } from "@angular/core";
import { HttpClient, HttpHeaders, HttpParams } from "@angular/common/http";

import { environment } from "src/environments/environment.development";

import { Shopcart, Ticket } from "../models/ticket.model";
import { BehaviorSubject, Subject } from "rxjs";
import { Tent } from "../models/tent.model";

@Injectable()
export class TicketsService {
    private selectedTicketSubject = new BehaviorSubject<Ticket>(null);
    selectedTicket$ = this.selectedTicketSubject.asObservable();


    url = environment.URL;

    constructor(private http: HttpClient) {

    }

    setSelectedTicket(ticket: Ticket) {
        this.selectedTicketSubject.next(ticket);
    }

    getAllTickets() {
        return this.http.get<[Ticket]>(this.url + "/getalltickets");
    }

    getTicketById(ticketId) {
        return this.http.get<Ticket>(this.url + "/tickets/" + ticketId);
    }

    sendEmail(ticket: Ticket) {
        return this.http.post<[Ticket]>(this.url + "/sendmail", ticket);
    }

    updateTicketDetails(updatedTicket: Ticket) {
        return this.http.post<Ticket>(this.url + '/updateTicketDetails', updatedTicket);
    }

    updateTicketToAdmit(shopItem: Shopcart) {
        return this.http.post<Shopcart>(this.url + "/admitTicket", shopItem);
    }

    getAvailableTents(tentType) {
        return this.http.get<[Tent]>(this.url + '/getAllVacantTentsByType/' + tentType)
    }

    allocateTentForFestivalTicket(festivalPass) {
        return this.http.post<Shopcart>(this.url + '/allocateTent', festivalPass);
    }

    deactivatePass(shopItemId) {
        const data = { _id: shopItemId};
        return this.http.post<Shopcart>(this.url + '/dectivateShopItem', data);
    }

    activatePass(shopItemId) {
        const data = { _id: shopItemId};
        return this.http.post<Shopcart>(this.url + '/dectivateShopItem', data);
    }

    deleteTicketById(ticketId) {
        return this.http.delete<Shopcart>(this.url + '/deleteTicket/' + ticketId);
    }


}