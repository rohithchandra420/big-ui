# Changelog

All notable changes to big-ui will be documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

---

## [1.2.0] - 2026-06-19

### Added
- `src/app/box-office/` — Box Office module (renamed from Registration): component, service, and styles. Route changed from `/register` to `/box-office`.
  - Page visibility: DEV/DIR/ADMIN always; users with `box-office:read` permission; users in the Box Office department
  - Submit button: DEV/DIR/ADMIN always; TL with `box-office:read` permission or Box Office department membership; VOL cannot submit
- `AuthService.hasDepartmentAccess(user, deptName)` — checks `user.departments[].department.name` (populated at login) as a secondary access fallback
- `AuthService.getUserPermissions(user)` — returns `'ALL'` for DEV/DIR (bypasses all checks); returns `user.permissions` string array for all other roles
- Tiered permission checking in `AuthService.hasPermission()` — a higher-tier permission satisfies a lower-tier check (e.g., `write` satisfies a `read` requirement)
- `AuthPermissionGuard` extended to support three OR-combined access criteria via route data: `roles`, `permissions`, and `departments`

### Changed
- `src/app/core/user.model.ts` — `permissions` field changed from object array to `string[]`; removed static `RolePermissions` map (permissions now come from API)
- `src/app/admin/user-registery/` — department access UI replaced with toggle chip rows (Read / Write / Manage pill buttons per department, colour-coded by level); `buildPayload()` produces `permissions: string[]` alongside `departmentIds`; edit mode restores chip state from user's permission strings
- `src/app/header/header.component.*` — navigation link updated from "Register" to "Box Office" (`/box-office`), gated by role, permission, and department membership
- `src/app/core/app-routing.module.ts` — `/box-office` route added with permission guard; `/register` route removed
- `src/app/app.module.ts` — `RegistrationComponent` replaced with `BoxOfficeComponent`

### Fixed
- `src/app/core/auth.service.spec.ts` — updated tests to use string permissions; added tiered permission test
- `src/app/admin/admin.service.ts` — `getRoles()` and `getDepartments()` wired to correct backend endpoints

---

## [1.1.1] - 2026-06-14

### Fixed
- `auth.service.ts` — extract `role.name` from populated role object returned by login API; previously `user.role` was an ObjectId string, breaking `RolePermissions` lookup
- `header.component.html` — admin menu condition corrected from `'admin'` to `'ADMIN'` to match actual role names from DB
- Removed leftover `debugger` statements from `profile.component.ts` and `profile.service.ts`

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
