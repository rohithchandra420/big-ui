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
  const { eventId, tickets } = seedIds();
  const ticketId = tickets['Vikram'];   // complete, not yet admitted: shows Admit + Link Band

  type Screen = [string, string, ((p: Page) => Promise<void>)?, string?];   // name, route, prepare, clipAbove
  const SCREENS: Screen[] = [
    ['dashboard', '/'],
    ['profile', '/profile', undefined, 'app-notification-settings'],
    ['my-department', '/my-department'],
    ['bookings', '/box-office/bookings'],
    ['booking-panel', '/box-office/bookings', clickFirstRow],
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
  ];

  for (const [size, opts] of Object.entries(SIZES)) {
    const context = await browser.newContext({ ...opts, baseURL: 'http://localhost:4300', colorScheme: 'light' });
    const page = await context.newPage();

    if (!ONLY || ONLY.includes('signin')) {
      await page.goto('/login'); await settle(page); await shot(page, `signin-${size}`);
    }
    await login(page);

    for (const [name, route, after, clipAbove] of SCREENS) {
      if (ONLY && !ONLY.includes(name)) continue;
      await page.goto(route); await settle(page, 1200);
      if (after) await after(page);
      await shot(page, `${name}-${size}`, clipAbove);
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
    if (ONLY && !BILLBOARD.some(([n]) => ONLY.includes(n))) continue;
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
});
