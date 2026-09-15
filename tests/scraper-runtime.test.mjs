import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBulk } from './helpers/bulk-loader.mjs';
import { fakeScraperBrowser } from './helpers/scraper-browser.mjs';
const original = { ...process.env };
test.beforeEach(() => { delete process.env.LEADFINDER_CHROMIUM_EXECUTABLE_PATH; delete process.env.LEADFINDER_SCRAPER_TIMEOUT_MS; process.env.NODE_ENV = 'development'; });
test.afterEach(() => { for (const key of Object.keys(process.env)) if (!(key in original)) delete process.env[key]; Object.assign(process.env, original); });
const config = loadBulk('src/lib/scraper/runtime-config.ts');
const scraper = fake => loadBulk('src/scraper/google-maps.ts', { playwright: fake.playwright });

test('runtime defaults: dev visible; production always headless even with false override', () => {
  assert.equal(config.scraperRuntimeConfig().headless, false);
  assert.equal(config.scraperRuntimeConfig({ headless: true }).headless, true);
  process.env.NODE_ENV = 'production'; assert.equal(config.scraperRuntimeConfig({ headless: false }).headless, true);
  assert.equal(config.scraperRuntimeConfig().timeoutMs, 90000);
  assert.equal(config.scraperRuntimeConfig().selectorTimeoutMs, 20000);
  assert.equal(config.scraperRuntimeConfig().executablePath, undefined);
});
test('timeout config bounded; executable override requires absolute path', () => {
  for (const value of ['0', '-1', '90001', 'no', '', '1.2']) { process.env.LEADFINDER_SCRAPER_TIMEOUT_MS = value; assert.throws(() => config.scraperRuntimeConfig()); }
  process.env.LEADFINDER_SCRAPER_TIMEOUT_MS = '1000'; assert.equal(config.scraperRuntimeConfig().timeoutMs, 1000);
  process.env.LEADFINDER_CHROMIUM_EXECUTABLE_PATH = 'relative/chromium'; assert.throws(() => config.scraperRuntimeConfig());
  process.env.LEADFINDER_CHROMIUM_EXECUTABLE_PATH = process.execPath; assert.equal(config.scraperRuntimeConfig().executablePath, process.execPath);
});
for (const max of [1, 3, 10, 20]) test(`maxResults=${max} admitted and resources closed`, async () => {
  const fake = fakeScraperBrowser(); const result = await scraper(fake).scrapeGoogleMapsMultipleLeads('QA', max);
  assert.equal(result.length, max); assert.equal(fake.state.pageClosed, true); assert.equal(fake.state.browserClosed, true);
});
for (const max of [21, 0, -1, NaN, 1.5, Infinity]) test(`maxResults=${max} rejected before browser launch`, async () => {
  const fake = fakeScraperBrowser(); await assert.rejects(scraper(fake).scrapeGoogleMapsMultipleLeads('QA', max), /entre 1 y 20/);
  assert.equal(fake.state.launches.length, 0);
});
test('blocked selector cancelled by global budget in production', async () => {
  process.env.NODE_ENV = 'production'; process.env.LEADFINDER_SCRAPER_TIMEOUT_MS = '1000';
  const fake = fakeScraperBrowser({ blockSearch: true }), start = performance.now();
  await assert.rejects(scraper(fake).scrapeGoogleMapsMultipleLeads('QA', 3, { headless: false }), /presupuesto total/);
  assert.ok(performance.now() - start < 4000); assert.equal(fake.state.launches[0].headless, true);
  assert.equal(fake.state.pageClosed, true); assert.equal(fake.state.browserClosed, true);
});
test('missing browser produces actionable error', async () => {
  const fake = fakeScraperBrowser({ missingBrowser: true });
  await assert.rejects(scraper(fake).scrapeGoogleMapsMultipleLeads('QA', 3), /No se pudo iniciar Chromium/);
});
test('results lost after selector wait are an error, not silent empty success', async () => {
  const fake = fakeScraperBrowser({ results: 0 }); await assert.rejects(scraper(fake).scrapeGoogleMapsMultipleLeads('QA', 3), /candidatos verificables/);
  assert.equal(fake.state.browserClosed, true);
});
test('Search Server Action rejects excessive values before creating a job', async () => {
  let jobs = 0;
  const actions = loadBulk('src/app/actions.ts', {
    '@/lib/auth/operator': { requireAuthenticatedOperator: async () => {} }, 'next/cache': { revalidatePath() {} },
    '@/lib/prisma': {}, '@/lib/leads/manual-lead-persistence': {}, '@/lib/leads/manual-lead': {}, '@/lib/leads/lead-ui': {}, '@/lib/automation/schedule-runner': {},
    '@/services/search-jobs': { runGoogleMapsSearchJob: async () => { jobs++; return { id: 'qa' }; } },
  });
  for (const max of ['21', '0', '-1', 'NaN']) {
    const form = new FormData(); form.set('query', 'QA'); form.set('maxResults', max);
    const result = await actions.runGoogleMapsSearchAction({}, form); assert.equal(result.ok, false);
  }
  assert.equal(jobs, 0);
});
