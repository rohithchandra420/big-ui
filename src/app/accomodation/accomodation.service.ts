import { Injectable } from "@angular/core";
import { HttpClient, HttpHeaders, HttpParams } from "@angular/common/http";

import { environment } from "src/environments/environment.development";
import { Tent } from "../models/tent.model";
import { Shopcart } from "../models/ticket.model";

@Injectable()
export class AccomodationService {

    url = environment.URL;

    constructor(private http: HttpClient) {
    }

    createTents(tentData) {
        return this.http.post<[Tent]>(this.url + '/createTents', tentData);
    }

    getAllTents() {
        return this.http.get<[Tent]>(this.url + '/getAllTents');
    }

    getAllFestivalTickets() {
        return this.http.get<[[Shopcart]]>(this.url + '/getAllFestivalTickets');
    }

    removeOccupant(tentDetails) {
        return this.http.post<Tent>(this.url + '/removeOccupant', tentDetails);
    }


}