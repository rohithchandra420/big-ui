import { HttpClient } from "@angular/common/http";
import { Workshop } from "../core/workshop.model";
import { Injectable } from "@angular/core";
import { environment } from "src/environments/environment.development";
import { User } from "../core/user.model";

@Injectable({ providedIn: 'root' })
export class AdminService {

    url = environment.URL;
    constructor( private http: HttpClient) {}

    createUser(userDetails) {
        return this.http.post<User>(this.url + "/createUser", userDetails);
    }

    getAllUsers() {
        return this.http.get<[User]>(this.url + '/getAllUsers');
    }

    updateUser(updatedUser) {
        return this.http.patch(this.url + '/updateUser', updatedUser);
    }

    deleteUser(userId) {
        return this.http.delete(this.url + '/deleteUser/' + userId);
    }


}