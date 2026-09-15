import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBulk } from './helpers/bulk-loader.mjs';
import { disposableBulkDatabase } from './helpers/bulk-postgres.mjs';

test('origin and commercial filters select/count real fixtures in disposable PostgreSQL', { timeout: 180000 }, async t => {
  const db = await disposableBulkDatabase();
  const { prisma } = db;
  const { getPaginatedLeadsForPanel: list } = loadBulk('src/lib/workspace-data.ts', {
    '@/lib/prisma': { prisma }, '@/lib/auth/operator': { async requireAuthenticatedOperator() {} },
  });
  const statuses = ['new', 'reviewed', 'contacted', 'responded', 'interested', 'follow-up', 'closed', 'discarded', 'marked', 'ready'];
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  try {
    for (const origin of ['SEARCH', 'MANUAL']) for (const [index, commercialStatus] of statuses.entries()) {
      await prisma.lead.create({ data: {
        businessName: `${origin} clinic ${commercialStatus}`, origin, commercialStatus, score: index,
        website: index === 0 ? null : index === 1 ? '' : 'https://example.com',
        followUpNextAction: index === 1 ? 'Call' : null,
        followUpDueAt: index === 2 ? today : index === 3 ? yesterday : null,
      } });
    }
    for (const origin of ['all', 'search', 'manual', 'invalid', '', undefined]) await t.test(`real origin ${origin}`, async () => {
      const result = await list({ origin, pageSize: 100 });
      const expected = origin === 'manual' || origin === 'search' ? 10 : 20;
      assert.equal(result.pagination.totalLeads, expected); assert.equal(result.leads.length, expected);
      if (expected === 10) assert.ok(result.leads.every(l => l.origin === origin.toUpperCase()));
    });
    for (const origin of ['manual', 'search']) for (const filter of statuses) await t.test(`${origin} + ${filter}`, async () => {
      const result = await list({ origin, filter, q: 'CLINIC' });
      assert.equal(result.pagination.totalLeads, 1); assert.equal(result.leads.length, 1);
      assert.equal(result.leads[0].commercialStatus, filter); assert.equal(result.leads[0].origin, origin.toUpperCase());
    });
    for (const [filter, expected] of [['no-website', 2], ['with-follow-up', 3], ['without-follow-up', 7], ['follow-up-today', 1], ['follow-up-overdue', 1], ['follow-up', 1]]) await t.test(`special ${filter}`, async () => {
      const result = await list({ origin: 'manual', filter });
      assert.equal(result.pagination.totalLeads, expected); assert.equal(result.leads.length, expected);
      if (filter === 'follow-up') assert.equal(result.leads[0].followUpDueAt, null);
    });
    await t.test('real pagination and sorting keep origin', async () => {
      const first = await list({ origin: 'manual', pageSize: 3, sort: 'score-desc' });
      const second = await list({ origin: 'manual', pageSize: 3, page: 2, sort: 'score-desc' });
      assert.equal(second.pagination.totalLeads, 10);
      assert.deepEqual(first.leads.map(l => l.score), [9, 8, 7]);
      assert.deepEqual(second.leads.map(l => l.score), [6, 5, 4]);
      assert.ok(second.leads.every(l => l.origin === 'MANUAL'));
    });
    await t.test('actual search ingestion writes SEARCH using mocked scraper only', async () => {
      const search = loadBulk('src/services/search-jobs.ts', {
        '@/lib/prisma': { prisma },
        '@/scraper/google-maps': { async scrapeGoogleMapsMultipleLeads() { return [{ name: 'Ingestion fixture', phone: '+12025550199' }]; } },
      });
      const job = await search.runGoogleMapsSearchJob('fixture', 1);
      assert.equal(job.leads.length, 1); assert.equal(job.leads[0].origin, 'SEARCH');
      const result = await list({ origin: 'search', q: 'Ingestion fixture' });
      assert.equal(result.pagination.totalLeads, 1);
    });
  } finally { await db.cleanup(); }
});
