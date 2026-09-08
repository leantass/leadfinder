import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { setImmediate as nextTurn } from 'node:timers/promises';
import ts from 'typescript';

const code = ts.transpileModule(readFileSync(new URL('../src/lib/automation/schedule-lock.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function harness() {
  const rows = new Map(['a', 'b'].map(id => [id, { id, isEnabled: true, lockToken: null, lockedAt: null, lastRunAt: null }]));
  let failure = false;
  let writes = 0;
  const prisma = { automationSchedule: {
    async updateMany({ where, data }) {
      writes++;
      if (failure) throw new Error('database unavailable');
      const row = rows.get(where.id);
      if (!row || (where.isEnabled && !row.isEnabled) || (where.lockToken && row.lockToken !== where.lockToken)) return { count: 0 };
      if (where.OR && !(row.lockedAt === null || row.lockedAt <= where.OR[1].lockedAt.lte)) return { count: 0 };
      if (where.lockedAt && (!row.lockedAt || row.lockedAt <= where.lockedAt.gt)) return { count: 0 };
      for (const [k, v] of Object.entries(data)) if (v !== undefined) row[k] = v;
      return { count: 1 };
    },
  } };
  const mocks = { 'server-only': {}, 'node:crypto': { randomBytes }, '@/lib/prisma': { prisma }, '@prisma/client': {} };
  const compiledModule = { exports: {} };
  new Function('require', 'module', 'exports', code)(id => {
    assert.ok(Object.hasOwn(mocks, id), id); return mocks[id];
  }, compiledModule, compiledModule.exports);
  const tx = { $queryRaw: async (_strings, id) => rows.has(id) ? [structuredClone(rows.get(id))] : [] };
  return { ...compiledModule.exports, rows, tx, fail: () => { failure = true; }, writes: () => writes };
}

test('competing acquisitions have a single winner; disabled schedules cannot acquire', async () => {
  const h = harness(); const leases = await Promise.all([h.acquireScheduleLease('a'), h.acquireScheduleLease('a')]);
  assert.equal(leases.filter(Boolean).length, 1);
  assert.match(h.rows.get('a').lockToken, /^[0-9a-f]{64}$/);
  h.rows.get('b').isEnabled = false; assert.equal(await h.acquireScheduleLease('b'), null);
});

test('crash TTL recovery replaces token and blocks every stale-owner operation', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1000000 });
  const h = harness(); const old = await h.acquireScheduleLease('a'); const token = h.rows.get('a').lockToken;
  t.mock.timers.tick(h.SCHEDULE_LOCK_TTL_MS);
  const owner = await h.acquireScheduleLease('a'); assert.ok(owner); assert.notEqual(h.rows.get('a').lockToken, token);
  const before = structuredClone(h.rows.get('a'));
  await assert.rejects(old.guard(h.tx), h.ScheduleLockLostError);
  await assert.rejects(old.renew(), h.ScheduleLockLostError);
  assert.equal(await old.release(new Date()), false); assert.deepEqual(h.rows.get('a'), before);
  assert.equal(await owner.release(new Date()), true);
});

test('expired lease cannot resurrect itself or update lastRunAt without a takeover', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1000000 });
  const h = harness(); const old = await h.acquireScheduleLease('a');
  t.mock.timers.tick(h.SCHEDULE_LOCK_TTL_MS);
  await assert.rejects(old.renew(), h.ScheduleLockLostError);
  assert.equal(await old.release(new Date()), false); assert.equal(h.rows.get('a').lastRunAt, null);
});

test('periodic renewal advances timestamp, keeps token, and stop clears timer', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1000000 });
  const h = harness(); const lease = await h.acquireScheduleLease('a'); const token = h.rows.get('a').lockToken;
  lease.start(); t.mock.timers.tick(5 * 60000); await nextTurn();
  assert.equal(h.rows.get('a').lockedAt.getTime(), 1300000); assert.equal(h.rows.get('a').lockToken, token);
  assert.equal(await h.acquireScheduleLease('a'), null);
  await lease.stop(); const writes = h.writes();
  t.mock.timers.tick(30 * 60000); await nextTurn(); assert.equal(h.writes(), writes);
});

test('renewal database error fails closed and schedules no further timer', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1000000 });
  const h = harness(); const lease = await h.acquireScheduleLease('a'); lease.start(); h.fail();
  t.mock.timers.tick(5 * 60000); await nextTurn();
  assert.throws(() => lease.assertActive(), h.ScheduleLockLostError);
  const writes = h.writes(); t.mock.timers.tick(30 * 60000); await nextTurn();
  assert.equal(h.writes(), writes); await lease.stop();
});

test('owner release clears token and timestamp, updates lastRunAt only once', async () => {
  const h = harness(); const lease = await h.acquireScheduleLease('a'); const at = new Date();
  assert.equal(await lease.release(at), true);
  assert.equal(h.rows.get('a').lockToken, null); assert.equal(h.rows.get('a').lockedAt, null);
  assert.deepEqual(h.rows.get('a').lastRunAt, at);
  assert.equal(await lease.release(new Date(0)), false); assert.deepEqual(h.rows.get('a').lastRunAt, at);
});

test('each schedule acquisition uses a fresh timestamp', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1000000 });
  const h = harness(); await h.acquireScheduleLease('a');
  t.mock.timers.tick(20 * 60000); await h.acquireScheduleLease('b');
  assert.equal(h.rows.get('a').lockedAt.getTime(), 1000000);
  assert.equal(h.rows.get('b').lockedAt.getTime(), 2200000);
});
