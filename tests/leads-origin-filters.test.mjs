import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBulk } from './helpers/bulk-loader.mjs';

const query = loadBulk('src/lib/leads/list-query.ts');
const ui = loadBulk('src/lib/leads/lead-ui.ts');
export const statuses = ['new', 'reviewed', 'contacted', 'responded', 'interested', 'follow-up', 'closed', 'discarded', 'marked', 'ready'];

function harness() {
  const calls = [];
  const workspace = loadBulk('src/lib/workspace-data.ts', {
    '@/lib/auth/operator': { async requireAuthenticatedOperator() {} },
    '@/lib/prisma': { prisma: { lead: {
      async count(args) { calls.push(args); return 50; },
      async findMany(args) { calls.push(args); return []; },
    } } },
  });
  return { list: workspace.getPaginatedLeadsForPanel, calls };
}

for (const [origin, expected] of [['all', null], ['search', 'SEARCH'], ['manual', 'MANUAL'], ['invalid', null], ['', null], [undefined, null]]) {
  test(`origin ${String(origin)} sanitizes and uses identical count/list where`, async () => {
    const h = harness();
    const result = await h.list({ origin });
    assert.equal(result.queryState.origin, expected ? origin : 'all');
    assert.deepEqual(h.calls[0].where, expected ? { AND: [{ origin: expected }] } : {});
    assert.strictEqual(h.calls[0].where, h.calls[1].where);
  });
}

for (const status of statuses) test(`origin + ${status} is exact commercial equality`, async () => {
  const h = harness();
  await h.list({ origin: 'manual', filter: status });
  assert.deepEqual(h.calls[0].where, { AND: [{ commercialStatus: status }, { origin: 'MANUAL' }] });
  assert.equal(query.sanitizeLeadFilter(status), status);
  assert.notEqual(ui.getFilterLabel(status), status);
});

test('q and sort/page/pageSize retain existing query semantics with origin', async () => {
  for (const { value: sort } of query.leadSortOptions) {
    const h = harness(), baseline = harness();
    await h.list({ q: '  dentist  ', origin: 'search', sort, page: 2, pageSize: 20 });
    await baseline.list({ q: 'dentist', sort, page: 2, pageSize: 20 });
    assert.deepEqual(h.calls[1].orderBy, baseline.calls[1].orderBy);
    assert.equal(h.calls[1].skip, 20);
    assert.equal(h.calls[1].take, 20);
    assert.deepEqual(h.calls[0].where.AND.slice(0, -1), baseline.calls[0].where.AND);
    assert.deepEqual(h.calls[0].where.AND.at(-1), { origin: 'SEARCH' });
  }
});

test('follow-up status and follow-up fields are distinct; unknown filter is all', async () => {
  const status = harness(), fields = harness(), invalid = harness();
  await status.list({ filter: 'follow-up' });
  await fields.list({ filter: 'with-follow-up' });
  await invalid.list({ filter: 'not-a-status' });
  assert.deepEqual(status.calls[0].where, { AND: [{ commercialStatus: 'follow-up' }] });
  assert.ok(fields.calls[0].where.AND[0].OR);
  assert.deepEqual(invalid.calls[0].where, {});
});

test('all previous filter options remain available and implemented', async () => {
  assert.deepEqual(query.leadFilterOptions.map(o => o.value), ['all', 'no-website', 'marked', 'ready', 'with-follow-up', 'without-follow-up', 'follow-up-today', 'follow-up-overdue']);
  for (const { value: filter } of query.leadFilterOptions.slice(1)) {
    const h = harness(); await h.list({ filter });
    assert.notDeepEqual(h.calls[0].where, {});
  }
});

test('Leads links preserve all context and explicit origin; Operations URLs stay unchanged', () => {
  const base = { pathname: '/leads', q: 'clinic', filter: 'new', sort: 'name-asc', page: 2, pageSize: 50 };
  for (const origin of ['all', 'search', 'manual', undefined]) {
    const params = new URL(query.buildLeadListHref({ ...base, origin }), 'http://test').searchParams;
    assert.deepEqual(Object.fromEntries(params), { q: 'clinic', filter: 'new', sort: 'name-asc', origin: origin ?? 'all', page: '2', pageSize: '50' });
  }
  assert.equal(query.buildLeadListHref({ ...base, pathname: '/operations', filter: 'marked', extraParams: { run: 'abc' } }), '/operations?q=clinic&filter=marked&sort=name-asc&page=2&pageSize=50&run=abc');
  assert.equal(ui.getLeadOriginLabel('SEARCH'), 'Búsqueda');
  assert.equal(ui.getLeadOriginLabel('MANUAL'), 'Manual');
});
