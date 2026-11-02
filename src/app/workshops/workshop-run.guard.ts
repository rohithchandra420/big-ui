import { Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';
import { Observable, map, take } from 'rxjs';
import { AuthService } from '../core/auth.service';

/**
 * A session's lists and door (Workshops release 3): the Workshop team only —
 * Workshop department members (by the department key), workshop:write and the
 * Plan group. Same rule as big-api utils/workshopAccess.js; the server checks too.
 */
@Injectable({ providedIn: 'root' })
export class WorkshopRunGuard implements CanActivate {
  constructor(private auth: AuthService, private router: Router) {}

  canActivate(): Observable<boolean | UrlTree> {
    return this.auth.user.pipe(take(1), map(user => {
      if (!user) return this.router.parseUrl('/login');
      return this.auth.canRunWorkshops(user) ? true : this.router.parseUrl('/workshops');
    }));
  }
}

/** Workshops › Reports: the Workshop team and workshop:read (same rule as the server). */
@Injectable({ providedIn: 'root' })
export class WorkshopReadGuard implements CanActivate {
  constructor(private auth: AuthService, private router: Router) {}

  canActivate(): Observable<boolean | UrlTree> {
    return this.auth.user.pipe(take(1), map(user => {
      if (!user) return this.router.parseUrl('/login');
      return this.auth.canReadWorkshops(user) ? true : this.router.parseUrl('/workshops');
    }));
  }
}
