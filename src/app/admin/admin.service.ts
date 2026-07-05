import { HttpClient } from "@angular/common/http";
import { Injectable } from "@angular/core";
import { environment } from "src/environments/environment.development";

export interface DeptSummary {
  _id: string;
  name: string;
  description: string;
  tls: { _id: string; name: string }[];
  volunteerCount: number;
}

export interface DeptDetail {
  _id: string;
  name: string;
  description: string;
  tls: { _id: string; name: string }[];
  volunteers: { _id: string; name: string; departments: any[] }[];
}

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

    getDepartmentsSummary() {
        return this.http.get<DeptSummary[]>(this.url + '/admin/departments/summary');
    }

    getDepartmentDetail(id: string) {
        return this.http.get<DeptDetail>(this.url + '/admin/departments/' + id);
    }

    createDepartment(data: { name: string; description: string }) {
        return this.http.post<any>(this.url + '/admin/departments', data);
    }

    updateDepartment(id: string, data: { name?: string; description?: string; addUserIds?: string[]; removeUserIds?: string[] }) {
        return this.http.patch<any>(this.url + '/admin/departments/' + id, data);
    }

    deleteDepartment(id: string, force = false) {
        return this.http.delete<any>(this.url + '/admin/departments/' + id, { body: { force } });
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
