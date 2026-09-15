import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBulk } from './helpers/bulk-loader.mjs';
import { disposableBulkDatabase } from './helpers/bulk-postgres.mjs';
import { fakeScraperBrowser } from './helpers/scraper-browser.mjs';

test('scraper timeout marks SearchJob failed without inserting partial candidates', { timeout: 180000 }, async () => {
  const db = await disposableBulkDatabase();
  const old = { mode: process.env.NODE_ENV, budget: process.env.LEADFINDER_SCRAPER_TIMEOUT_MS, executable: process.env.LEADFINDER_CHROMIUM_EXECUTABLE_PATH };
  process.env.NODE_ENV = 'production'; process.env.LEADFINDER_SCRAPER_TIMEOUT_MS = '1000'; delete process.env.LEADFINDER_CHROMIUM_EXECUTABLE_PATH;
  try {
    const existing = await db.prisma.lead.create({ data: { businessName: 'Untouched', origin: 'MANUAL' } });
    const fake = fakeScraperBrowser({ blockDetail: 2 });
    const service = loadBulk('src/services/search-jobs.ts', { '@/lib/prisma': { prisma: db.prisma }, playwright: fake.playwright });
    await assert.rejects(service.runGoogleMapsSearchJob('QA timeout', 3), /presupuesto total/);
    assert.equal(fake.state.extracted, 1); assert.equal(fake.state.browserClosed, true); assert.equal(fake.state.pageClosed, true);
    const jobs = await db.prisma.searchJob.findMany(); assert.equal(jobs.length, 1); assert.equal(jobs[0].status, 'failed');
    assert.equal(jobs[0].foundCount, null); assert.equal(jobs[0].createdCount, null); assert.ok(jobs[0].finishedAt);
    assert.deepEqual(await db.prisma.lead.findMany(), [existing]);
  } finally {
    for (const [key, value] of [['NODE_ENV', old.mode], ['LEADFINDER_SCRAPER_TIMEOUT_MS', old.budget], ['LEADFINDER_CHROMIUM_EXECUTABLE_PATH', old.executable]]) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    await db.cleanup();
  }
});
