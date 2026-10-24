import { test, expect, Page } from '@playwright/test';

// The browser can only reach localhost (host-resolver rule in playwright.pwa.config.ts),
// so the production build's API address never connects anywhere.

/**
 * Waits until the service worker is installed, controls this page, AND has
 * finished storing the app (index.html) in its cache — going offline before
 * that last step would test a half-downloaded app.
 */
async function swControlled(page: Page) {
  await page.waitForFunction(() => navigator.serviceWorker?.ready.then(r => !!r.active), null, { timeout: 60_000 });
  if (!(await page.evaluate(() => !!navigator.serviceWorker.controller))) {
    await page.reload();
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 30_000 });
  }
  await page.waitForFunction(async () => !!(await caches.match('/index.html')), null, { timeout: 30_000, polling: 250 });
  // One online load served through the worker, as on a real second visit.
  await page.reload();
  await page.waitForLoadState('networkidle');
}

test.describe('Installable app (PWA Phase 1)', () => {
  test('cannot reach anything but localhost (safety check)', async ({ page }) => {
    const reached = await page.evaluate(() =>
      fetch('https://api.rchomeproject.in/', { mode: 'no-cors' }).then(() => true, () => false));
    expect(reached).toBe(false);
  });

  test('has a valid manifest with the BiG name, colours and icons', async ({ page, request }) => {
    await page.goto('/login');
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', 'manifest.webmanifest');
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#1E4638');
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', /apple-touch-icon\.png$/);

    const manifest = await (await request.get('/manifest.webmanifest')).json();
    expect(manifest.short_name).toBe('BiG');
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe('/');
    const sizes = manifest.icons.map((i: any) => `${i.sizes}/${i.purpose}`);
    expect(sizes).toEqual(expect.arrayContaining(['192x192/any', '512x512/any', '512x512/maskable']));
    for (const icon of [...manifest.icons, { src: 'assets/icons/apple-touch-icon.png' }]) {
      const res = await request.get('/' + icon.src);
      expect(res.status(), icon.src).toBe(200);
      expect(res.headers()['content-type']).toBe('image/png');
    }
  });

  test('registers the service worker, and it caches no API data', async ({ page, request }) => {
    await page.goto('/login');
    await swControlled(page);
    const ngsw = await (await request.get('/ngsw.json')).json();
    expect(ngsw.dataGroups ?? []).toEqual([]);
    expect(JSON.stringify(ngsw)).not.toMatch(/rchomeproject|onrender/);
  });

  test('opens with no connection and shows the Offline notice', async ({ page, context }) => {
    await page.goto('/login');
    await swControlled(page);

    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('.btn-login')).toBeVisible();          // the app itself loaded from the cache
    await expect(page.locator('.pwa-offline')).toBeVisible();
    await expect(page.locator('.pwa-offline')).toContainText('Offline');

    await context.setOffline(false);
    await expect(page.locator('.pwa-offline')).toHaveCount(0);       // and goes away when the signal returns
  });

  test('a deep link also opens offline (routes fall back to the cached app)', async ({ page, context }) => {
    await page.goto('/login');
    await swControlled(page);
    await context.setOffline(true);
    await page.goto('/box-office/bookings');
    await expect(page.locator('app-root')).not.toBeEmpty();
  });
});
