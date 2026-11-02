# Changelog

All notable changes to big-ui will be documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

---

## [1.23.0] - 2026-11-03

### Added
- **Wrist bands** (Workshops epic, first part):
  - **Admit** now opens the wrist band scanner: scan the person's band to admit them and link the band in one step.
  - **Link Band** (now saved) for people admitted before bands existed.
  - **Replace Band** with a reason, for a lost or broken band (Box Office staff, Directors, Admins, Developers).
  - A band badge on each admitted Festival Pass opens its band history: current and replaced bands, who linked or replaced them and when.
  - A band already linked to someone else is refused, naming who has it. A replaced band shows a red "Replaced band" card: whose it was, why, and their band now.
- **Scan Ticket QR or Band** on Registration: the scanner now also reads wrist bands and opens that person's booking.

### Changed
- Link Band is no longer a demo: it saves the band to the Festival Pass.

### Notes
- No new dependencies. 777/777 unit tests, 22/22 end-to-end tests.

---

## [1.22.0] - 2026-11-02

### Added
- **Venue Map — areas and lines:** draw the festival boundary, zones and lines on the map, each with a name, kind, responsible department and notes.
  - **Draw boundary / Draw area / Draw line**, with corner handles to adjust the shape afterwards, and **Undo point** (or Ctrl+Z) while drawing.
  - Each kind has its own colour and icon: the boundary is a dashed light-green outline; roads are thick dark grey and walkable paths thin beige; Medical camp has a red cross.
  - Each area shows its kind's icon in the middle on the map (tap it to select the area).
  - **Directions** and **Street View** for areas and lines too (to the middle of an area, or halfway along a line).
  - Areas show their size. The **Areas & lines** list sits beside the map, with a Shown/Hidden switch (the boundary always stays visible).
  - Locations show which zone they're in, and a warning when they're outside the festival boundary.
  - **Import KML** now also reads areas and lines, with the kind guessed from the name and a review list before importing.
  - Team Leads draw only for their own department and only inside the festival boundary; the boundary itself is for Directors, Admins and Developers.
  - **Admin › Events:** each event shows whether its venue boundary is drawn, with a button to draw or view it on the Venue Map.
- New location type **Entry point**.

### Removed
- Location types **Workshop venue** and **First aid**: draw a Workshop area or Medical camp instead.

### Changed
- Venue Map on desktop: the page fits the screen — the map stays in place and only the side panel scrolls.
- Venue Map on phones: picking a location, area or line from a list scrolls back up to the map.
- The **Go to** coordinates box shows only for people who can add or draw.

### Notes
- New dependency: Leaflet-Geoman (free edition, exact version) for drawing; it loads only when the Venue Map is opened, like the map itself.
- Requires big-api 1.15.0.

---

## [1.21.0] - 2026-11-01

### Added
- **Venue Map** (new, under Main for everyone signed in): places on the festival ground for the active event, on a street map or satellite view.
  - Coloured pins by type (Workshop venue, Water station, First aid, Toilets, Stage, Gate / Box Office, Tent field, Other) with a name tooltip, type filters with counts, and a list beside the map (below it on phones).
  - **Add a location** by tapping the map or with **Use my location** (shows how accurate the phone's position is); drag a pin to fine-tune it; edit name, type, responsible department and notes; delete with a confirmation.
  - **Directions** and **Street View** open Google Maps at that spot. **Go to** jumps to pasted coordinates.
  - **Import KML** (DEV, DIR, ADMIN): pins exported from Google My Maps or Google Earth, shown as a review list first so each type can be checked or a place left out. Clear messages for KMZ files, online-only (network link) exports and files with shapes but no pins.
  - Directors, Admins and Developers can change any location; Team Leads add and change locations of their own department; Volunteers view.
  - The map library loads only when the Venue Map is opened, so the rest of the app stays as light as before.
- Requires big-api 1.14.0.

### Development
- Guide screenshots: the sample announcements now record who they went to and who opened them, plus a sample "Emails sent" note, so the Billboard shows notes; new Billboard shots (board, opened note, phone menu with the unread count) taken as a sample volunteer.
- Optional sharper `.png` screenshots (`SHOT_FORMAT=png`, `SHOT_SCALE=2`) for team updates; the guide keeps `.webp`.
- The sample volunteer account was renamed to a new invented name.
- Bundle size warning raised from 2.2 MB to 2.3 MB (user decision); the map library is a separate on-demand file.

---

## [1.20.0] - 2026-11-01

### Added
- **Billboard** (under Main, for everyone): every announcement sent to you, as post-it notes on a board — newest first.
  - Each note is in its type's colour (General, Urgent, Schedule, Weather, Reminder, Task), with a push-pin, a slight tilt, a handwritten title and a **NEW** sticker until you open it.
  - Tap a note to open it as a large post-it with the full message, who sent it, who it went to and when.
  - **All / Unread** tabs, **Mark all read**, and **Show older** after the newest 100.
  - A red **unread count** on the sidebar link, refreshed after sign-in, when a notification arrives and when you come back to the app.
  - Tapping a notification now opens that note on the Billboard.
  - Shows announcements even if you never turned notifications on or muted them. When an email batch you started finishes, a private "Emails sent" note appears there too.
  - Announcements sent before this release are not on the Billboard.
- Full width, like Bookings; two notes per row on phones.
- Requires big-api 1.13.0.

### Development
- 17 new tests (713/713).

---

## [1.19.1] - 2026-11-01

### Fixed
- **My Profile → Notifications** had no section heading and ran straight into "My Attendance" — it now has its heading and spacing like the other sections.

### Development
- Guide screenshots: sample announcements in the test data, the Announcements page added to the screenshot run, and the My Profile shot stops above the Notifications card (the screenshot server can't show its real state).

---

## [1.19.0] - 2026-11-01

### Added
- **Push notifications (installable app, part 2).**
  - **My Profile → Notifications:** shows whether notifications are on for this device (with clear guidance when the browser blocks them, or on iPhone where BiG must be installed first), a **Turn on / Turn off** button, **Send test**, and switches for "Email batch finished" and "Announcements".
  - **One-time prompt** after signing in: "Get BiG notifications on this device · Turn on" — dismissible, never shown again on that device.
  - **Admin → Announcements** (DEV, DIR, ADMIN): pick a **type** from colour-coded icon tiles (General, Urgent / Safety, Schedule change, Weather, Reminder, Task), write a title and message, choose **roles and/or departments** with toggle chips (with Select all / Clear) — a "Goes to:" line spells out the audience (e.g. "Volunteers in Box Office") — see a lock-screen preview, confirm and send. Urgent sends are shown in red and confirmed as such.
  - On the phone, each type has its own coloured icon (Android and desktop) and its name at the start of the title (e.g. "Weather: Heat advisory"), so it's clear on iPhone too.
  - **Layout:** full width on desktop — the form on the left, **Sent announcements** on the right in its own scrolling column (stacked on tablets and phones).
  - **Sent announcements** show their type, audience, sender and device count, each with **Send again** (a new copy, marked "Resent") and **Copy to form** (to change it before sending). A **search box** (title and message) and **Type / Department / Role** filters narrow the list, with "Showing x of y" and Clear filters.
  - "Developers" is only offered as an audience to Developers.
  - Tapping a notification opens the right page. Signing out turns notifications off for that device first.
- Requires big-api 1.12.0.

### Changed
- **New icon set across the whole app:** Material Symbols Rounded (Google's successor to the previous Material Icons) — a softer, more modern look, outlined by default. Same icons in the same places.
- New reusable styles: choice tiles (coloured single-select tiles), toggle chips (multi-select pills), pill buttons, a search field, and a screen-reader-only helper.

### Development
- End-to-end tests reuse one sign-in per account (the server allows only a few sign-ins per 15 minutes); new tests for Announcements and the Profile settings.

### Notes
- 40 new unit tests (696/696); end-to-end 16/16; installable-app checks 10/10.

---

## [1.18.0] - 2026-10-24

### Added
- **BiG is now an installable app (PWA, part 1).**
  - **Install it:** on Android (and desktop Chrome) an **Install** prompt appears; on iPhone/iPad a hint explains **Share → Add to Home Screen**. Both can be dismissed for good. Installed, BiG opens full-screen from its own home-screen icon (the "BiG" icon in the brand green).
  - **Opens without signal:** the app itself is kept on the device, so it starts quickly and still opens when the connection drops. An **Offline** notice shows while there's no connection; anything that needs the server still says so. Booking and other data are not stored on the device in this release.
  - **New version available:** when a new release goes out, open apps show a **Reload** banner instead of silently running the old version.
  - Notices sit bottom-left on desktop and at the top (under the menu bar) on phones.
- App name in the browser tab is now "BiG · Bloom in Green".

### Development
- **End-to-end tests and guide screenshots with Playwright** (development tooling only — not part of the app users download). `npm run e2e` starts a fully separate copy of the app with its own throwaway database of invented sample data, signs in and clicks through real screens on desktop and phone sizes; `npm run e2e:screens` captures the Product Guide screenshots the same way. First tests: sign-in, the signed-in redirect away from the login page, and the Bookings panel showing the right booking after Allocate Tent.
- `npm run e2e:pwa` builds the production app and checks the install files, the service worker and starting offline, on desktop and phone sizes — with the browser unable to reach anything but the test machine.

### Notes
- 18 new unit tests (656/656) and 10 PWA end-to-end tests; the main end-to-end suite still passes (10/10).

---

## [1.17.2] - 2026-10-24

### Changed
- The app now reaches the server through its own address on the BiG domain, instead of the hosting provider's address. This keeps sign-in working reliably as browsers tighten their cookie rules, and prepares for the installable app (PWA). **Everyone needs to sign in once more after this update.**

### Fixed
- **Signed-in users could open the login page** by typing its address. They are now taken to the home page instead.

---

## [1.17.1] - 2026-10-24

### Changed
- Remaining "checked in" wording replaced with "admitted": the Booking Found subtitle ("3 of 4 admitted") and the Dashboard's accommodation card. A festival pass not yet admitted now shows **Not admitted** instead of "Not arrived".

### Fixed
- **Booking panel showed the previous booking's tent allocation.** After opening Allocate Tent (or Fill at the Counter) in a booking's side panel, closing the panel and opening another booking still showed that screen from the earlier booking. Opening a booking now always starts on its own attendee list. Moving between bookings on Booking Found behaves the same way.

### Notes
- 7 new tests; 636/636 passing. Pairs with big-api 1.11.2 (matching admission messages).

---

## [1.17.0] - 2026-10-16

### Added
- **Link Band** (demo) — a new button on each Festival Pass row (Booking Found and the Bookings panel), next to Admit. It opens the gate QR scanner to read the wrist band handed out at admission and shows what was scanned. Shown once the attendee's details are complete, before and after admission. Same scanner as Scan QR: back camera, one Found sound per read, mute toggle respected. Nothing is saved yet — linking the band to the pass comes once the band ID format is decided.

### Changed
- **"Check In" is now "Admit".** Box Office's admission button, the attendee status badge ("Admitted"), the success/error messages, the Registration header stat and Accommodation Inventory's occupant detail now all say Admit/Admitted. "Check In" is reserved for the planned online pre-arrival form.

### Notes
- 14 new tests; 629/629 passing. No big-api change (stays 1.11.1).

---

## [1.16.1] - 2026-10-16

### Fixed
- **QR scanner beeped non-stop.** The scanner's built-in beep (and, on phones, vibration) went off on every camera frame showing a QR code, up to 30 times a second, until the booking opened. It drowned out the gate sounds, so Found, Not Found and Error were hard to tell apart. The built-in beep and vibration are now off; each scan plays exactly one gate sound.

### Changed
- Clearer gate sounds:
  - **Found** — a bright "ding-DING", with one short vibration.
  - **Not Found** — two harsh buzzes, with two vibrations.
  - **Error** — unchanged (three falling notes, one long vibration).

### Notes
- 1 new test; 615/615 passing. No big-api change (stays 1.11.1).

---

## [1.16.0] - 2026-10-15

### Added
- **Gate sound and vibration** on Registration, so staff know the result without reading the screen:
  - **Found** (Look Up finds exactly one booking, or a scanned QR is accepted) — a bright rising chime and one short vibration.
  - **Not Found** (no booking matches, or the QR is invalid) — a low buzz and three quick vibrations.
  - **Error** (the lookup itself failed — no connection or a server problem) — three falling notes and one long vibration.
  - Several Look Up matches play nothing, since that isn't a result yet.
  - Sounds are generated in the browser (no audio files). iPhones get the sound only; iOS does not support web vibration.
- **Sound on/off toggle** in the Registration page header, remembered on each device.
- **QR scanner retries** — when a scan can't be checked because of the connection or a server problem, it retries up to 3 times with a short pause each time, showing the progress. If it still fails, it plays the Error sound once and offers **Scan again**. Invalid codes are not retried.

### Changed
- Look Up and the QR scanner now say what went wrong when a check fails — no connection, server problem, expired session or no access — in an amber message, instead of "No booking found".
- Admin › Email Report no longer names the mail provider: the Sent card now reads "accepted for delivery".

### Notes
- 31 new tests; 614/614 passing.
- Pairs with big-api 1.11.1 (searching with "+" and other special characters).

---

## [1.15.0] - 2026-10-14

### Added
- **Email on the Bookings page.** The placeholder "Bulk action" button is now an **Email ▾** menu for the selected bookings: **Send Ticket Email** and **Send Custom Email**. **Send Ticket Email** is shown to DEV, DIR, ADMIN, Box Office Team Leads and anyone with Box Office Manage access; **Send Custom Email** to DEV, DIR and ADMIN only.
- **Ticket Email dialog** — shows how many selected bookings are not sent yet, already sent, or have no buyer email; choose "send only to the not-sent" or "resend to all"; shows what is left of today's email allowance; "Send test to me".
- **Custom Email dialog** — subject, a small formatting editor (bold, italic, lists, links), clickable placeholders (`{name}`, `{first_name}`, `{last_name}`, `{order_id}`, `{event}`), optional ticket details + QR, a live preview of the exact email, and "Send test to me".
- **Background sending with a progress card** that stays visible while moving between pages; Bookings refreshes itself when a send finishes. Sends with failures stay on screen until dismissed.
- **Booking detail panel and Booking Found** get "Send Ticket Email" / "Custom Email" buttons and the booking's **Email history**.
- **Spot Registration** — "Email ticket to buyer" option (on by default) sends the new booking's ticket email straight after registering.
- **Test mode** — when the server is in test mode, every send asks for a tester email address and goes only there, with a clear banner.
- **Admin › Events** — per-event Ticket Email subject and intro, with the default wording shown as a hint.
- **Admin › Email Report** (DEV, DIR, ADMIN only) — every email the platform has sent, in the Bookings layout: summary cards (Sent, Delivered, Bounced, Failed, Opened), search, filters (type, send status, delivery, event, sender, date range), a paged table, and a side panel with the full details, the delivery timeline and — for custom emails — the message as written. **Export** downloads the filtered list as Excel (up to 5,000 rows).
- **Delivery status** — once the mail provider reports back, email history shows Delivered / Bounced / Marked spam etc. instead of just "Sent", with the reason for a bounce and an approximate "opened" time.
- **Ticket Email status filter** on Bookings (Not sent / Sending / Sent / Bounced / Failed / No email), alongside search and the summary cards.
- Reusable `app-rich-text-editor` component (`shared/`).

### Changed
- The **Email Sent** column and stat card are now **Ticket Email**, with statuses Not sent / Sending… / Sent / Bounced / Failed (hover for the reason) / No email.
- The gate **QR scanner** now checks every scanned code with the server; edited or made-up codes are rejected with a message and the scanner keeps running.
- Booking email state renamed from `hasEmailSent` to `ticketEmail` (matches big-api 1.11.0).
- Production build: the initial bundle's warning budget was raised from 2.1 MB to 2.2 MB (the error limit is unchanged).

### Notes
- 101 new tests; 583/583 passing. Production bundle about 2.10 MB (warning budget 2.2 MB).
- Requires big-api 1.11.0.

---

## [1.14.1] - 2026-10-13

### Fixed
- **Users page could freeze the whole app.** Opening Admin > Users often left the browser tab unresponsive. The Department filter rebuilt its option list as brand-new objects on every screen update, so the dropdown's options were torn down and re-created endlessly and the page locked up. The Role and Department filter options are now built once each time the user list loads, and both dropdowns track their options by value.
- Same pattern fixed in the user edit form's locked Role dropdown, the one a Team Lead sees when editing a user.

### Notes
- 6 new regression tests. 482/482 passing.
- Sidebar version marker bumped to `v1.14.1`.

---

## [1.14.0] - 2026-10-10

### Added
- **Users page redesign** (Admin > Users), now laid out like Bookings:
  - full-width page;
  - a summary row of tappable cards that filter the table: Admins, Team Leads, Volunteers, No Department, and Deactivated (DEV/DIR only);
  - search by name or email, plus Role, Department and Status (Active / Deactivated / All, DEV/DIR only) filters, and a Clear button;
  - a paged table, sorted by name;
  - a right-side panel that shows the user's full details first (department, access level, dates, per-department access), with **Edit**, **Delete** and **Reactivate** actions. "+ New User" opens the same panel in create mode.
- **Delete user** with a confirmation that explains the outcome before anything happens: either a permanent delete (no records), or deactivation (has records, which are kept). DEV/DIR can **Reactivate** a deactivated user.
- **Profile photos.**
  - Upload from the device or take one with the camera, then drag and zoom to position a round crop. The photo is compressed in the browser to about 3–6 KB.
  - Shown in the Users table and panel, the sidebar, My Profile, Departments (cards and detail chips) and My Department (TL row and every people table). The person's initial remains the fallback.
  - Users change their own photo on My Profile; admin roles can change anyone's from the Users panel.
  - Photos load once and are cached, so they aren't downloaded again on later views.
- Reusable building blocks for future features: an image cropper (circle or square crop) and a photo picker dialog (upload or camera, then crop), both in `shared/`.

### Changed
- The Users page's create/edit form moved into its own `UserFormComponent`. It also now checks that the password and confirm-password fields match, which it didn't before.
- Production build: the initial bundle's warning budget was raised from 2 MB to 2.1 MB. The error limit is unchanged.

### Removed
- The non-functional "Change photo" placeholder on My Profile (it previewed a file but never saved it), replaced by the real photo feature.

### Notes
- Paired with big-api 1.10.0, which adds delete/deactivate/reactivate and the profile photo endpoints.
- 476/476 tests passing (70 new); production build clean.

---

## [1.13.0] - 2026-10-04

### Removed
- **Orphaned `app/registration/` folder** — never declared in `app.module.ts` or routed; was importing the `TicketsService` removed in 1.12.0.
- **Retired legacy Tenting page** (`AccomodationComponent` + `OccupantPopupComponent`) — unrouted since 1.10.0, superseded by Accommodation Setup/Inventory. `AccomodationService` is kept (still used by Accommodation and Box Office); the old `/accomodation` URL still redirects to Inventory.
- **Ticket Registry placeholder** (`/admin/tickets` and its "Tickets" admin sidebar link) — an empty scaffold page with no functionality.
- Unused service methods with no remaining callers: `BoxOfficeService.createTicket`, `getTicketsById`, `uploadExcel`; `AccomodationService.getAllFestivalTickets`, `removeOccupant` (vacating a tent slot goes through `vacateTentSlot`, unchanged).

### Fixed
- Sidebar version marker was stuck at `v1.9.1` (not bumped in 1.10.0–1.12.0); now `v1.13.0`.

### Notes
- 13 files deleted, 6 trimmed. 406/406 tests passing, production build clean.
- Paired with big-api 1.9.0, which removes the matching unused backend endpoints.

---

## [1.12.0] - 2026-10-03

### Removed
- **Legacy Tickets module** (`/tickets`, `/tickets/details/:id`) — ticket lookup, QR admission scanning, tent allocation, and the "Tickets" sidebar link. Fully superseded by Box Office's registration/check-in/tent-allocation flow; confirmed with stakeholders that no tickets from the pre-Introducing-Events era still need to be viewable through this screen. Backend (`ticket.js`/`excelUpload.js`) deliberately left in place for now.
- **Bare `/box-office` dashboard** (the old, pre-restructure landing page) — already had no nav link pointing to it (orphaned, reachable only by direct URL); removed alongside Tickets since it shared `TicketsService`.
- **Calendar module** (`/calendar`, Task Pool, Task Edit, and the "Calendar" sidebar link) — was never wired to a real backend (`task.service.ts`/`calendar.service.ts` only ever had commented-out placeholder API calls, no `/calendar` or `/task` route exists in big-api), carried unremoved demo-scaffold leftovers (placeholder text, the stock Angular logo, an unfinished "Angular Calendar Scheduler Demo" title, Italian button labels) from the third-party `angular-calendar`/`angular-calendar-scheduler` starter it was built from. Not being pursued further.

### Notes
- 24 files deleted, 3 trimmed (`app.module.ts`, `core/app-routing.module.ts`, `header/header.component.html`). 406/406 tests passing (unchanged — none of the removed components had test coverage), both dev and production builds clean; production bundle size dropped and is no longer over the configured budget.
- One pre-existing, unrelated issue surfaced in passing: the already-orphaned `app/registration/` folder (not declared in `app.module.ts`, not routed, already flagged for manual deletion) imports from the now-removed `tickets/tickets.service.ts`. Harmless — it was never part of the compiled app either way — but left as-is pending its own decision.

---

## [1.11.0] - 2026-10-02

### Added
- **Inventory: vacate an occupant directly** — closes out the Accommodation Restructure's parked follow-up #3. Vacate-only (no reassignment/swap — that still goes through Box Office's Allocate Tent, which owns the gender/linked-pass logic), reusing the existing `vacateTentSlot` endpoint with no new backend surface, so a concurrent action from Box Office resolves exactly as it already does between two Box Office staff.
- **Generic confirm-dialog component** (`app-confirm-dialog`/`ConfirmationService`, `shared/confirm-dialog/`) replacing `window.confirm()` app-wide (Inventory's Vacate and Delete, Event Detail's Delete Event and Delete Pass Type, My Department's attendance-conflict overwrite prompt, Task Pool's Delete Task) — styled consistently via the app's existing global MatDialog overrides, no new CSS needed for the dialog shell itself.

### Changed
- Dialog title bar is now the brand dark green with white text, app-wide (every `MatDialog` in the app shares this one global style) — was plain text on a light background with a thin border.

---

## [1.10.0] - 2026-08-20

### Added
- **Accommodation Restructure** — replaces the legacy, broken `/accomodation` "Tenting" page with a new top-level "Accommodation" section:
  - **Setup** page — pick an existing Tent-category PassType, batch-create numbered physical units (capacity + quantity); one-time inline Code prompt for a PassType that doesn't have one yet
  - Setup's per-PassType occupancy summary cards — Units open/total and Slots vacant/total as ratios, Wholly Vacant and Full as plain counts, and a matching Male/Female/Mixed breakdown for both Partially Filled and Filled units
  - **Inventory** page — searchable/filterable list of every physical unit (search by Accom No or occupant name; filter by Type and by Occupancy status), natural/numeric Accom No sort (SH1, SH2 … SH9, SH10), row colour-coding by occupancy, a Gender column, a per-event-persisted type filter, and inline Edit (rename/recapacity) / Delete
  - Inventory rows with occupants expand to a colour-coded detail card per occupant (name, gender, phone, email, order #, admission status)
  - Allocated tent now shown directly on the Festival Pass row in Box Office's attendee list, mirroring the tent-pass side
- **Custom dropdown component** (`app-select`/`app-option`) replacing native `<select>` across the app (Users, Department/Event edit, Setup, Inventory, Header's event picker, Allocate Tent, Spot Registration, Counter Form, Bulk Upload, My Department, Calendar) — native dropdown panels can't be reliably width-constrained via CSS in any browser, so this is a from-scratch, native-styled replacement with a panel guaranteed to match its trigger's width, rather than adopting Angular Material's `mat-select`
- **Design consistency pass** — Users and Setup's create forms, and their pages generally, are now properly centered (were sitting flush-left); every form across the app now shares the same card treatment (background, rounded corners, shadow) as Users' "Register New User" form, including Department Edit and Event Edit which previously had none

### Changed
- Bookings' detail panel now shows "Attendees (N) / Passes (M)" instead of a single ambiguous count — N is actual people (Festival Passes), M is total items including Tent Passes
- Allocate Tent's Festival Pass auto-suggestion now falls back to the booking's own buyer details when the Tent Pass item itself has none to search on, instead of showing nothing

### Fixed
- Allocate Tent's vacant-tents picker was silently always empty — it queried by a stale free-text item name instead of the real PassType id, so staff could never pick a specific tent (allocation itself still worked via the backend's auto-pick fallback)
- Allocate Tent's Festival Pass auto-suggestion could return unrelated attendees — it searched using the Tent Pass item's own (blank) details, which after the `boxOffice.js` pre-fill fix could exact-match every other blank item event-wide
- Allocate Tent's Festival Pass checkbox occasionally didn't visually mark despite the click registering — a decorative checkbox nested inside an already-clickable row could double-fire the same toggle, cancelling itself back out
- Removed the internal ShopCart id from two attendee-facing displays (Box Office's attendee list, Allocate Tent's suggestion list) — no operational value, was just confusing
- Dropdown boxes app-wide now have consistent rounded corners, borders, and a focus highlight matching every other input

### Notes
- The old `/accomodation` route still redirects to the new Inventory page
- Full plan and decision history in ACCOMMODATION_CONTEXT.md

---

## [1.9.1] - 2026-08-19

### Fixed
- Allocate Tent's "suggest matching Festival Pass" lookup was silently returning zero matches always — the backend's `/suggestFestivalPassMatches` endpoint requires `eventId` (added when Events/PassTypes were introduced), but the frontend caller never sent one, so every call failed validation and the error was swallowed. Now sends the active event's id.
- The active Event selection didn't survive a page refresh, always resetting to the first event in the list — a startup race cleared the persisted selection before the restored session was recognized. Now persists correctly until manually changed.

---

## [1.9.0] - 2026-08-18

### Added
- **Introducing Events** — new Admin > Events page (list/create/edit Events, inline PassType add/edit/delete) and an active-Event selector in the sidebar, driving which event Box Office/Bookings/Dashboard are scoped to
- Spot Registration's item picker is now a live PassType dropdown sourced from the active event, replacing the old hardcoded list
- Bulk Upload: unrecognized item names from the Excel file are now cross-checked against the active event's real PassTypes as soon as the file is parsed — staff can confirm + assign a category to any unrecognized ones right there ("Create N Pass Types & Upload") instead of hitting a hard validation error and having to go create them separately first
- Dashboard's summary stat row now correctly counts bookings created via the reworked Box Office flow too

### Changed
- Bookings/Registration search and listing are now scoped to the active event
- Bookings' Export button (see [1.8.0] below) now also recognizes passes created via the current Box Office flow, not just the legacy format

### Notes
- The legacy Tickets module (`ticket.details`, old registration form) is unaffected — it still runs on the older, unscoped model, deliberately left untouched
- Full plan and decision history in INTRODUCING_EVENTS_CONTEXT.md

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
