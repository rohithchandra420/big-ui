import { Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { EmailService } from './email.service';

/**
 * Admin > Email Report: DEV/DIR/ADMIN only (it shows custom emails' full text).
 * The backend decides (GET /emails/config → canViewReport) and
 * enforces it on every /emails route too; this guard only keeps others from
 * landing on an empty page.
 */
@Injectable({ providedIn: 'root' })
export class EmailAccessGuard implements CanActivate {

  constructor(private emailService: EmailService, private router: Router) { }

  canActivate(): Observable<boolean | UrlTree> {
    return this.emailService.canViewReport().pipe(
      map(can => can ? true : this.router.parseUrl(''))
    );
  }
}
