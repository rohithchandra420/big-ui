import { Injectable } from "@angular/core";
import { HttpErrorResponse, HttpHandler, HttpInterceptor, HttpRequest } from "@angular/common/http";
import { catchError, throwError } from "rxjs";
import { AuthService } from "./auth.service";

@Injectable()
export class AuthInterceptorService implements HttpInterceptor {

    constructor(private authService: AuthService) {}

    intercept(req: HttpRequest<any>, next: HttpHandler) {
        const modifiedReq = req.clone({ withCredentials: true });
        return next.handle(modifiedReq).pipe(
            catchError((error: HttpErrorResponse) => {
                // Only react if the app still thinks it's logged in — an
                // anonymous request (e.g. the public dashboard) 401ing is
                // expected and not a "session expired" situation.
                if (error.status === 401 && this.authService.currentUser) {
                    this.authService.handleSessionExpired();
                }
                return throwError(() => error);
            })
        );
    }
}
