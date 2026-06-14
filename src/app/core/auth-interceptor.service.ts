import { Injectable } from "@angular/core";
import { HttpHandler, HttpInterceptor, HttpRequest } from "@angular/common/http";

@Injectable()
export class AuthInterceptorService implements HttpInterceptor {

    constructor() {}

    intercept(req: HttpRequest<any>, next: HttpHandler) {
        const modifiedReq = req.clone({ withCredentials: true });
        return next.handle(modifiedReq);
    }
}