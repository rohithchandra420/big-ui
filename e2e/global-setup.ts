import { readdirSync, rmSync } from 'fs';
import * as path from 'path';

// Runs once per Playwright run, after the isolated servers are up: refills the
// isolated database (127.0.0.1:27018 only — seed.js refuses anything else),
// and forgets sessions saved by the previous run (their users no longer exist).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { seed } = require('./seed.js');

export default async function globalSetup(): Promise<void> {
  const dataDir = path.join(__dirname, '.data');
  for (const f of readdirSync(dataDir)) {
    if (/^session-.*\.json$/.test(f)) rmSync(path.join(dataDir, f));
  }
  const summary = await seed();
  console.log(`Seeded isolated e2e database: ${summary}`);
}
