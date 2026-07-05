import { Injectable } from "@angular/core";
import { Ticket } from "../models/ticket.model";
import { HttpClient, HttpParams } from "@angular/common/http";
import { AuthService } from "../core/auth.service";
import { environment } from "src/environments/environment.development";

@Injectable({ providedIn: 'root' })
export class BoxOfficeService {
    url = environment.URL;

    constructor(private http: HttpClient, private authService: AuthService) { }

    createTicket(ticketDetails: Ticket) {
        return this.http.post<Ticket>(this.url + "/createTicket", ticketDetails);
    }

    getTicketsById(ticketId: string) {
        return this.http.get<Ticket>(this.url + "/getTicketById/" + ticketId, {
            params: new HttpParams().set('id', ticketId),
            responseType: 'json'
        });
    }

    uploadExcel(excelFile: FormData) {
        return this.http.post(this.url + "/uploadexcel", excelFile);
    }
}
