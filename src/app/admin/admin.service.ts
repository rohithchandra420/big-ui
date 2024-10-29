import { HttpClient } from "@angular/common/http";
import { Workshop } from "../core/workshop.model";
import { Injectable } from "@angular/core";
import { environment } from "src/environments/environment.development";
import { User } from "../core/user.model";

@Injectable({ providedIn: 'root' })
export class AdminService {

    url = environment.URL;
    constructor( private http: HttpClient) {}

    addWorkshop(workshopDetails: Workshop) {
        return this.http
            .post<[Workshop]>(this.url + "/addWorkshop", workshopDetails);
    }

    createUser(userDetails) {
        return this.http.post<User>(this.url + "/createUser", userDetails);
    }


}