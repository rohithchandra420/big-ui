import { HttpClient } from "@angular/common/http";
import { Injectable } from "@angular/core";
import { environment } from "src/environments/environment.development";

@Injectable({ providedIn: 'root' })
export class AdminService {

    url = environment.URL;
    constructor( private http: HttpClient) {}

    getRoles() {
        return this.http.get<{ _id: string; name: string }[]>(this.url + '/admin/roles');
    }

    getDepartments() {
        return this.http.get<{ _id: string; name: string }[]>(this.url + '/admin/departments');
    }

    createUser(userDetails: any) {
        return this.http.post<any>(this.url + "/createUser", userDetails);
    }

    getAllUsers() {
        return this.http.get<any[]>(this.url + '/getAllUsers');
    }

    updateUser(updatedUser: any) {
        return this.http.patch<any>(this.url + '/updateUser', updatedUser);
    }

    updateDepartmentAccess(payload: { userId: string; departmentId: string; access: string[] }) {
        return this.http.patch<any>(this.url + '/updateDepartmentAccess', payload);
    }

    deleteUser(userId: string) {
        return this.http.delete(this.url + '/deleteUser/' + userId);
    }


}