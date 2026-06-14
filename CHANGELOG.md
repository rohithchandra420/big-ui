# Changelog

All notable changes to big-ui will be documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

---

## [1.1.0] - 2026-06-14

### Security
- Migrated authentication from Bearer token in localStorage to httpOnly cookie
  - Token is no longer stored in localStorage or accessible via JavaScript
  - Browser sends cookie automatically on every request (no manual header injection)
- Removed `Authorization: Bearer {token}` header injection from interceptor
- Added `withCredentials: true` to all HTTP requests via `AuthInterceptorService`
- Removed token from `handleAuthentication` — only non-sensitive user data (name, email, role) stored in localStorage

### Added
- `proxy.conf.json` — Angular dev proxy routing `/api/*` to `localhost:3000`
  - Makes cookies work same-origin in development without needing HTTPS
- `auth-interceptor.service.spec.ts` — 3 Jasmine tests: withCredentials, no Authorization header, method preserved
- `auth.service.spec.ts` — 14 Jasmine tests: login flow, logout cleanup, autoLogin, hasPermission, isAuthenticated
- `auth-guard.service.spec.ts` — 2 Jasmine tests: allows authenticated, redirects unauthenticated

### Changed
- `angular.json` — added `proxyConfig: proxy.conf.json` to serve development configuration
- `src/environments/environment.development.ts` — API URL changed from `http://localhost:3000` to `/api` (proxy-compatible)
- `src/app/core/auth-interceptor.service.ts` — replaced Bearer header injection with `withCredentials: true`; removed unused imports
- `src/app/core/auth.service.ts`
  - `logIn` — no longer expects or stores token from response body
  - `handleAuthentication` — stores user without token in localStorage
  - `autoLogin` — restores user from localStorage without token check
  - `logOut` — calls `POST /user/logout` backend endpoint, uses `removeItem` (not `setItem('false')`)

### Production Environment Notes
- Render serves over HTTPS — `SameSite=None; Secure` cookie will work cross-domain
- No frontend environment changes needed for production

---

## [1.0.0] - Initial Release

- Angular 16 SPA for BiG festival ticketing platform
- JWT Bearer token authentication via localStorage
- Role-based UI with permission directives
- Modules: Tickets, Accommodation, Admin, Calendar, Dashboard, Profile, Registration
- Material Design UI with Bootstrap
- QR code scanner for admission
