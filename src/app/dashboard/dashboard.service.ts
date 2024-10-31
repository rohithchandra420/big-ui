import { Injectable } from "@angular/core";
import { HttpClient, HttpHeaders, HttpParams } from "@angular/common/http";
import { environment } from "src/environments/environment.development";

import { Shopcart } from "../models/ticket.model";

@Injectable()
export class DashboardService{
    url = environment.URL;

    constructor(private http: HttpClient){
    }

    getallShopItems() {
        return this.http.get<[Shopcart]>(this.url + '/getAllShopItems');
    }


}