import { ActivatedRouteSnapshot, ResolveFn, RouterStateSnapshot } from "@angular/router";
import { inject } from "@angular/core";
import { AuthService } from "./auth.service";
import { User } from "./user.model";


export const AuthResolver: ResolveFn<User> =
    (route: ActivatedRouteSnapshot, state: RouterStateSnapshot) => {
        console.log("Resolver");
        let data = inject(AuthService).getUserDetails('Admin');
        return data;
    };