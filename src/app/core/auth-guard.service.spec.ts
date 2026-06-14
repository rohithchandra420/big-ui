import { TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { Router } from '@angular/router';
import { AuthGuard } from './auth-guard.service';
import { AuthService } from './auth.service';
import { BehaviorSubject } from 'rxjs';
import { User } from './user.model';

describe('AuthGuard', () => {
    let guard: AuthGuard;
    let router: Router;
    let userSubject: BehaviorSubject<User>;

    beforeEach(() => {
        userSubject = new BehaviorSubject<User>(null);

        TestBed.configureTestingModule({
            imports: [RouterTestingModule],
            providers: [
                AuthGuard,
                {
                    provide: AuthService,
                    useValue: { user: userSubject },
                },
            ],
        });

        guard = TestBed.inject(AuthGuard);
        router = TestBed.inject(Router);
    });

    it('allows navigation when user is logged in', (done) => {
        userSubject.next(new User('Test', 'a@b.com', '', 'ADMIN', '', '', '123'));

        const result = guard.canActivate(null, null);
        (result as any).subscribe((value: boolean) => {
            expect(value).toBeTrue();
            done();
        });
    });

    it('redirects to /home when user is not logged in', (done) => {
        userSubject.next(null);

        const result = guard.canActivate(null, null);
        (result as any).subscribe((value: any) => {
            expect(value.toString()).toContain('/home');
            done();
        });
    });
});
