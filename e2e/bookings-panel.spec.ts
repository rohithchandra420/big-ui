import { test, expect, Page } from '@playwright/test';
import { login } from './helpers';

const openBooking = async (page: Page, buyer: string) => {
  await page.locator('table tbody tr', { hasText: buyer }).first().locator('td').nth(1).click();
  await expect(page.locator('.panel.open')).toBeVisible();
  await expect(page.locator('.panel.open .panel-hd')).toContainText(buyer);
};

test.describe('Bookings side panel', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/box-office/bookings');
    await expect(page.locator('table tbody tr', { hasText: 'Vikram Singh' })).toBeVisible();
  });

  test('a not-yet-admitted pass shows Admit, Link Band and "Not admitted"', async ({ page }) => {
    await openBooking(page, 'Vikram Singh');
    const panel = page.locator('.panel.open');
    await expect(panel.getByRole('button', { name: 'Admit', exact: true })).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Link Band', exact: true })).toBeVisible();
    await expect(panel.getByText('Not admitted', { exact: true })).toBeVisible();
  });

  test('opening another booking after Allocate Tent shows that booking, not the old screen (v1.17.1 fix)', async ({ page }) => {
    await openBooking(page, 'Vikram Singh');
    await page.locator('.panel.open').getByRole('button', { name: 'Allocate Tent', exact: true }).click();
    await expect(page.locator('.panel.open app-allocate-tent')).toBeVisible();

    await page.locator('.panel.open .panel-close').click();
    await expect(page.locator('.panel.open')).toHaveCount(0);

    await openBooking(page, 'Karan Shah');
    const panel = page.locator('.panel.open');
    await expect(panel.locator('app-allocate-tent')).toHaveCount(0);
    await expect(panel.locator('app-attendee-list')).toContainText('Karan Shah');
    await expect(panel.locator('app-attendee-list')).not.toContainText('Vikram Singh');
  });
});
