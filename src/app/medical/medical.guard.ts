import { Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';
import { Observable, map, take } from 'rxjs';
import { AuthService } from '../core/auth.service';

/**
 * Medical Desk pages: DEV, DIR, the Medical department (key `medical`) and
 * anyone granted medical access — never ADMIN. Same rule as big-api
 * utils/medicalAccess.js; the server checks every request too.
 */
@Injectable({ providedIn: 'root' })
export class MedicalGuard implements CanActivate {
  constructor(private auth: AuthService, private router: Router) {}

  canActivate(): Observable<boolean | UrlTree> {
    return this.auth.user.pipe(take(1), map(user => {
      if (!user) return this.router.parseUrl('/login');
      return this.auth.canUseMedical(user) ? true : this.router.parseUrl('/');
    }));
  }
}
