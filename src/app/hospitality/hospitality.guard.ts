import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivate, Router, UrlTree } from '@angular/router';
import { Observable, map, take } from 'rxjs';
import { AuthService } from '../core/auth.service';

/**
 * Hospitality pages (H1): DEV/DIR/ADMIN, the Hospitality TL and
 * hospitality:manage. Same rule as big-api utils/hospitalityAccess.js; the server checks too.
 */
@Injectable({ providedIn: 'root' })
export class HospitalityGuard implements CanActivate {
  constructor(private auth: AuthService, private router: Router) {}

  canActivate(route?: ActivatedRouteSnapshot): Observable<boolean | UrlTree> {
    return this.auth.user.pipe(take(1), map(user => {
      if (!user) return this.router.parseUrl('/login');
      // `hospitalityView` pages (Today, Guests, Report, Stay) also open read-only for Helpdesk (HD2).
      const ok = route?.data?.['hospitalityView'] ? this.auth.canViewHospitality(user) : this.auth.canManageHospitality(user);
      return ok ? true : this.router.parseUrl('/');
    }));
  }
}
