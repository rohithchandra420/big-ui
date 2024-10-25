import { Injectable } from "@angular/core";
import { HttpClient, HttpHeaders, HttpParams } from "@angular/common/http";

import { environment } from "src/environments/environment.development";

import { Shopcart, Ticket } from "../models/ticket.model";

@Injectable()
export class TicketsService {
    
    url = environment.URL;

    constructor(private http: HttpClient) {

    }

    getAllTickets() {
        return this.http.get<[Ticket]>(this.url + "/getalltickets");
    }

    sendEmail(ticket: Ticket) {
        console.log("Ticket: ", ticket);
        return this.http.post<[Ticket]>(this.url + "/sendmail", ticket);
    }

    updateTicketToAdmit(shopItem: Shopcart) {
        return this.http.post<Shopcart>(this.url + "/admitTicket", shopItem);
    }


}