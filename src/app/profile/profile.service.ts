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

  /** Hospitality: the signed-in user's own food preference. */
  setFoodPreference(foodPreference: 'veg' | 'non-veg') {
    return this.http.patch<{ foodPreference: string }>(this.url + '/user/me/food-preference', { foodPreference });
  }

  /** Hospitality H2: the signed-in user's own meal QR, and a fresh one (the old stops working). */
  getMealQr() {
    return this.http.get<{ image: string }>(this.url + '/user/me/meal-qr');
  }
  resetMealQr() {
    return this.http.post<{ image: string }>(this.url + '/user/me/meal-qr/reset', {});
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
}
