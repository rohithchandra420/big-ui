import { test, expect } from '@playwright/test';
import { login } from './helpers';

// B-086: the Back button closes an open panel instead of leaving the page.
test.describe('Back closes an open panel', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/'); // the Dashboard: a page to go back to
    await expect(page).toHaveURL(/:4300\/$/);
  });

  test('Bookings drawer: Back closes it, the next Back leaves the page', async ({ page }) => {
    await page.goto('/box-office/bookings');
    const row = page.locator('table tbody tr', { hasText: 'Vikram Singh' }).first();
    await expect(row).toBeVisible();
    await row.locator('td').nth(1).click();
    await expect(page.locator('.panel.open')).toBeVisible();

    await page.goBack();
    await expect(page.locator('.panel.open')).toHaveCount(0);
    await expect(page).toHaveURL(/\/box-office\/bookings/);

    // Closed with ✕ / Close: Back still goes to the previous page.
    await row.locator('td').nth(1).click();
    await expect(page.locator('.panel.open')).toBeVisible();
    await page.locator('.panel.open .panel-actions').getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page.locator('.panel.open')).toHaveCount(0);
    await page.waitForTimeout(300);
    await page.goBack();
    await expect(page).not.toHaveURL(/\/box-office\/bookings/);
  });

  test('Shared slide panel (Hospitality › Stay person): Back closes it, the page stays', async ({ page }) => {
    await page.goto('/hospitality/stay');
    const row = page.locator('[aria-label^="Kavya Menon"]').first();
    await expect(row).toBeVisible();
    await row.click();
    await expect(page.locator('.sp-panel')).toBeVisible();

    await page.goBack();
    await expect(page.locator('.sp-panel')).toHaveCount(0);
    await expect(page).toHaveURL(/\/hospitality\/stay/);

    // ✕ then Back: leaves the page as before.
    await row.click();
    await expect(page.locator('.sp-panel')).toBeVisible();
    await page.locator('.sp-x').click();
    await expect(page.locator('.sp-panel')).toHaveCount(0);
    await page.waitForTimeout(300);
    await page.goBack();
    await expect(page).not.toHaveURL(/\/hospitality\/stay/);
  });
});
