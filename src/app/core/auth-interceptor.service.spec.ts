import { TestBed } from '@angular/core/testing';
import { HTTP_INTERCEPTORS, HttpClient } from '@angular/common/http';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { AuthInterceptorService } from './auth-interceptor.service';

describe('AuthInterceptorService', () => {
    let http: HttpClient;
    let httpMock: HttpTestingController;

    beforeEach(() => {
        TestBed.configureTestingModule({
            imports: [HttpClientTestingModule],
            providers: [
                {
                    provide: HTTP_INTERCEPTORS,
                    useClass: AuthInterceptorService,
                    multi: true,
                },
            ],
        });
        http = TestBed.inject(HttpClient);
        httpMock = TestBed.inject(HttpTestingController);
    });

    afterEach(() => httpMock.verify());

    it('adds withCredentials: true to every request', () => {
        http.get('/api/test').subscribe();
        const req = httpMock.expectOne('/api/test');
        expect(req.request.withCredentials).toBeTrue();
    });

    it('does not add an Authorization header', () => {
        http.get('/api/test').subscribe();
        const req = httpMock.expectOne('/api/test');
        expect(req.request.headers.has('Authorization')).toBeFalse();
    });

    it('preserves the original request method and URL', () => {
        http.post('/api/login', { email: 'a@b.com' }).subscribe();
        const req = httpMock.expectOne('/api/login');
        expect(req.request.method).toBe('POST');
        expect(req.request.withCredentials).toBeTrue();
    });
});
