//Service Used to call API to check the login Service at the backend

import { Injectable } from "@angular/core";
import { DepartmentAccess, User } from "./user.model";
import { HttpClient, HttpErrorResponse } from "@angular/common/http";
import { BehaviorSubject, Subject, catchError, pipe, tap, throwError } from "rxjs";
import { Router } from "@angular/router";
import { environment } from "src/environments/environment.development";
import { NotificationService } from "./notification.service";

@Injectable()
export class AuthService {
    loggedIn = false;
    url = environment.URL;


    user = new BehaviorSubject<User | null>(null);

    userLoggedInEmitter = new Subject<string>();
    loginErrorMessageEmitter = new Subject<string>();

    constructor(private router: Router, private http: HttpClient, private notificationService: NotificationService) {//private user1: User) {
    }

    private readonly permTiers = ['read', 'write', 'manage'];

    getUserPermissions(user: User): string[] | 'ALL' {
        if (['DEV', 'DIR'].includes(user.role)) return 'ALL';
        return user.permissions || [];
    }

    deptNameToKey(name: string): string {
        return (name || '').toLowerCase().replace(/\s+/g, '-');
    }

    // Effective module -> best tier, including a TL's automatic 'manage' over their own department(s)
    getEffectivePermissionMap(user: User): { [module: string]: 'read' | 'write' | 'manage' } {
        const map: { [module: string]: 'read' | 'write' | 'manage' } = {};
        const perms = this.getUserPermissions(user);
        if (perms !== 'ALL') {
            perms.forEach(p => {
                const [mod, action] = p.split(':');
                if (!mod || !this.permTiers.includes(action)) return;
                if (!map[mod] || this.permTiers.indexOf(action) > this.permTiers.indexOf(map[mod])) {
                    map[mod] = action as 'read' | 'write' | 'manage';
                }
            });
        }
        if (user.role === 'TL') {
            (user.departments || []).forEach(d => {
                const key = this.deptNameToKey(d.department?.name);
                if (key) map[key] = 'manage';
            });
        }
        return map;
    }

    hasPermission(user: User, required: string): boolean {
        if (this.getUserPermissions(user) === 'ALL') return true;
        const [reqModule, reqAction] = required.split(':');
        const reqLevel = this.permTiers.indexOf(reqAction);
        const level = this.getEffectivePermissionMap(user)[reqModule];
        return level !== undefined && this.permTiers.indexOf(level) >= reqLevel;
    }

    hasDepartmentAccess(user: User, deptName: string): boolean {
        return (user.departments || []).some(d =>
            d.department?.name?.toLowerCase() === deptName.toLowerCase()
        );
    }

    get currentUser$() { return this.user.asObservable(); }
    get currentUser(): User | null { return this.user.value; }

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
        this.http.post<{user: any}>(this.url + "/login", loginDetails)
            .pipe(catchError(this.handleError), tap(resData => {
                const roleName = resData.user.role?.name || resData.user.role;
                this.handleAuthentication(resData.user._id,
                    resData.user.name, resData.user.email,
                    resData.user.bookingId, roleName,
                    resData.user.ticketId, resData.user.departments || [],
                    resData.user.permissions || []);
            }))
            .subscribe(response => {
                this.loggedIn = true;
                localStorage.setItem("IsLoggedIn", 'true');
                this.userLoggedInEmitter.next('response.');
                this.notificationService.openSucessSnackBar("Login Successful");
                this.router.navigate(['']);
            }, error => {
                this.loggedIn = false;
                this.notificationService.openErrorSnackBar(error);
                this.loginErrorMessageEmitter.next(error);
            });
    }

    autoLogin() {
        const raw = localStorage.getItem('userData');
        if (!raw) return;

        const userData: {
            _id: string,
            name: string,
            email: string,
            bookingId: string,
            role: string,
            ticketId: string,
            departments: DepartmentAccess[],
            permissions: string[]
        } = JSON.parse(raw);

        if (!userData) return;

        const loadedUser = new User(
            userData.name, userData.email, userData.bookingId,
            userData.role, userData.ticketId, '', userData._id,
            undefined, userData.departments || [], userData.permissions || []
        );
        this.user.next(loadedUser);
    }

    logOut() {
        this.http.post(this.url + '/user/logout', {}).subscribe();
        this.loggedIn = false;
        localStorage.removeItem('IsLoggedIn');
        localStorage.removeItem('userData');
        this.user.next(null);
        this.router.navigate(['/login']);
    }

    private handleError(errorRes: HttpErrorResponse) {
        let errorMessage =  errorRes.error && errorRes.error.message ? errorRes.error.message :"An unknown error occured";
        if (!errorRes.error || !errorRes.error.message) {
            return throwError(errorMessage);
        }
        return throwError(() => new Error(errorMessage));
    }

    private handleAuthentication(id: string, name: string, email: string, bookingId: string, role: string, ticketId: string, departments: DepartmentAccess[] = [], permissions: string[] = []) {
        const user = new User(name, email, '', role, '', '', id, undefined, departments, permissions);
        this.user.next(user);
        localStorage.setItem('userData', JSON.stringify(user));
    }
}

