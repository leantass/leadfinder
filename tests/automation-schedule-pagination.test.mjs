import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

function load(file, mocks, extra = '') {
  const code = ts.transpileModule(readFileSync(new URL(`../src/lib/${file}.ts`, import.meta.url), 'utf8') + extra, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const compiledModule = { exports: {} };
  new Function('require', 'module', 'exports', code)(id => {
    assert.ok(Object.hasOwn(mocks, id), `Unexpected dependency: ${id}`);
    return mocks[id];
  }, compiledModule, compiledModule.exports);
  return compiledModule.exports;
}

function harness(total, page, max) {
  const leads = Array.from({ length: total }, (_, i) => ({ id: String(i + 1) }));
  const schedule = {
    id: 'schedule', query: 'fixture', filter: 'marked', sort: 'name-asc',
    page, pageSize: 20, maxItemsPerRun: max, autoApplySafe: false,
    createdAt: new Date(), updatedAt: new Date(),
    lease: { assertActive() {}, async guard() {} },
  };
  let query;
  const prisma = {
    lead: { async findMany(args) {
      if (args.where.id) return leads.filter(l => args.where.id.in.includes(l.id)).reverse();
      query = args;
      return leads.slice(args.skip, args.skip + args.take);
    } },
    automationRun: { async create({ data }) { return { ...data, id: 'run', items: data.items.create }; } },
    automationSchedule: { async findUniqueOrThrow() { return schedule; } },
    async $transaction(fn) { return fn(prisma); },
  };
  const mocks = {
    'server-only': {}, '@/lib/prisma': { prisma },
    '@/lib/auth/operator': { requireAuthenticatedOperator() { throw new Error('Unexpected auth call'); } },
    '@/lib/leads/list-query': load('leads/list-query', {}),
    '@prisma/client': { Prisma: { TransactionIsolationLevel: { ReadCommitted: 'ReadCommitted' } } },
    '@/lib/automation/schedule-lock': {}, '@/lib/leads/lead-ui': {},
    '@/lib/automation/schedule-utils': load('automation/schedule-utils', {}),
    '@/lib/leads/automation-engine': {
      getNormalizedAutomationAutoApplyPolicy: () => ({ enabled: false }),
      getLeadAutomationDecision: lead => ({ leadId: lead.id, action: 'discard', confidence: 'high', reason: 'fixture' }),
    },
  };
  const workspace = load('workspace-data', mocks);
  mocks['@/lib/workspace-data'] = { ...workspace, normalizeAutomationRun: r => r };
  const runner = load('automation/schedule-runner', mocks, '\nexport { executeAutomationScheduleRecord };');
  return { schedule, runner, query: () => query };
}

for (const [name, total, page, max, first, count, limited] of [
  ['page1 max5', 60, 1, 5, 1, 5, true],
  ['page2 max5', 60, 2, 5, 21, 5, true],
  ['max=pageSize with later page', 60, 2, 20, 21, 20, false],
  ['max>pageSize', 60, 2, 50, 21, 20, false],
  ['partial page', 35, 2, 20, 21, 15, false],
  ['max1', 60, 2, 1, 21, 1, true],
  ['partial page trimmed without later page', 35, 2, 5, 21, 5, true],
  ['partial page below max', 23, 2, 5, 21, 3, false],
]) {
  test(name, async () => {
    const h = harness(total, page, max);
    const result = await h.runner.executeAutomationScheduleRecord(h.schedule);
    assert.equal(result.ok, true);
    assert.deepEqual(result.run.items.map(i => i.leadId), Array.from({ length: count }, (_, i) => String(first + i)));
    assert.equal(result.processedLeadCount, count);
    assert.equal(result.run.analyzedCount, count);
    assert.equal(result.limitedByMaxItems, limited);
    assert.equal(h.query().skip, (page - 1) * 20);
    assert.equal(h.query().take, 21);
    assert.deepEqual(h.query().orderBy, [{ businessName: 'asc' }, { scrapedAt: 'desc' }]);
    assert.ok(JSON.stringify(h.query().where).includes('fixture'));
    assert.ok(JSON.stringify(h.query().where).includes('"commercialStatus":"marked"'));
    assert.deepEqual([result.run.page, result.run.pageSize, result.run.query, result.run.filter, result.run.sort], [page, 20, 'fixture', 'marked', 'name-asc']);
  });
}

test('manual run preserves explicit IDs, order and context without schedule selection', async () => {
  const h = harness(60, 2, 1);
  const result = await h.runner.createAutomationRunRecord({
    leadIds: ['40', '21', '30'], context: { page: 2, pageSize: 20, q: 'fixture', filter: 'marked', sort: 'name-asc' },
  });
  assert.equal(result.ok, true);
  assert.equal(result.run.source, 'manual');
  assert.equal(result.run.scheduleId, null);
  assert.deepEqual(result.run.items.map(i => i.leadId), ['40', '21', '30']);
  assert.deepEqual([result.run.page, result.run.pageSize, result.run.query, result.run.filter, result.run.sort], [2, 20, 'fixture', 'marked', 'name-asc']);
  assert.equal(h.query(), undefined);
});
