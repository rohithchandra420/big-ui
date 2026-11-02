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

  test('a not-yet-admitted pass shows Admit and "Not admitted", and no band buttons', async ({ page }) => {
    await openBooking(page, 'Vikram Singh');
    const panel = page.locator('.panel.open');
    await expect(panel.getByRole('button', { name: 'Admit', exact: true })).toBeVisible();
    await expect(panel.getByText('Not admitted', { exact: true })).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Link Band', exact: true })).toHaveCount(0);
    await expect(panel.getByRole('button', { name: 'Replace Band', exact: true })).toHaveCount(0);
  });

  test('Admit opens the wrist band scanner for that person', async ({ page }) => {
    await openBooking(page, 'Vikram Singh');
    await page.locator('.panel.open').getByRole('button', { name: 'Admit', exact: true }).click();
    const dialog = page.locator('mat-dialog-container');
    await expect(dialog).toContainText('Admit: Scan Wrist Band');
    await expect(dialog).toContainText('Scan the wrist band for Vikram Singh');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.locator('.panel.open').getByText('Not admitted', { exact: true })).toBeVisible();
  });

  test('a pass admitted before bands existed offers Link Band', async ({ page }) => {
    await openBooking(page, 'Karan Shah');
    const panel = page.locator('.panel.open');
    await expect(panel.getByRole('button', { name: 'Link Band', exact: true })).toBeVisible();
    await expect(panel.locator('.band-badge')).toHaveCount(0);
  });

  test('a linked band shows its details and history, and Replace Band', async ({ page }) => {
    await openBooking(page, 'Asha Menon');
    const row = page.locator('.panel.open app-attendee-list');
    await expect(row.getByRole('button', { name: 'Replace Band', exact: true }).first()).toBeVisible();
    await row.locator('.band-badge').first().click();
    const details = row.locator('.band-history');
    await expect(details).toContainText('Current');
    await expect(details).toContainText('BIG7:W0999');
    await expect(details).toContainText('Band strap broke');
    await expect(details).toContainText('Nina Das');
  });

  test('opening another booking after Allocate Tent shows that booking, not the old screen (v1.17.1 fix)', async ({ page }) => {
    await openBooking(page, 'Vikram Singh');
    await page.locator('.panel.open').getByRole('button', { name: 'Allocate Tent', exact: true }).click();
    await expect(page.locator('.panel.open app-allocate-tent')).toBeVisible();

    await page.locator('.panel.open .panel-actions').getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page.locator('.panel.open')).toHaveCount(0);

    await openBooking(page, 'Karan Shah');
    const panel = page.locator('.panel.open');
    await expect(panel.locator('app-allocate-tent')).toHaveCount(0);
    await expect(panel.locator('app-attendee-list')).toContainText('Karan Shah');
    await expect(panel.locator('app-attendee-list')).not.toContainText('Vikram Singh');
  });
});
