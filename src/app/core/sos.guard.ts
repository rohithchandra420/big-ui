import { Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';
import { Observable, map } from 'rxjs';
import { SosService } from './sos.service';

/** The SOS page: DEV/DIR/ADMIN and the departments picked on Admin › Public Page (server decides). */
@Injectable({ providedIn: 'root' })
export class SosGuard implements CanActivate {
  constructor(private sos: SosService, private router: Router) {}

  canActivate(): Observable<boolean | UrlTree> {
    return this.sos.canSee().pipe(map(ok => ok || this.router.createUrlTree(['/'])));
  }
}
