import { Injectable } from "@angular/core";
import { CanActivate, Router, UrlTree } from "@angular/router";
import { Observable, map, take } from "rxjs";
import { AuthService } from "./auth.service";

/**
 * The mirror of AuthGuard, for pages only a signed-out visitor should see
 * (the login page): an already signed-in user who types /login is sent to
 * the home page instead. Navigation only — sign-in itself is unchanged, and
 * a stale session still ends up back at login through the 401 handling.
 */
@Injectable()
export class GuestGuard implements CanActivate {
    constructor(private authService: AuthService, private router: Router) {}

    canActivate(): Observable<boolean | UrlTree> {
        return this.authService.user.pipe(take(1), map(user =>
            user ? this.router.createUrlTree(['/']) : true
        ));
    }
}
