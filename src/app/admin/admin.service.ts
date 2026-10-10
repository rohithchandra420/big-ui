import { HttpClient } from "@angular/common/http";
import { Injectable } from "@angular/core";
import { environment } from "src/environments/environment.development";

export interface DeptSummary {
  _id: string;
  name: string;
  description: string;
  tls: { _id: string; name: string; avatarVersion?: number }[];
  volunteerCount: number;
}

export interface DeptDetail {
  _id: string;
  name: string;
  description: string;
  tls: { _id: string; name: string; avatarVersion?: number }[];
  volunteers: { _id: string; name: string; avatarVersion?: number; departments: any[] }[];
}

export interface UserDeleteCheck {
  action: 'delete' | 'deactivate';
  hasHistory: boolean;
  attendanceCount: number;
  attendanceMarkedCount: number;
  eventsCreatedCount: number;
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

    /** includeInactive is only honoured server-side for DEV/DIR — it's how the
     *  Users page shows deactivated users to them. Every other caller wants
     *  live users only, so it defaults to false. */
    getAllUsers(includeInactive = false) {
        const query = includeInactive ? '?includeInactive=true' : '';
        return this.http.get<any[]>(this.url + '/getAllUsers' + query);
    }

    updateUser(updatedUser: any) {
        return this.http.patch<any>(this.url + '/updateUser', updatedUser);
    }

    updateDepartmentAccess(payload: { userId: string; departmentId: string; access: string[] }) {
        return this.http.patch<any>(this.url + '/updateDepartmentAccess', payload);
    }

    /** Tells the confirm prompt whether Delete will hard-delete or deactivate. */
    checkDeleteUser(userId: string) {
        return this.http.get<UserDeleteCheck>(this.url + '/deleteUser/' + userId + '/check');
    }

    /** Hard-deletes a user with no history; deactivates one who has history. */
    deleteUser(userId: string) {
        return this.http.delete<{ result: 'deleted' | 'deactivated' }>(this.url + '/deleteUser/' + userId);
    }

    reactivateUser(userId: string) {
        return this.http.patch<any>(this.url + '/reactivateUser/' + userId, {});
    }
}
