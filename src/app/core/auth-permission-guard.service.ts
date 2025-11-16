import { Injectable } from "@angular/core";
import { CanActivate, Router, UrlTree } from "@angular/router";
import { AuthService } from "./auth.service";
import { User } from "./user.model";
import { map, Observable, take } from "rxjs";

@Injectable({ providedIn: 'root' })

export class AuthPermissionGuard implements CanActivate {

    user: User

    constructor(private authService: AuthService, private router: Router) {
        // this.authService.currentUser;
    }

    canActivate(): boolean | UrlTree | Observable<boolean | UrlTree> | Promise<boolean | UrlTree> {
        return this.authService.user.pipe(take(1), map(user => {
            //return !user ? false : true;
            this.user = user;
            if (this.authService.hasPermission(this.user, 'teams:write')) {
                return true;
            }
            return this.router.parseUrl('');
        }));
    }
}
