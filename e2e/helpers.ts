import { Page, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import * as path from 'path';

/** Sample accounts from e2e/seed.js — all invented, isolated database only. */
export const USERS = {
  director: 'maya.director@example.com',
  boxOfficeTL: 'nina.boxoffice@example.com',
};
export const PASSWORD = 'Demo@12345';

/** Ids written by e2e/seed.js for this run (active event, bookings by buyer first name). */
export function seedIds(): { eventId: string; tickets: Record<string, string> } {
  return JSON.parse(readFileSync(path.join(__dirname, '.data', 'ids.json'), 'utf8'));
}

/**
 * Signs in through the real login form and waits until the app has left /login.
 * The sample data has a draft and an archived event too, so the active event
 * "BiG 7.0" is pre-selected (as staff would pick it in the sidebar).
 */
export async function login(page: Page, email = USERS.director): Promise<void> {
  const { eventId } = seedIds();
  await page.addInitScript(id => localStorage.setItem('activeEventId', id), eventId);
  await page.goto('/login');
  await page.locator('input[name="username"]').fill(email);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.locator('.btn-login').click();
  await expect(page).not.toHaveURL(/\/login$/);
}
