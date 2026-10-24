import { defineConfig } from '@playwright/test';

/**
 * PWA checks against the real PRODUCTION build (`npm run e2e:pwa`): the service
 * worker only runs there, not under ng serve. Builds into e2e/.data/dist and
 * serves it on localhost:4400 with a tiny no-package Node server.
 *
 * The production build talks to the UAT API — Chrome is started with a rule
 * that makes every host except localhost unresolvable, so UAT (or anything
 * else) can never be contacted. (Playwright's own request routing isn't used:
 * it bypasses the service worker, which is exactly what these tests check.)
 * These tests only cover the app shell: install files, service worker, offline start.
 */
export default defineConfig({
  testDir: './e2e/pwa',
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e/report-pwa' }]],
  outputDir: 'e2e/test-results-pwa',
  timeout: 90_000,
  use: {
    baseURL: 'http://localhost:4400',
    channel: 'chrome',
    colorScheme: 'light',
    serviceWorkers: 'allow',
    launchOptions: { args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1'] },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
    { name: 'phone', use: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } },
  ],
  webServer: {
    command: 'npx ng build --configuration=production --output-path e2e/.data/dist && node e2e/pwa/serve-dist.js',
    port: 4400,
    reuseExistingServer: false,
    timeout: 300_000,
  },
});
