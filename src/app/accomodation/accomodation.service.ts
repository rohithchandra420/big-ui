import { Injectable } from "@angular/core";
import { HttpClient, HttpHeaders, HttpParams } from "@angular/common/http";

import { environment } from "src/environments/environment.development";
import { Tent } from "../models/tent.model";

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



}