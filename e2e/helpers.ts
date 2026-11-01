import { Page, expect } from '@playwright/test';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import * as path from 'path';

/** Sample accounts from e2e/seed.js — all invented, isolated database only. */
export const USERS = {
  director: 'maya.director@example.com',
  boxOfficeTL: 'nina.boxoffice@example.com',
};
export const PASSWORD = 'Demo@12345';

const DATA_DIR = path.join(__dirname, '.data');

/** Ids written by e2e/seed.js for this run (active event, bookings by buyer first name). */
export function seedIds(): { eventId: string; tickets: Record<string, string> } {
  return JSON.parse(readFileSync(path.join(DATA_DIR, 'ids.json'), 'utf8'));
}

const sessionFile = (email: string) => path.join(DATA_DIR, `session-${email.replace(/[^a-z0-9]/gi, '_')}.json`);

/**
 * Signs in as `email`. The sample data has a draft and an archived event too, so
 * the active event "BiG 7.0" is pre-selected (as staff would pick it).
 *
 * The API allows only 10 sign-ins per 15 minutes (brute-force protection), so a
 * session is reused: the first sign-in per account goes through the real login
 * form and is saved; later calls restore it and open the home page. Pass
 * `fresh: true` to always use the form — and to keep the session out of the
 * cache (a test that signs out would otherwise invalidate it for the rest).
 * global-setup.ts clears saved sessions before every run.
 */
export async function login(page: Page, email = USERS.director, opts: { fresh?: boolean } = {}): Promise<void> {
  const { eventId } = seedIds();
  await page.addInitScript(id => localStorage.setItem('activeEventId', id), eventId);
  const file = sessionFile(email);

  if (!opts.fresh && existsSync(file)) {
    const saved = JSON.parse(readFileSync(file, 'utf8'));
    await page.context().addCookies(saved.cookies);
    await page.addInitScript((entries: [string, string][]) => {
      for (const [k, v] of entries) localStorage.setItem(k, v);
    }, saved.storage);
    await page.goto('/');
    await expect(page).not.toHaveURL(/\/login$/);
    return;
  }

  await page.goto('/login');
  await page.locator('input[name="username"]').fill(email);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.locator('.btn-login').click();
  await expect(page).not.toHaveURL(/\/login$/);

  if (!opts.fresh) {
    const cookies = await page.context().cookies();
    const storage = await page.evaluate(() =>
      ['IsLoggedIn', 'userData'].filter(k => localStorage.getItem(k) !== null).map(k => [k, localStorage.getItem(k)!]));
    writeFileSync(file, JSON.stringify({ cookies, storage }));
  }
}
