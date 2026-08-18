# Changelog

All notable changes to big-ui will be documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

---

## [1.8.0] - 2026-08-18

### Added
- Bookings page: new "Export" button next to Bulk Upload — exports all currently-loaded bookings as an .xlsx file, one row per pass, in the same column format Bulk Upload imports (so the file can be re-uploaded as-is later). Intentionally minimal for now; expected to be extended.

---

## [1.7.0] - 2026-08-03

### Added
- App version now shown as a small, unobtrusive marker in the sidebar footer, kept in sync with this changelog
- Dashboard: new summary stat row (Tickets Sold, Admitted, Pending Admission, Accommodation Bookings, and — for DEV/DIR/ADMIN — Volunteers by department)
- Dashboard: a "Sign In" prompt is now shown to anonymous visitors instead of attempting to load data they don't have access to
- The app now detects an expired/invalidated session on any API call and redirects to `/login` with a notice, instead of silently failing while appearing to still be logged in

### Changed
- Dashboard layout revamped: charts resized and moved into a responsive grid with proper page margins (previously fixed-size canvases with minimal spacing)

---

## [1.6.0] - 2026-08-02

### Added
- **My Department page** (`/my-department`) — accessible by every role, scoped to what each can see/do: DEV/DIR/ADMIN pick any department or an "ALL" cross-department view (Daily Summary / Department Calendar / All Users tabs); TL sees their own department(s); VOL sees their own department read-only
  - **Attendance** tab — date navigation, per-slot marking with a bulk Save and a conflict-confirmation flow when a slot is already claimed by another department
  - **History** tab — per-member attendance summary over a date range
  - **Calendar** tab — a full users-x-dates grid with three-state (marked/unmarked/not-applicable) cells, defaulting scrolled to today
- `DepartmentService`, `department.utils.ts` (`deptShortCode`)
- `TooltipDirective` (`[data-tooltip]`) — on-brand tooltip that positions itself to stay within the viewport, replacing the native `title` attribute on the new attendance dots
- `/profile` — new "My Attendance" section, a compact history of the signed-in user's own attendance since their date of joining
- Admin > Users create/edit — new required Date of Joining field

### Changed
- Design-system checkbox styling applied to the new attendance grid (existing `.cb-wrap` pattern, extended with a disabled state)
- Data tables: cell content centered by default, first column sticky, generalized from the Calendar-style tables to every table on the new page
- Page header layout fixed on My Department and admin Departments pages so it spans edge-to-edge, matching the rest of the app

---

## [1.5.0] - 2026-07-27

### Added
- **Bookings page** (`/box-office/bookings`) — stats row (Emails Sent, Admitted, Spot Registrations — each a tappable filter), searchable/paginated table, a fully interactive slide-in detail panel (booking summary, inline Edit Ticket form, live attendee actions, "Open in Registration"), and a Bulk Upload dialog (drag-and-drop or click-to-select, sheet picker for multi-sheet workbooks, inline validation/duplicate-order-id feedback)
- **Registration page** (`/box-office/registration`) — header stats (Checked In, Pending Admits, Incomplete Details, Spot Registrations), multi-field search/lookup, QR scan auto-navigate, and Spot Registration (on-the-spot multi-item ticket creation for walk-ins, with server-assigned order/transaction ids)
- **Booking Found** (`/box-office/registration/:id`) — primary booker summary plus the shared attendee list (see below)
- `AttendeeListComponent` — shared Check In / Allocate Tent / Vacate / Fill-at-Counter / Edit actions per attendee row, used by both Booking Found and the Bookings panel so this logic lives in exactly one place; an `allowEdit` input controls whether the Edit action (re-opens Counter Form on an already-complete pass, for corrections) is shown
- `AllocateTentComponent` — gender-aware tent picker with best-effort cross-ticket Festival Pass linking and a gender-mismatch confirm step
- `CounterFormComponent` — fills or edits a pass's name/phone/email/gender; wording adapts ("Edit attendee details" vs "Complete attendee details") depending on which
- `TicketEditFormComponent`, `SpotRegistrationComponent`, `BulkUploadComponent` (new components backing the features above)
- `box-office.utils.ts` — shared helpers (`isFestivalPass`, `isSpotRegistration`, pass-grouping/chip helpers) used across the Box Office module
- 152 new Jasmine/Karma tests (222 total, all passing)

### Changed
- `BoxOfficeService` — extended with the new endpoints above, plus `createBoxOfficeTicket()`/`uploadBoxOfficeExcel()` as separate methods from the legacy `createTicket()`/`uploadExcel()` (which still hit the original, untouched Tickets-module routes)
- `AccomodationService` — extended with `allocateTentSlot()`, `vacateTentSlot()`, `suggestFestivalPassMatches()`, `getTentById()` (shared with the future standalone Tenting page, not duplicated into Box Office)

### Notes
- Merge/payment-split/communication-history/internal-notes sections from the original wireframe were intentionally left out of the Bookings panel — no backing data field exists for any of them yet
- The Edit action and Bulk Upload dialog are both deliberate exceptions to (or extensions of) established UI patterns in this module — see in-code comments for the reasoning

---

## [1.4.0] - 2026-07-05

### Added
- `AdminService` — `DeptSummary` and `DeptDetail` interfaces; 5 new methods: `getDepartmentsSummary`, `getDepartmentDetail`, `createDepartment`, `updateDepartment`, `deleteDepartment`
- `DepartmentsComponent` (`/admin/departments`) — department list page with cards showing name, description, TL names, and volunteer count; Create Department dialog; Delete confirm dialog (shows affected users)
- `DepartmentDetailComponent` (`/admin/departments/:id`) — view/edit mode; TL and VOL chip lists with autocomplete user-search pickers; volunteer already-assigned warning banner; save computes add/remove user diff
- `DepartmentCreateDialogComponent` — MatDialog for creating a department (name + description)
- `DepartmentDeleteDialogComponent` — MatDialog showing affected users; force-unassign on confirm
- `MatAutocompleteModule`, `MatSelectModule` added to `CustomMaterialModule`
- 45 new Jasmine tests across all 4 new components (70 total, all passing)

### Changed
- `app-routing.module.ts` — added `/admin/departments` and `/admin/departments/:id` child routes (DEV/DIR/ADMIN only via `AuthPermissionGuard`)
- `admin-menu.component.ts/.html` — added Departments nav link (desktop + mobile) gated by `canSeeManageDepts`; removed `navigateTo()` helper; mobile menu buttons now use `[routerLink]` consistently with desktop

---

## [1.3.0] - 2026-06-20

### Added
- `AuthService.getEffectivePermissionMap(user)` — single source of truth for a user's effective access: merges explicit `permissions[]` strings with a role rule — TL automatically has `manage` tier for any department they belong to, regardless of explicit permission grants
- `AuthService.deptNameToKey(name)` — now public; converts department display name to permission module key (`"Box Office"` → `"box-office"`)
- 6 new Jasmine tests for `getEffectivePermissionMap` and TL auto-manage (`hasPermission` + map contents + cross-dept denial)

### Changed
- `auth.service.ts` — `hasPermission()` now delegates to `getEffectivePermissionMap`; tiered comparison is map-based instead of a `.some()` loop
- `app-routing.module.ts` — `/admin/user` route now allows TL role in addition to DEV/DIR/ADMIN; `/admin/tickets` remains DEV/DIR/ADMIN only
- `header.component.ts/.html` — replaced hardcoded `userRole === 'ADMIN'` gate on the "Admin" nav link with `canSeeAdminMenu` getter (DEV/DIR/ADMIN/TL); added `canSeeTicketRegistry` getter (DEV/DIR/ADMIN) for the Ticket sub-item; applied to both desktop and mobile variants
- `admin-menu.component.ts/.html` — Ticket link gated by new `canSeeTickets` getter (DEV/DIR/ADMIN only)
- `user-registery.component.ts/.html` — form and list now role-aware:
  - `canCreateUsers` (DEV/DIR/ADMIN): gates create form, delete buttons
  - `canViewPage` (+ TL): gates the entire page content
  - `canEditUser(user)`: DEV/DIR/ADMIN always; TL only for users in their own department
  - New **Home Department** single-select dropdown (membership entry, separate from permission chips)
  - For TL: role/department dropdowns skipped (admin-gated endpoints); TL's own department list sourced from their in-memory user object
  - User cards now show Department (home dept name) and Access (highest effective tier via `getEffectivePermissionMap`)
- `profile.component.ts/.html/.css` — department section redesigned:
  - `departments[]` shown as plain membership badges (typically one)
  - `permissions[]` shown as a read-only Department + Tier table driven by `getEffectivePermissionMap` (Read/Write/Manage, colour-coded)
  - Removed old editable Read/Read+Write radio toggle that wrote to `departments[].access` (field no longer read anywhere)
  - DEV/DIR still show "Full Access" banner instead of a table

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
