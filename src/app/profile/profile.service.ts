import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from "src/environments/environment.development";
import { AuthService } from '../core/auth.service';
import { User } from '../core/user.model';

@Injectable({
  providedIn: 'root'
})
export class ProfileService {

  url = environment.URL;

  constructor(private http: HttpClient, private authService: AuthService) { }

  getMyProfileDetails(userId: string) {
    return this.http.get<User>(this.url + "/user/me", {
      params: new HttpParams().set('id', userId),
      responseType: 'json'
    });
  }

  getProfileDetails(userId: string) {
    return this.http.get<User>(this.url + "/user/profile", {
      params: new HttpParams().set('id', userId),
      responseType: 'json'
    });
  }

  updateProfile(userId: string, updatedData: any) {
    return this.http.patch<any>(this.url + "/updateUser", { _id: userId, ...updatedData });
  }

  updateDepartmentAccess(payload: { userId: string; departmentId: string; access: string[] }) {
    return this.http.patch<any>(this.url + '/updateDepartmentAccess', payload);
  }
}
