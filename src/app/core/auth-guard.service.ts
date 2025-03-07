// import { CanActivateFn } from "@angular/router";

import { Injectable } from "@angular/core";
import { ActivatedRouteSnapshot, CanActivate, Router, RouterStateSnapshot, UrlTree } from "@angular/router";
import { Observable, map, take } from "rxjs";
import { AuthService } from "./auth.service";


// export function authGuard(): CanActivateFn {
//     return () => {
//         const featureFlagsService: FeatureFlagsService = 
//     };
// }

@Injectable()
export class AuthGuard implements CanActivate {
    constructor(private authService: AuthService, private router: Router) {}

    canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): boolean | UrlTree | Observable<boolean | UrlTree> | Promise<boolean | UrlTree> {
    //     return this.authService.isAuthenticated().then(
    //         (authenticated: boolean) => {
    //             if(authenticated) {
    //                 return true;
    //             } else {
    //                 this.router.navigate(['/']);
    //             }
    //         }
    //         );

        return this.authService.user.pipe(take(1), map( user => {
            //return !user ? false : true;
            const isAuth = !!user;
            if(isAuth) {
                return true;
            }
            return this.router.createUrlTree(['/home']);

        }));
    }
}