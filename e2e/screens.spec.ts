import { test, Browser, Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'fs';
import * as path from 'path';
import { login, seedIds, USERS } from './helpers';

/**
 * Product Guide screenshots (npm run e2e:screens). Captures each screen at
 * desktop and phone size as .webp into SCREENS_OUT (default
 * e2e/screenshots-out); Alfredoc copies them into the guide's img/ folder.
 * ONLY="bookings,booking-found" limits the run to some screens.
 * SHOT_FORMAT=png and SHOT_SCALE=2 give sharper .png images (e.g. for a team
 * WhatsApp update); the guide uses the defaults (.webp at 1×).
 * Dialogs are opened, never sent — and the isolated API can't send mail anyway.
 */
const OUT = process.env.SCREENS_OUT || path.join(__dirname, 'screenshots-out');
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const FORMAT = process.env.SHOT_FORMAT === 'png' ? 'png' : 'webp';
const SCALE = Number(process.env.SHOT_SCALE) || 1;
const SIZES = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};

/**
 * clipAbove: crop the shot just above this element. Used for My Profile: the
 * dev server runs no service worker, so the Notifications card would wrongly
 * say "This browser can't show BiG notifications" — leave it out of the image.
 */
async function shot(page: Page, name: string, clipAbove?: string) {
  const cdp = await page.context().newCDPSession(page);
  let clip;
  const { width, height } = page.viewportSize()!;
  if (clipAbove) {
    const top = await page.locator(clipAbove).first().evaluate(e => e.getBoundingClientRect().top);
    clip = { x: 0, y: 0, width, height: Math.max(200, Math.floor(top) - 4), scale: SCALE };
  } else if (SCALE !== 1) {
    clip = { x: 0, y: 0, width, height, scale: SCALE };
  }
  const r = await cdp.send('Page.captureScreenshot', { format: FORMAT, ...(FORMAT === 'webp' ? { quality: 82 } : {}), ...(clip ? { clip } : {}) });
  writeFileSync(path.join(OUT, `${name}.${FORMAT}`), Buffer.from(r.data, 'base64'));
  await cdp.detach();
  console.log('saved', name);
}

/** A small Bulk Add file (invented people) for the bulk-add screenshot. */
function bulkAddSample(): Buffer {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const XLSX = require('xlsx');
  const rows = [
    ['name', 'email', 'password', 'role', 'home_department', 'food_preference', 'gender', 'date_of_joining'],
    ['Diya Raman', 'diya@example.com', 'Strong@2026', 'VOL', 'Operations', 'veg', 'Female', ''],
    ['Kabir Sethi', 'kabir@example.com', 'Strong@2026', 'VOL', 'Hospitality', 'non-veg', 'Male', ''],
    ['Anu Varghese', 'anu@example.com', 'Strong@2026', 'TL', 'Box Office', 'veg', 'Female', ''],
    ['Neel Gupta', 'neel@example.com', 'weak', 'VOL', 'Operations', 'veg', 'Male', ''],
    ['Tom Mathew', 'tom@example.com', 'Strong@2026', 'VOL', 'Operations', 'non-veg', 'Male', ''],
  ];
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), 'Users');
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' });
}

/**
 * A small "Import from sales system" file (invented bookings) for the external-import
 * screenshot: new bookings, one already in BiG, one changed since, a missing pass type
 * and an error row. Checked only — never imported.
 */
function salesImportSample(): Buffer {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const XLSX = require('xlsx');
  const H = ['reference', 'kind', 'name', 'phone', 'email', 'paid_at_ist', 'updated_at_ist', 'booking_total_incl_gst', 'razorpay_order_id',
    'line_id', 'item_code', 'item_type', 'item_name', 'quantity', 'item_guests', 'unit_price_ex_gst', 'line_total_ex_gst', 'linked_to_reference'];
  const rows = [H,
    ['BLM-24070', 'online', 'Sneha Kulkarni', '9800000701', 'sneha@example.com', '2026-11-02 19:10', '2026-11-02 19:10', '15319', 'order_SAMPLE24070', 'L1', 'fest-3day', 'pass', 'Festival Pass', '2', '', '4999', '9998', ''],
    ['BLM-24070', 'online', 'Sneha Kulkarni', '9800000701', 'sneha@example.com', '2026-11-02 19:10', '2026-11-02 19:10', '15319', 'order_SAMPLE24070', 'L2', 'tent-2p', 'stay', 'Two-Person Tent', '1', '2', '3499', '3499', ''],
    ['BLM-24071', 'offline', 'Amit Bhosale', '9800000702', 'amit@example.com', '2026-11-03 12:00', '2026-11-03 12:00', '2359', 'BLM-24071', 'L3', 'fest-1day', 'pass', 'Day Pass', '1', '', '1999', '1999', ''],
    ['BLM-24031', 'online', 'Ritu Chawla', '9800000501', 'ritu@example.com', '2026-10-20 18:42', '2026-11-04 09:15', '11798', 'order_SAMPLE24031', 'L4', 'fest-3day', 'pass', 'Festival Pass', '2', '', '4999', '9998', ''],
    ['BLM-24040', 'offline', 'Joel Fernandes', '9800000502', 'joel@example.com', '2026-10-22 11:05', '2026-10-22 11:05', '6488', 'order_SAMPLE24040', 'L5', 'fest-3day', 'pass', 'Festival Pass', '1', '', '4999', '4999', ''],
    ['BLM-24072', 'online', 'Rhea Kamat', '9800000703', 'rhea.k@example.com', '2026-11-04 08:30', '2026-11-04 08:30', '8259', 'order_SAMPLE24072', 'L6', 'fest-3day', 'pass', 'Festival Pass', '1', '', '4999', '4999', ''],
    ['BLM-24072', 'online', 'Rhea Kamat', '9800000703', 'rhea.k@example.com', '2026-11-04 08:30', '2026-11-04 08:30', '8259', 'order_SAMPLE24072', 'L7', 'vip-lounge', 'addon', 'VIP Lounge', '1', '', '1999', '1999', ''],
    ['BLM-24073', 'online', 'Manav Shetty', '9800000704', 'not-an-email', '2026-11-04 10:00', '2026-11-04 10:00', '5899', 'order_SAMPLE24073', 'L8', 'fest-3day', 'pass', 'Festival Pass', '1', '', '4999', '4999', ''],
  ];
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), 'Bookings');
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' });
}

const settle = async (page: Page, ms = 800) => { await page.waitForLoadState('networkidle'); await page.waitForTimeout(ms); };
const clickFirstRow = async (page: Page) => { await page.locator('table tbody tr').first().locator('td').nth(1).click(); await settle(page, 1200); };

// Tick three bookings (mixed sent / not sent), open Email ▾ and pick an item. Opens the dialog only.
async function emailDialog(page: Page, item: string) {
  const boxes = page.locator('table tbody tr td:first-child input[type=checkbox]');
  for (const i of [3, 4, 5]) await boxes.nth(i).click({ force: true });
  await page.locator('.seg-bar button', { hasText: 'Email' }).click();
  await page.locator('.mat-mdc-menu-item', { hasText: item }).click();
  await settle(page, 1500);
  if (item === 'Send Custom Email') {   // a sample message, so the shot shows the editor in use
    await page.locator('#subject').fill('Gate timings for {event}');
    await page.locator('.rte-area').evaluate(a => {
      a.innerHTML = '<p>Hi {first_name},</p><p>Gates open at <b>2 pm on Friday</b>. Please bring a photo ID for everyone on booking #{order_id}.</p><ul><li>Carry a refillable water bottle</li><li>Parking opens at noon</li></ul><p>See you at {event}!</p>';
      a.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForTimeout(600);
  }
}

// Venue Map on the Street layer, with the tiles loaded.
async function streetMap(page: Page) {
  await page.locator('.vm-seg button', { hasText: 'Street' }).click();
  await settle(page, 2500);
}

// A Weather announcement to Volunteers in Operations, filled in but NOT sent.
async function announcementForm(page: Page) {
  await page.locator('.ann-type', { hasText: 'Weather' }).click();
  await page.locator('#ann-title').fill('Heavy rain expected at 4 pm');
  await page.locator('#ann-message').fill('Cover the sound desks and move equipment off the lawn before 4.');
  await page.locator('.ann-chips .ann-chip', { hasText: 'Volunteers' }).click();
  await page.locator('.ann-chips .ann-chip', { hasText: 'Operations' }).click();
  await page.waitForTimeout(600);
}

test('Product Guide screenshots', async ({ browser }: { browser: Browser }) => {
  mkdirSync(OUT, { recursive: true });
  const { eventId, tickets, workshops, checkinToken } = seedIds() as any;
  const ticketId = tickets['Vikram'];   // complete, not yet admitted: shows Admit + Link Band

  type Screen = [string, string, ((p: Page) => Promise<void>)?, string?];   // name, route, prepare, clipAbove
  const SCREENS: Screen[] = [
    ['dashboard', '/'],
    ['profile', '/profile', undefined, 'app-notification-settings'],
    ['my-department', '/my-department'],
    ['bookings', '/box-office/bookings'],
    ['booking-panel', '/box-office/bookings', clickFirstRow],
    // A sales-system booking: Booking ID, payment, linked Stay booking, Festival details missing, Early Check-In sent.
    ['booking-panel-sales', '/box-office/bookings', async p => {
      await p.locator('table tbody tr', { hasText: 'BLM-24031' }).first().locator('td').nth(1).click(); await settle(p, 1200);
    }],
    // ── Release 2026-11-24: pass type filter, Early Check-In, sales system, Music, Stay history ──
    ['bookings-pass-filter', '/box-office/bookings', async p => {
      await p.locator('.pass-type-filter .app-select-trigger').click(); await p.waitForTimeout(500);
      for (const t of ['Festival Pass', 'Two-Person Tent']) await p.locator('.ms-opt', { hasText: t }).first().click();
      await p.waitForTimeout(800);
    }],
    ['early-checkin-dialog', '/box-office/bookings', p => emailDialog(p, 'Send Early Check-In')],
    ['external-import', '/box-office/bookings', async p => {
      await p.locator('button.bk-add').click(); await p.waitForTimeout(400);
      await p.locator('.mat-mdc-menu-item', { hasText: 'Import from sales system' }).click(); await p.waitForTimeout(800);
      await p.locator('.xi input[type=file]').setInputFiles({
        name: 'sales-bookings.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer: salesImportSample(),
      });
      await settle(p, 2500);
    }],
    ['sales-sync-report', '/box-office/sales-sync-report', p => settle(p, 1500)],
    ['hospitality-stay-panel', '/hospitality/stay', async p => {
      await settle(p, 1200);
      await p.locator('.hy-nt-r[role=button]', { hasText: 'Sana Qureshi' }).first().click(); await settle(p, 1200);
    }],
    ['music-planner', '/music', p => settle(p, 1500)],
    ['music-setup', '/music/setup', p => settle(p, 1200)],
    ['registration', '/box-office/registration'],
    ['booking-found', '/box-office/registration/' + ticketId],
    ['accommodation-setup', '/accommodation/setup'],
    ['inventory', '/accommodation/inventory'],
    ['users', '/admin/user'],
    ['users-panel', '/admin/user', clickFirstRow],
    ['departments', '/admin/departments'],
    ['events', '/admin/events'],
    ['event-detail', '/admin/events/' + eventId, async p => {
      await p.locator('.btn-edit').click();   // the Ticket email fields only show in Edit mode
      await p.waitForTimeout(800);
      await p.locator('h1,h2,h3,h4,.section-lbl,legend', { hasText: /ticket email/i }).first().scrollIntoViewIfNeeded();
      await p.waitForTimeout(500);
    }],
    ['email-report', '/admin/email-report'],
    ['email-report-panel', '/admin/email-report', async p => { await p.locator('table tbody tr').first().click(); await settle(p, 1200); }],
    // Form filled in (never sent); the sample history from seed.js sits beside it on desktop.
    ['announcements', '/admin/announcements', p => announcementForm(p)],
    // Phone: the Sent announcements list (below the form there).
    ['announcements-history', '/admin/announcements', async p => {
      await p.locator('.ann-side').scrollIntoViewIfNeeded();
      await p.waitForTimeout(600);
    }],
    ['ticket-email-dialog', '/box-office/bookings', p => emailDialog(p, 'Send Ticket Email')],
    ['custom-email-dialog', '/box-office/bookings', p => emailDialog(p, 'Send Custom Email')],

    // ── Release 2026-11-03: Venue Map, wrist bands, Workshops, Departments panel ──
    // Booking Found for Asha Menon: her band badge opened, showing the current and the replaced band.
    ['booking-band', '/box-office/registration/' + tickets['Asha'], async p => {
      await p.locator('.band-badge').first().click(); await p.waitForTimeout(800);
    }],
    // The Street map (Satellite waits for the imagery decision), then a Workshop area with a session on now.
    ['venue-map', '/venue-map', p => streetMap(p)],
    ['venue-map-area', '/venue-map', async p => {
      await streetMap(p);
      await p.locator('.vm-item', { hasText: workshops.liveArea }).first().click();
      await settle(p, 2000);
    }],
    ['workshop-planner', '/workshops', p => settle(p, 1500)],
    // The session running now, opened from the Now strip.
    ['workshop-session', '/workshops', async p => {
      await p.locator('.wp-now-card').first().click(); await p.waitForTimeout(900);
    }],
    ['workshop-setup', '/workshops/setup'],
    ['workshop-lists', '/workshops/sessions/' + workshops.sessions['now']],
    // Door: search someone already let in — the "Already in" card; changes nothing.
    ['workshop-door', '/workshops/sessions/' + workshops.sessions['now'], async p => {
      await p.locator('.sl-tabs button', { hasText: 'Door' }).click();
      await p.locator('.sl-search input').fill(workshops.doorName);
      await p.locator('.sl-result', { hasText: workshops.doorName }).first().click();
      await settle(p, 1200);
    }],
    ['workshop-reports', '/workshops/reports'],
    ['workshop-reports-panel', '/workshops/reports', async p => {
      await p.locator('table tbody tr', { hasText: workshops.pastSessionTitle }).first().click();
      await settle(p, 1200);
    }],
    ['departments-panel', '/admin/departments', async p => {
      await p.locator('.dept-card').first().click(); await settle(p, 1000);
    }],

    // ── Dry-run guide (2026-11-06): Hospitality, SOS, staff list, Bulk Add ──
    ['hospitality-today', '/hospitality', p => settle(p, 1500)],
    ['hospitality-desk', '/hospitality/desk', p => settle(p, 1500)],
    ['hospitality-guests', '/hospitality/guests'],
    ['hospitality-report', '/hospitality/report', p => settle(p, 1500)],
    ['hospitality-stay', '/hospitality/stay', p => settle(p, 1500)],
    ['hospitality-setup', '/hospitality/setup'],
    ['sos', '/sos', p => settle(p, 4000)],   // longer: the map tiles come from the internet
    // Users with two Volunteers ticked: the selection bar (Add to / Remove from event, Delete).
    ['users-staff', '/admin/user', async p => {
      const boxes = p.locator('table tbody .pick-box');
      for (const i of [0, 1]) await boxes.nth(i).click({ force: true });
      await p.waitForTimeout(600);
    }],
    // Bulk Add with a small sample file loaded: Ready rows, a weak password (Problem)
    // and an email that already exists (Duplicate). Checked only — never added.
    ['bulk-add', '/admin/user', async p => {
      await p.locator('button', { hasText: 'Bulk Add' }).first().click(); await settle(p, 1000);
      await p.locator('mat-dialog-container input[type=file]').setInputFiles({
        name: 'new-volunteers.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer: bulkAddSample(),
      });
      await settle(p, 2000);
    }],
    ['public-page', '/admin/public-page', p => settle(p, 1500)],
  ];

  // SIZES=phone (or desktop) limits the run to one size.
  const sizes = Object.entries(SIZES).filter(([s]) => !process.env.SIZES || process.env.SIZES.split(',').includes(s));
  for (const [size, opts] of sizes) {
    const context = await browser.newContext({ ...opts, baseURL: 'http://localhost:4300', colorScheme: 'light' });
    const page = await context.newPage();

    if (!ONLY || ONLY.includes('signin')) {
      await page.goto('/login'); await settle(page); await shot(page, `signin-${size}`);
    }
    await login(page);

    for (const [name, route, after, clipAbove] of SCREENS) {
      if (ONLY && !ONLY.includes(name)) continue;
      try {
        await page.goto(route); await settle(page, 1200);
        if (after) await after(page);
        await shot(page, `${name}-${size}`, clipAbove);
      } catch (e) {
        console.log('SKIPPED', name, String(e).split('\n')[0]);   // one screen failing doesn't stop the run
        await page.keyboard.press('Escape').catch(() => {});
      }
    }
    await context.close();

    // Billboard, as the sample volunteer (USERS.volunteer), who received most of the sample announcements.
    const BILLBOARD: [string, (p: Page) => Promise<void>][] = [
      ['billboard', async () => { }],
      // The Task note opened as a large post-it. The volunteer has already read it (seed.js),
      // so opening it changes nothing — the other shots keep the same unread notes.
      ['billboard-note', async p => { await p.locator('.bb-board .bb-note.t-task').first().click(); await p.waitForTimeout(700); }],
    ];
    // Phone: the menu with the red unread count on the Billboard link.
    if (size === 'phone') BILLBOARD.push(['billboard-menu', async p => { await p.locator('.hamburger-btn').click(); await p.waitForTimeout(700); }]);
    // (Skipped when ONLY names none of them — without skipping the public page below.)
    if (!ONLY || BILLBOARD.some(([n]) => ONLY.includes(n))) {
      const vctx = await browser.newContext({ ...opts, baseURL: 'http://localhost:4300', colorScheme: 'light' });
      const vpage = await vctx.newPage();
      await login(vpage, USERS.volunteer);
      for (const [name, prepare] of BILLBOARD) {
        if (ONLY && !ONLY.includes(name)) continue;
        await vpage.goto('/billboard'); await settle(vpage, 1200);
        await prepare(vpage);
        await shot(vpage, `${name}-${size}`);
      }
      await vctx.close();
    }

    // The public participant page (no sign-in), served on 4301 when PUBLIC_SHOTS=1.
    if (process.env.PUBLIC_SHOTS) {
      const PUBLIC: [string, (p: Page) => Promise<void>][] = [
        ['public-home', async p => { await settle(p, 2000); }],
        ['public-map', async p => { await p.goto('/#map'); await settle(p, 3500); }],
        // The participant Early Check-In form, opened from the sample link (seed-sales.js); nothing is sent.
        // Reloaded: the page reads the link only when it loads.
        ['early-checkin-form', async p => { await p.goto('/#check-in/' + checkinToken); await p.reload(); await settle(p, 2500); }],
        ['public-emergency', async p => {
          await settle(p, 2000);
          await p.locator('button', { hasText: /emergency/i }).first().click(); await p.waitForTimeout(900);
        }],
      ];
      const pctx = await browser.newContext({ ...opts, baseURL: 'http://localhost:4301', colorScheme: 'light' });
      const ppage = await pctx.newPage();
      for (const [name, prepare] of PUBLIC) {
        if (ONLY && !ONLY.includes(name)) continue;
        try {
          await ppage.goto('/'); await prepare(ppage);
          await shot(ppage, `${name}-${size}`);
        } catch (e) { console.log('SKIPPED', name, String(e).split('\n')[0]); }
      }
      await pctx.close();
    }
  }
});
