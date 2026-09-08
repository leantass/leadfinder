import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

function harness({ status = 'pending', fault, afterCommit, normalizationFault = false, action = 'discard', commercialStatus = 'new', contactAt = null } = {}) {
  let state = {
    run: { id: 'run', decisionCount: 3, appliedCount: 1, failedCount: 1 },
    items: [
      { id: 'item', runId: 'run', leadId: 'lead', status, action, suggestedStatus: 'contacted', reason: 'fixture', appliedAt: status === 'applied' ? new Date(0) : null },
      { id: 'other-applied', runId: 'run', status: 'applied' },
      { id: 'other-failed', runId: 'run', status: 'failed' },
    ],
    lead: { id: 'lead', commercialStatus, followUpDueAt: null, firstContactAt: contactAt, lastContactAt: contactAt, outreachStatus: 'pending_review' },
    activities: [],
  };
  let fail = fault;
  let normalizeFails = normalizationFault;
  let commits = 0;
  const trace = [];
  const prisma = {
    automationRunItem: { findUnique: async () => ({ id: 'item', runId: 'run' }) },
    async $transaction(callback, options) {
      assert.equal(options.isolationLevel, 'ReadCommitted');
      const draft = structuredClone(state);
      let locked = false;
      function guard() { assert.ok(locked, 'item/lead/count access must follow parent lock'); }
      const snapshot = () => ({ ...draft.run, items: draft.items });
      const tx = {
        async $queryRaw(strings, runId) {
          assert.match(strings.join('?'), /WHERE "id" = \? FOR UPDATE/);
          assert.equal(runId, 'run'); locked = true; trace.push('lock');
        },
        automationRunItem: {
          async findUnique({ where }) { guard(); return draft.items.find(i => i.id === where.id); },
          async updateMany({ where, data }) {
            guard(); assert.equal(where.status, 'pending');
            if (fail === 'transition' && data.status === 'applied') { fail = null; throw new Error('injected transition failure'); }
            const item = draft.items.find(i => i.id === where.id && i.status === where.status);
            if (!item) return { count: 0 };
            Object.assign(item, data); return { count: 1 };
          },
          async groupBy() {
            guard(); return ['pending', 'applied', 'failed'].map(status => ({ status, _count: { _all: draft.items.filter(i => i.status === status).length } }));
          },
        },
        lead: {
          async findUnique() { guard(); return { ...draft.lead }; },
          async findUniqueOrThrow() { guard(); return { ...draft.lead }; },
          async update({ data }) { guard(); Object.assign(draft.lead, data); },
        },
        leadActivity: { async create({ data }) { guard(); const activity = { ...data, id: String(draft.activities.length), createdAt: new Date() }; draft.activities.push(activity); return activity; } },
        automationRun: {
          async findUnique() { guard(); return snapshot(); },
          async findUniqueOrThrow() { guard(); return snapshot(); },
          async update({ data }) { guard(); Object.assign(draft.run, data); },
        },
      };
      const result = await callback(tx);
      state = draft; commits++;
      if (afterCommit && commits === 1) throw new Error('injected lost commit response');
      return result;
    },
  };
  const mocks = {
    'server-only': {},
    '@prisma/client': { Prisma: { TransactionIsolationLevel: { ReadCommitted: 'ReadCommitted' } } },
    '@/lib/prisma': { prisma },
    '@/lib/leads/automation-engine': { getLeadAutomationActionLabel: a => a },
    '@/lib/leads/lead-ui': { getStatusLabel: s => s },
    '@/lib/automation/schedule-utils': {},
    '@/lib/workspace-data': {
      automationRunItemLeadSelect: {},
      normalizeAutomationRun(run) {
        if (normalizeFails) { normalizeFails = false; throw new Error('injected normalization failure'); }
        return { ...run, pendingCount: run.decisionCount - run.appliedCount - run.failedCount };
      },
    },
  };
  const compiled = ts.transpileModule(readFileSync(new URL('../src/lib/automation/schedule-runner.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const compiledModule = { exports: {} };
  new Function('require', 'module', 'exports', 'console', compiled)(id => {
    assert.ok(Object.hasOwn(mocks, id), `Unexpected dependency: ${id}`); return mocks[id];
  }, compiledModule, compiledModule.exports, { error() {} });
  return { apply: (options = {}) => compiledModule.exports.applyAutomationRunItemRecord({ runItemId: 'item', ...options }), state: () => structuredClone(state), trace };
}

test('already applied retry preserves lead, activities and appliedAt', async () => {
  const h = harness({ status: 'applied' }); const before = h.state();
  assert.equal((await h.apply()).ok, false);
  assert.deepEqual(h.state(), before);
});

test('application and retry create exactly one set of activities; counters include all statuses', async () => {
  const h = harness(); const result = await h.apply();
  assert.equal(result.ok, true);
  assert.equal(result.automationRun.appliedCount, 2);
  assert.equal(result.automationRun.failedCount, 1);
  assert.equal(result.automationRun.pendingCount, 0);
  assert.equal(result.automationRun.status, 'completed_with_failures');
  const before = h.state(); assert.equal(before.activities.length, 2);
  assert.equal((await h.apply()).ok, false); assert.deepEqual(h.state(), before);
});

test('failure after lead and activities rolls them back, then marks only pending failed', async () => {
  const h = harness({ fault: 'transition' }); const before = h.state();
  assert.equal((await h.apply()).ok, false);
  const after = h.state(); assert.deepEqual(after.lead, before.lead); assert.deepEqual(after.activities, []);
  assert.equal(after.items[0].status, 'failed'); assert.equal(after.items[0].appliedAt, null);
  assert.equal(after.run.appliedCount, 1); assert.equal(after.run.failedCount, 2);
  assert.deepEqual(h.trace, ['lock', 'lock']);
});

test('late error after commit cannot convert applied to failed', async () => {
  const h = harness({ afterCommit: true }); await h.apply(); const state = h.state();
  assert.equal(state.items[0].status, 'applied'); assert.equal(state.run.failedCount, 1);
  assert.equal(state.activities.length, 2); assert.equal(state.lead.commercialStatus, 'discarded');
});

test('error while returning an already applied item does not overwrite it', async () => {
  const h = harness({ status: 'applied', normalizationFault: true }); const before = h.state();
  await h.apply(); assert.deepEqual(h.state(), before);
});

test('error while returning a failed item does not overwrite it', async () => {
  const h = harness({ status: 'failed', normalizationFault: true }); const before = h.state();
  await h.apply(); assert.deepEqual(h.state(), before);
});

for (const executeWhatsApp of [false, true]) {
  test(`contact_now opening=${executeWhatsApp}: preserves lead, applies once, records intent only`, async () => {
    const h = harness({ action: 'contact_now' }); const before = h.state().lead;
    assert.equal((await h.apply({ executeWhatsApp })).ok, true);
    const after = h.state();
    assert.deepEqual(after.lead, before);
    assert.equal(after.items[0].status, 'applied');
    assert.deepEqual(after.activities.map(a => a.type), executeWhatsApp
      ? ['automation_applied', 'contact_prepared', 'whatsapp_open_requested']
      : ['automation_applied', 'contact_prepared']);
    assert.ok(after.activities.every(a => !a.metadata?.includes('Estado: contacted')));
    assert.equal((await h.apply({ executeWhatsApp })).ok, false);
    assert.deepEqual(h.state(), after);
  });
}

test('contact_now preserves an already contacted lead and existing contact dates', async () => {
  const h = harness({ action: 'contact_now', commercialStatus: 'contacted', contactAt: new Date(0) });
  const before = h.state().lead; await h.apply({ executeWhatsApp: true });
  assert.deepEqual(h.state().lead, before);
});

test('supervised auto-apply prepares contact without confirming it', async () => {
  const h = harness({ action: 'contact_now', commercialStatus: 'ready' }); const before = h.state().lead;
  assert.equal((await h.apply({ mode: 'supervised_auto', executeWhatsApp: false })).ok, true);
  assert.deepEqual(h.state().lead, before);
  assert.deepEqual(h.state().activities.map(a => a.type), ['automation_applied', 'contact_prepared']);
});

for (const [action, commercialStatus, expectedStatus, expectedActivities] of [
  ['follow_up', 'new', 'follow-up', ['status_changed', 'follow_up_updated', 'automation_applied']],
  ['send_to_sales', 'new', 'ready', ['status_changed', 'sent_to_sales', 'automation_applied']],
  ['review_manually', 'ready', 'ready', ['automation_applied']],
  ['discard', 'new', 'discarded', ['status_changed', 'automation_applied']],
  ['close', 'new', 'closed', ['status_changed', 'automation_applied']],
]) {
  test(`regression: ${action} retains its commercial effects`, async () => {
    const h = harness({ action, commercialStatus }); assert.equal((await h.apply()).ok, true);
    const state = h.state(); assert.equal(state.lead.commercialStatus, expectedStatus);
    assert.deepEqual(state.activities.map(a => a.type), expectedActivities);
    if (action === 'follow_up') {
      assert.equal(state.lead.followUpNextAction, 'Hacer seguimiento');
      assert.ok(state.lead.followUpDueAt instanceof Date);
    }
  });
}
