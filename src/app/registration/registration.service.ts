import { Injectable } from "@angular/core";
import { Ticket } from "../models/ticket.model";
import { HttpClient, HttpHeaders, HttpParams } from "@angular/common/http";
import { User } from "../core/user.model";
import { AuthService } from "../core/auth.service";
import { exhaustMap, take } from "rxjs";
import { environment } from "src/environments/environment.development";

@Injectable({ providedIn: 'root' })

export class RegistrationService {
    url = environment.URL;

    constructor(private http: HttpClient, private authService: AuthService) { }

    registerTicket(ticketDetails: Ticket) {
        return this.http
            .post<[User]>(this.url + "/registerTicket", ticketDetails)
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