import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { Observable, of } from 'rxjs';

import { EmailAccessGuard } from './email-access.guard';
import { EmailService } from './email.service';

describe('EmailAccessGuard', () => {
  let canSend: boolean;
  let guard: EmailAccessGuard;
  const homeTree = {} as UrlTree;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        EmailAccessGuard,
        { provide: EmailService, useValue: { canViewReport: () => of(canSend) } },
        { provide: Router, useValue: { parseUrl: () => homeTree } }
      ]
    });
    guard = TestBed.inject(EmailAccessGuard);
  });

  const run = () => {
    let result: boolean | UrlTree | undefined;
    (guard.canActivate() as Observable<boolean | UrlTree>).subscribe(r => result = r);
    return result;
  };

  it('lets people with email access in', () => {
    canSend = true;
    expect(run()).toBeTrue();
  });

  it('sends everyone else to the dashboard', () => {
    canSend = false;
    expect(run()).toBe(homeTree);
  });
});
