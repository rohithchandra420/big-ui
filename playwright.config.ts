import { defineConfig } from '@playwright/test';
import { randomBytes } from 'crypto';
import { mkdirSync } from 'fs';
import * as path from 'path';

/**
 * End-to-end tests and Product Guide screenshots, against a fully ISOLATED copy
 * of the app: its own throwaway MongoDB (27018), big-api (3100) and big-ui
 * (4300), so the everyday dev servers (27017 / 3000 / 4200), the local
 * big-dev-local data and UAT are never touched. Everything is started here and
 * stopped when the run ends; e2e/seed.js refills the database with invented
 * sample data before every run (see global-setup.ts).
 *
 *   npm run e2e           → the tests, desktop + phone
 *   npm run e2e:screens   → guide screenshots into e2e/screenshots-out
 *
 * Uses the installed Google Chrome (channel: 'chrome') — no Playwright browser
 * download needed. MONGOD_PATH overrides where mongod.exe lives.
 */
const MONGOD = process.env.MONGOD_PATH || 'G:/RC/mongodb/bin/mongod.exe';
const DB_DIR = path.join(__dirname, 'e2e', '.data', 'db');
const API_DIR = path.resolve(__dirname, '../big-api');
mkdirSync(DB_DIR, { recursive: true });

export default defineConfig({
  testDir: './e2e',
  // e2e/pwa runs separately against the production build (npm run e2e:pwa).
  globalSetup: './e2e/global-setup.ts',
  // One shared database and dev server — run tests one at a time.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e/report' }]],
  outputDir: 'e2e/test-results',
  use: {
    baseURL: 'http://localhost:4300',
    channel: 'chrome',
    colorScheme: 'light',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', testIgnore: [/screens\.spec\.ts/, /[\\/]pwa[\\/]/], use: { viewport: { width: 1440, height: 900 } } },
    { name: 'phone', testIgnore: [/screens\.spec\.ts/, /[\\/]pwa[\\/]/], use: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } },
    { name: 'screens', testMatch: /screens\.spec\.ts/, timeout: 10 * 60_000 },
  ],
  webServer: [
    {
      command: `"${MONGOD}" --dbpath "${DB_DIR}" --port 27018 --bind_ip 127.0.0.1`,
      port: 27018,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: 'node src/index.js',
      cwd: API_DIR,
      port: 3100,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        PORT: '3100',
        MONGODB_URL: 'mongodb://127.0.0.1:27018/big_e2e',
        JWT_SECRET: randomBytes(32).toString('hex'),
        QR_SIGNING_KEY: randomBytes(32).toString('hex'),
        CORS_ORIGINS: 'http://localhost:4300',
        // Show what staff see in production, but make sending impossible:
        // no mail password, and a mail server address nothing listens on.
        EMAIL_SAFE_MODE: 'false',
        EMAIL_SMTP_HOST: '127.0.0.1',
        EMAIL_SMTP_PORT: '1',
        BREVO_PASS: '',
      },
    },
    {
      command: 'npx ng serve --port 4300 --proxy-config e2e/proxy.e2e.json',
      port: 4300,
      reuseExistingServer: false,
      timeout: 240_000,
    },
  ],
});
