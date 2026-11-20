import { Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';
import { Observable, map, take } from 'rxjs';
import { AuthService } from '../core/auth.service';

/**
 * Music pages (Planner, Setup): the Music team, music grants and Helpdesk.
 * Same rule as big-api utils/musicAccess.js; the server checks every request,
 * and the pages hide change buttons from people who may only view.
 */
@Injectable({ providedIn: 'root' })
export class MusicGuard implements CanActivate {
  constructor(private auth: AuthService, private router: Router) {}

  canActivate(): Observable<boolean | UrlTree> {
    return this.auth.user.pipe(take(1), map(user => {
      if (!user) return this.router.parseUrl('/login');
      return this.auth.canViewMusic(user) ? true : this.router.parseUrl('/');
    }));
  }
}
