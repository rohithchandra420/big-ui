import { Injectable } from "@angular/core";
import { ActivatedRouteSnapshot, CanActivate, Router, UrlTree } from "@angular/router";
import { AuthService } from "./auth.service";
import { map, Observable, take } from "rxjs";

@Injectable({ providedIn: 'root' })
export class AuthPermissionGuard implements CanActivate {

    constructor(private authService: AuthService, private router: Router) {}

    canActivate(route: ActivatedRouteSnapshot): boolean | UrlTree | Observable<boolean | UrlTree> | Promise<boolean | UrlTree> {
        const requiredRoles: string[] = route.data['roles'] || [];
        const requiredPermissions: string[] = route.data['permissions'] || [];
        const requiredDepts: string[] = route.data['departments'] || [];

        return this.authService.user.pipe(take(1), map(user => {
            if (!user) return this.router.parseUrl('/login');

            const hasRole = requiredRoles.length === 0 || requiredRoles.includes(user.role);
            const hasPerm = requiredPermissions.length > 0 &&
                requiredPermissions.some(p => this.authService.hasPermission(user, p));
            const hasDept = requiredDepts.length > 0 &&
                requiredDepts.some(d => this.authService.hasDepartmentAccess(user, d));

            if (hasRole || hasPerm || hasDept) return true;
            return this.router.parseUrl('');
        }));
    }
}
