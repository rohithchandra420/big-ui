import { test, Browser, Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'fs';
import * as path from 'path';
import { login, seedIds } from './helpers';

/**
 * Product Guide screenshots (npm run e2e:screens). Captures each screen at
 * desktop and phone size as .webp into SCREENS_OUT (default
 * e2e/screenshots-out); Alfredoc copies them into the guide's img/ folder.
 * ONLY="bookings,booking-found" limits the run to some screens.
 * Dialogs are opened, never sent — and the isolated API can't send mail anyway.
 */
const OUT = process.env.SCREENS_OUT || path.join(__dirname, 'screenshots-out');
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const SIZES = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};

async function shot(page: Page, name: string) {
  const cdp = await page.context().newCDPSession(page);
  const r = await cdp.send('Page.captureScreenshot', { format: 'webp', quality: 82 });
  writeFileSync(path.join(OUT, `${name}.webp`), Buffer.from(r.data, 'base64'));
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

test('Product Guide screenshots', async ({ browser }: { browser: Browser }) => {
  mkdirSync(OUT, { recursive: true });
  const { eventId, tickets } = seedIds();
  const ticketId = tickets['Vikram'];   // complete, not yet admitted: shows Admit + Link Band

  type Screen = [string, string, ((p: Page) => Promise<void>)?];
  const SCREENS: Screen[] = [
    ['dashboard', '/'],
    ['profile', '/profile'],
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

    for (const [name, route, after] of SCREENS) {
      if (ONLY && !ONLY.includes(name)) continue;
      await page.goto(route); await settle(page, 1200);
      if (after) await after(page);
      await shot(page, `${name}-${size}`);
    }
    await context.close();
  }
});
