import { test, expect, Page } from '@playwright/test';
import { login } from './helpers';

// PWA Phase 2 — the parts testable in a browser without a real push service:
// the Announcements page and the My Profile settings. (`ng serve` runs no
// service worker, so this browser can't subscribe — delivery to a phone is
// checked by hand on UAT.)

const openAdminPage = async (page: Page, label: string) => {
  if ((page.viewportSize()?.width ?? 1440) < 769) await page.locator('.hamburger-btn').click();
  await page.locator('.nav-item', { hasText: label }).click();
};

test.describe('Announcements (DEV/DIR/ADMIN)', () => {
  test('a Director sends an announcement to chosen roles and sees it in the history', async ({ page }) => {
    await login(page);   // sample Director
    await page.goto('/');
    await openAdminPage(page, 'Announcements');
    await expect(page).toHaveURL(/\/admin\/announcements$/);

    const title = `Rain at 4 pm ${Date.now() % 10000}`;
    const send = page.getByRole('button', { name: 'Send announcement' });
    await expect(send).toBeDisabled();

    await page.locator('#ann-title').fill(title);
    await page.locator('#ann-message').fill('Move equipment under cover before 4.');
    await page.locator('.ann-type', { hasText: 'Weather' }).click();
    await page.locator('.ann-chips .ann-chip', { hasText: 'Volunteers' }).click();
    await page.locator('.ann-chips .ann-chip', { hasText: 'Operations' }).click();
    await expect(page.locator('.ann-audience')).toContainText('Volunteers in Operations');
    await expect(page.locator('.ann-phone-note')).toContainText(`Weather: ${title}`);
    await expect(page.locator('.ann-type.selected')).toContainText('Weather');
    await expect(page.locator('.ann-chip.on')).toHaveCount(2);

    await send.click();
    await page.getByRole('button', { name: 'Send', exact: true }).click();   // confirm dialog

    const item = page.locator('.ann-item', { hasText: title }).first();
    await expect(item).toBeVisible();
    await expect(item).toContainText('Weather');
    await expect(item).toContainText('To Volunteers in Operations');
    await expect(item).toContainText('by Maya Fernandes');
    await expect(item).toContainText('0 devices');   // nobody's phone is subscribed in the test run

    // Send again → a second, new entry on top, marked Resent
    await item.getByRole('button', { name: 'Send again' }).click();
    await page.getByRole('button', { name: 'Send again', exact: true }).last().click();   // confirm dialog
    const items = page.locator('.ann-item', { hasText: title });
    await expect(items).toHaveCount(2);
    await expect(items.first().locator('.ann-badge.resent')).toBeVisible();

    // Search + filters on the sent list (close the "Sent" popup first — at phone width it covers the panel)
    const popupClose = page.locator('.mat-mdc-snack-bar-container button');
    if (await popupClose.count()) await popupClose.first().click();
    await expect(page.locator('.mat-mdc-snack-bar-container')).toHaveCount(0);
    await page.locator('.ann-filters .search-field input').fill('no such announcement');
    await expect(page.locator('.ann-side')).toContainText('No announcements match these filters.');
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await page.locator('.ann-filters .search-field input').fill(title.slice(0, 12));
    await expect(items).toHaveCount(2);

    // Copy to form
    await items.first().getByRole('button', { name: 'Copy to form' }).click();
    await expect(page.locator('#ann-title')).toHaveValue(title);
    await expect(page.locator('.ann-audience')).toContainText('Volunteers in Operations');
  });

  test('a volunteer has no Announcements link and is turned away from the page', async ({ page }) => {
    await login(page, 'anjali@example.com');
    await page.goto('/');
    await expect(page.locator('.nav-item', { hasText: 'Announcements' })).toHaveCount(0);
    await page.goto('/admin/announcements');
    await expect(page).not.toHaveURL(/\/admin\/announcements$/);
  });
});

test.describe('My Profile → Notifications', () => {
  test('shows the card and saves a category switch', async ({ page }) => {
    await login(page);
    await page.goto('/profile');
    const card = page.locator('app-notification-settings');
    await expect(card).toContainText('Notifications');

    const announcements = card.locator('.ns-pref', { hasText: 'Announcements' }).locator('input');
    await expect(announcements).toBeChecked();   // on by default
    const saved = page.waitForResponse(r => r.url().includes('/push/preferences') && r.request().method() === 'PATCH');
    await announcements.uncheck();
    expect((await saved).ok()).toBeTruthy();

    await page.reload();
    await expect(page.locator('app-notification-settings .ns-pref', { hasText: 'Announcements' }).locator('input')).not.toBeChecked();
    // put it back for the other project's run
    await page.locator('app-notification-settings .ns-pref', { hasText: 'Announcements' }).locator('input').check();
  });
});
