//Service Used to call API to check the login Service at the backend

import { Injectable } from "@angular/core";
import { User } from "./user.model";
import { HttpClient, HttpErrorResponse } from "@angular/common/http";
import { BehaviorSubject, Subject, catchError, pipe, tap, throwError } from "rxjs";
import { Router } from "@angular/router";
import { environment } from "src/environments/environment.development";

@Injectable()
export class AuthService {
    loggedIn = false;
    url = environment.URL;


    user = new BehaviorSubject<User>(null);

    userLoggedInEmitter = new Subject<string>();
    loginErrorMessageEmitter = new Subject<string>();

    constructor(private router: Router, private http: HttpClient) {//private user1: User) {
    }

    isAuthenticated() {
        // debugger;
        // const promise = new Promise(
        //     (resolve, reject) => {
        //         setTimeout(() => {
        //             resolve(this.loggedIn);
        //         }, 800);
        //     }
        // );
        // debugger;
        // return promise;
        return localStorage.getItem("IsLoggedIn")

    }

    getUserDetails(id: string) {
        // user1.name = 'AdminUser';
        // user1.role = 'Admin';
        // user1.userId = 'Admin123';
        this.http.get<User>(this.url + '/user/me/' + id)
        return this.user;
    }

    signUp(signUpDetails) {
        this.http.post<{user:User, token:string}>(this.url + "/signUp", signUpDetails)
            .pipe(catchError(this.handleError), tap(resData => {
                    const user = new User(resData.user._id, 
                        resData.user.name, resData.user.email, 
                        resData.user.bookingId, resData.user.role, 
                        resData.user.ticketId, resData.token);
                }))

    }

    logIn(loginDetails) {
        this.http.post<{user:User, token:string}>(this.url + "/login", loginDetails)
            .pipe(catchError(this.handleError), tap(resData => {
                this.handleAuthentication(resData.user._id, 
                    resData.user.name, resData.user.email, 
                    resData.user.bookingId, resData.user.role, 
                    resData.user.ticketId, resData.token);
            }))
            .subscribe(response => {
                this.loggedIn = true;
                //this.user = response;
                //this.user.next(response.user)
                // setTimeout(() => {
                //     debugger;
                localStorage.setItem("IsLoggedIn", 'true');
                //}, 2000);

                this.userLoggedInEmitter.next('response.')
                //this.userLoggedInEmitter.next('AdminRole');

                this.router.navigate(['home']);
            }, error => {
                debugger;
                this.loggedIn = false;
                this.loginErrorMessageEmitter.next(error);
            });



    }

    autoLogin() {
        const userData: {
            id: string, 
            name: string,
            email: string, 
            bookingId: string,
            role: string,
            ticketId: string,
            _token: string
        } = JSON.parse(localStorage.getItem('userData'));

        if(!userData) {
            return;
        }

        const loadedUser = new User(userData.name, userData.email, userData.bookingId,
            userData.role, userData.ticketId, userData._token);
        if(loadedUser._token) {
            this.user.next(loadedUser);
        }
    }

    logOut() {
        this.loggedIn = false;
        localStorage.setItem("IsLoggedIn", 'false');
        localStorage.removeItem('userData');
        this.user.next(null);
        this.router.navigate(['/dashboard'])
    }

    private handleError(errorRes: HttpErrorResponse) {
        let errorMessage = "An unknown error occured";
        if (!errorRes.error || !errorRes.error.message) {
            return throwError(errorMessage);
        }
    }

    private handleAuthentication(id, name, email, bookingId, role, ticketId, token) {
        const user = new User(name, email, '', role, '', token, id);
        this.user.next(user);
        localStorage.setItem('userData', JSON.stringify(user));
    }
}

