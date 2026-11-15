import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivate, Router, UrlTree } from '@angular/router';
import { Observable, map, take } from 'rxjs';
import { AuthService } from '../core/auth.service';

/**
 * WASH pages. Monitor: the WASH team and wash grants (any tier). A route with
 * `data: { washManage: true }` (Setup): DEV/DIR/ADMIN, the WASH TL, wash:manage.
 * Same rule as big-api utils/washAccess.js; the server checks every request too.
 */
@Injectable({ providedIn: 'root' })
export class WashGuard implements CanActivate {
  constructor(private auth: AuthService, private router: Router) {}

  canActivate(route: ActivatedRouteSnapshot): Observable<boolean | UrlTree> {
    return this.auth.user.pipe(take(1), map(user => {
      if (!user) return this.router.parseUrl('/login');
      const ok = route.data?.['washManage'] ? this.auth.canManageWash(user) : this.auth.canViewWash(user);
      return ok ? true : this.router.parseUrl('/');
    }));
  }
}
