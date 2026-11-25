import { test, expect, Page } from '@playwright/test';
import { login } from './helpers';

// B-087: Serving Desk and Setup keep the desktop ratio on a tablet —
// the side column stays about a quarter to a third, not half.
// B-088: on the Serving Desk the names in the Expected list stay readable.
const SHOTS = process.env.LAYOUT_SHOTS_DIR || '';

const pages = [
  { name: 'desk', url: '/hospitality/desk', grid: '.hd-grid', side: '.hd-grid > .hd-log' },
  { name: 'setup', url: '/hospitality/setup', grid: '.hs-grid', side: '.hs-grid > .hs-col >> nth=1' },
];

const widths = [
  { w: 1440, h: 900, max: 0.30 },
  { w: 1024, h: 768, max: 0.33 },
  { w: 960, h: 1440, max: 0.36 }, // tablet portrait (Surface Pro)
  { w: 901, h: 1100, max: 0.38 },
];

const share = async (page: Page, grid: string, side: string) => {
  const g = await page.locator(grid).boundingBox();
  const s = await page.locator(side).boundingBox();
  return { grid: g!.width, side: s!.width, ratio: s!.width / g!.width };
};

test.describe('Hospitality desk + setup layout (B-087)', () => {
  test.skip(({ isMobile }) => !!isMobile, 'desktop / tablet widths only');

  for (const p of pages) {
    test(`${p.name}: side column keeps the desktop ratio on a tablet`, async ({ page }) => {
      await login(page);
      for (const v of widths) {
        await page.setViewportSize({ width: v.w, height: v.h });
        await page.goto(p.url);
        await expect(page.locator(p.side)).toBeVisible();
        const r = await share(page, p.grid, p.side);
        console.log(`${p.name} @${v.w}: grid ${Math.round(r.grid)} side ${Math.round(r.side)} (${Math.round(r.ratio * 100)}%)`);
        expect(r.side).toBeGreaterThanOrEqual(239);
        expect(r.side).toBeLessThanOrEqual(341);
        expect(r.ratio).toBeLessThanOrEqual(v.max);
        if (p.name === 'desk') {
          // B-088: no name in the Expected list is cut off
          const names = page.locator('.hx-er:not(.hx-eh) .hx-en b');
          await expect(names.first()).toBeVisible();
          const cut = await names.evaluateAll(els => els
            .filter(e => (e as HTMLElement).scrollWidth > (e as HTMLElement).clientWidth + 1)
            .map(e => e.textContent));
          expect(cut).toEqual([]);
        }
        if (SHOTS) await page.screenshot({ path: `${SHOTS}/${p.name}-${v.w}.png` });
      }
    });
  }
});

// B-089: on a phone the Serving Desk list shows why each person is expected,
// in full, on its own line.
test.describe('Serving Desk Expected list on a phone (B-089)', () => {
  test.skip(({ isMobile }) => !isMobile, 'phone only');

  test('every row shows its full name and why', async ({ page }) => {
    await login(page);
    await page.goto('/hospitality/desk');
    const rows = page.locator('.hx-er:not(.hx-eh)');
    await expect(rows.first()).toBeVisible();
    const why = rows.first().locator('.hx-ew');
    await expect(why).toBeVisible();
    await expect(why).not.toHaveText('');
    const cut = await page.locator('.hx-er:not(.hx-eh) .hx-en b, .hx-er:not(.hx-eh) .hx-ew').evaluateAll(els => els
      .filter(e => (e as HTMLElement).scrollWidth > (e as HTMLElement).clientWidth + 1)
      .map(e => e.textContent));
    expect(cut).toEqual([]);
    await rows.first().scrollIntoViewIfNeeded();
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/desk-phone.png` });
  });
});
