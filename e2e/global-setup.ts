// Runs once per Playwright run, after the isolated servers are up: refills the
// isolated database (127.0.0.1:27018 only — seed.js refuses anything else).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { seed } = require('./seed.js');

export default async function globalSetup(): Promise<void> {
  const summary = await seed();
  console.log(`Seeded isolated e2e database: ${summary}`);
}
