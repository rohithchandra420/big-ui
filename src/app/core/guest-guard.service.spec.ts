import { TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { UrlTree } from '@angular/router';
import { BehaviorSubject, Observable } from 'rxjs';
import { GuestGuard } from './guest-guard.service';
import { AuthService } from './auth.service';
import { User } from './user.model';

describe('GuestGuard', () => {
    let guard: GuestGuard;
    let userSubject: BehaviorSubject<User | null>;

    beforeEach(() => {
        userSubject = new BehaviorSubject<User | null>(null);
        TestBed.configureTestingModule({
            imports: [RouterTestingModule],
            providers: [GuestGuard, { provide: AuthService, useValue: { user: userSubject } }],
        });
        guard = TestBed.inject(GuestGuard);
    });

    const run = (): boolean | UrlTree => {
        let result: boolean | UrlTree = false;
        (guard.canActivate() as Observable<boolean | UrlTree>).subscribe(r => result = r);
        return result;
    };

    it('lets a signed-out visitor open the login page', () => {
        expect(run()).toBeTrue();
    });

    it('sends a signed-in user to the home page instead', () => {
        userSubject.next(new User('Test', 'a@b.com', '', 'ADMIN', '', '', '123'));
        const result = run();
        expect(result instanceof UrlTree).toBeTrue();
        expect(result.toString()).toBe('/');
    });
});
