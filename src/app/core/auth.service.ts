//Service Used to call API to check the login Service at the backend

import { Injectable } from "@angular/core";
import { DepartmentAccess, User } from "./user.model";
import { HttpClient, HttpErrorResponse } from "@angular/common/http";
import { BehaviorSubject, Subject, catchError, pipe, tap, throwError } from "rxjs";
import { Router } from "@angular/router";
import { environment } from "src/environments/environment.development";
import { NotificationService } from "./notification.service";
import { PushService } from "./push.service";

@Injectable()
export class AuthService {
    loggedIn = false;
    url = environment.URL;


    user = new BehaviorSubject<User | null>(null);

    userLoggedInEmitter = new Subject<string>();
    loginErrorMessageEmitter = new Subject<string>();

    constructor(private router: Router, private http: HttpClient, private notificationService: NotificationService,
                private pushService: PushService) {//private user1: User) {
    }

    private readonly permTiers = ['read', 'write', 'manage'];

    getUserPermissions(user: User): string[] | 'ALL' {
        if (['DEV', 'DIR'].includes(user.role)) return 'ALL';
        return user.permissions || [];
    }

    deptNameToKey(name: string): string {
        return (name || '').toLowerCase().replace(/\s+/g, '-');
    }

    /** A department's permission key: its fixed `key`, or the name-based key
     *  for departments not migrated yet (same fallback as big-api's deptKeyOf). */
    deptKeyOf(dept: { name?: string; key?: string } | null | undefined): string {
        if (!dept) return '';
        return dept.key || this.deptNameToKey(dept.name || '');
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
                const key = this.deptKeyOf(d.department);
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

    /** Member of the department with this fixed key (never matched by name). */
    inDepartmentKey(user: User, key: string): boolean {
        return (user.departments || []).some(d => this.deptKeyOf(d.department) === key);
    }

    /** Workshops (release 2), same rule as big-api utils/workshopAccess.js —
     *  Plan: DEV/DIR/ADMIN, the Workshop department's TL, workshop:manage. */
    canPlanWorkshops(user: User | null): boolean {
        if (!user) return false;
        if (['DEV', 'DIR', 'ADMIN'].includes(user.role)) return true;
        if (user.role === 'TL' && this.inDepartmentKey(user, 'workshop')) return true;
        return (user.permissions || []).includes('workshop:manage');
    }

    /** Run: the Plan group, every Workshop department member, workshop:write. */
    canRunWorkshops(user: User | null): boolean {
        if (!user) return false;
        if (this.canPlanWorkshops(user) || this.inDepartmentKey(user, 'workshop')) return true;
        return (user.permissions || []).includes('workshop:write');
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
        // PWA Phase 2: if this device gets notifications, switch them off first
        // (needs the still-valid session), then end the session on the server.
        const endSession = () => this.http.post(this.url + '/user/logout', {}).subscribe();
        if (this.pushService.hasDeviceSubscription) {
            this.pushService.cleanupOnLogout().finally(endSession);
        } else {
            endSession();
        }
        this.loggedIn = false;
        localStorage.removeItem('IsLoggedIn');
        localStorage.removeItem('userData');
        this.user.next(null);
        this.router.navigate(['/login']);
    }

    // Called by AuthInterceptorService when an API call comes back 401 while
    // the app still thinks it's logged in (cookie expired/invalidated
    // server-side without the SPA knowing). Local cleanup only — deliberately
    // does NOT call /user/logout, since the server has already invalidated
    // the session; hitting that endpoint would just 401 again and risk a loop.
    handleSessionExpired() {
        if (!this.user.value) return; // already logged out — nothing to do, avoids re-triggering
        this.loggedIn = false;
        localStorage.removeItem('IsLoggedIn');
        localStorage.removeItem('userData');
        this.user.next(null);
        this.notificationService.openErrorSnackBar('Your session has expired. Please log in again.');
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

