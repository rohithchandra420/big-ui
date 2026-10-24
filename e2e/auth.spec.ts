import { test, expect } from '@playwright/test';
import { login } from './helpers';

test.describe('Sign in', () => {
  test('a staff member can sign in and lands on the home page', async ({ page }) => {
    await login(page);
    await expect(page).toHaveURL(/\/$/);
  });

  test('a signed-in user who opens /login is sent to the home page (v1.17.2 fix)', async ({ page }) => {
    await login(page);
    // A full page load, like typing the address — the app restores the session first.
    await page.goto('/login');
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('.btn-login')).toHaveCount(0);
  });

  test('signing out goes to the login page', async ({ page }) => {
    await login(page);
    await page.goto('/profile');
    const logout = page.locator('.logout-btn');
    if (!(await logout.isVisible())) {
      // Phone width: the sidebar is closed behind the menu button.
      await page.locator('.hamburger-btn').click();
    }
    await logout.click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.locator('.btn-login')).toBeVisible();
  });
});
