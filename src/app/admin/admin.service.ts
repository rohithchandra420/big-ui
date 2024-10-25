import { HttpClient } from "@angular/common/http";
import { Workshop } from "../core/workshop.model";
import { Injectable } from "@angular/core";

@Injectable({ providedIn: 'root' })
export class AdminService {
    url = "http://localhost:3000";
    constructor( private http: HttpClient) {}

    addWorkshop(workshopDetails: Workshop) {
        return this.http
            .post<[Workshop]>(this.url + "/addWorkshop", workshopDetails);
    }

    addWorkshopImage(fileData: FormData) {
        return this.http
            .post<[Workshop]>(this.url + "/addWorkshop", fileData);
    }
}