import { Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';
import { Observable, map, take } from 'rxjs';
import { AuthService } from '../core/auth.service';

/**
 * Volunteers page: DEV/DIR/ADMIN, the Volunteer department's Team Lead and
 * volunteer grants. Being a member of the Volunteer department (the Unassigned
 * pool) gives nothing. Same rule as big-api utils/volunteerAccess.js; the
 * server checks every request too.
 */
@Injectable({ providedIn: 'root' })
export class VolunteersGuard implements CanActivate {
  constructor(private auth: AuthService, private router: Router) {}

  canActivate(): Observable<boolean | UrlTree> {
    return this.auth.user.pipe(take(1), map(user => {
      if (!user) return this.router.parseUrl('/login');
      return this.auth.canViewVolunteers(user) ? true : this.router.parseUrl('/');
    }));
  }
}
