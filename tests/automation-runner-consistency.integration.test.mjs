import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import ts from 'typescript';
import { Prisma, PrismaClient } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';

// Never accept DATABASE_URL: this suite owns a brand-new cluster, port and DB.
const root = fileURLToPath(new URL('../', import.meta.url));
const pgBin = process.env.LEADFINDER_TEST_PG_BIN ?? (process.platform === 'win32'
  ? path.join(process.env.LOCALAPPDATA, 'caritas-postgresql-16.15', 'pgsql', 'bin') : '/usr/lib/postgresql/16/bin');
const binary = name => path.join(pgBin, name + (process.platform === 'win32' ? '.exe' : ''));
const available = ['initdb', 'pg_ctl', 'createdb'].every(name => existsSync(binary(name)));
const compiled = ts.transpileModule(readFileSync(path.join(root, 'src/lib/automation/schedule-runner.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function load(prisma, { all = false, list = async () => ({ leadIds: [], hasMore: false }) } = {}) {
  const mocks = {
    'server-only': {}, '@prisma/client': { Prisma }, '@/lib/prisma': { prisma },
    '@/lib/automation/schedule-lock': {},
    '@/lib/leads/automation-engine': {
      getLeadAutomationActionLabel: a => a,
      getNormalizedAutomationAutoApplyPolicy: p => p,
      isSafeAutoApplicableAutomationRunItem: i => i.status === 'pending',
      getLeadAutomationDecision: lead => ({ leadId: lead.id, action: 'discard', confidence: 'high', reason: 'fixture' }),
    },
    '@/lib/leads/lead-ui': { getStatusLabel: s => s }, '@/lib/automation/schedule-utils': {
      getAutomationScheduleMaxItemsPerRun: s => s.maxItemsPerRun,
      isAutomationScheduleWithinRunWindow: () => true,
      isAutomationScheduleDue: s => !s.lastRunAt || new Date(s.lastRunAt).getTime() + s.runEveryMinutes * 60000 <= Date.now(),
    },
    '@/lib/workspace-data': {
      getLeadIdsForListContext: list,
      automationRunItemLeadSelect: { id: true, commercialStatus: true },
      normalizeAutomationRun: r => ({ ...r, pendingCount: r.decisionCount - r.appliedCount - r.failedCount }),
    },
  };
  const lockCode = ts.transpileModule(readFileSync(path.join(root, 'src/lib/automation/schedule-lock.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const lockModule = { exports: {} };
  new Function('require', 'module', 'exports', lockCode)(id => {
    if (id === 'node:crypto') return { randomBytes };
    assert.ok(Object.hasOwn(mocks, id), id); return mocks[id];
  }, lockModule, lockModule.exports);
  mocks['@/lib/automation/schedule-lock'] = lockModule.exports;
  const compiledModule = { exports: {} };
  new Function('require', 'module', 'exports', 'console', compiled)(id => {
    assert.ok(Object.hasOwn(mocks, id), `Unexpected dependency: ${id}`); return mocks[id];
  }, compiledModule, compiledModule.exports, { error() {} });
  return all ? { ...compiledModule.exports, ...lockModule.exports } : compiledModule.exports.applyAutomationRunItemRecord;
}

function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }

test('PostgreSQL atomic item application in an owned disposable cluster', { skip: !available, timeout: 180000 }, async t => {
  const directory = mkdtempSync(path.join(tmpdir(), 'leadfinder-item-tests-'));
  const data = path.join(directory, 'data');
  const server = createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  assert.ok(![5432, 5433].includes(port));
  const url = `postgresql://postgres@127.0.0.1:${port}/leadfinder_item_test`;
  const env = { ...process.env, DATABASE_URL: url, PGHOST: '127.0.0.1', PGPORT: String(port), PGUSER: 'postgres', PGDATABASE: 'leadfinder_item_test' };
  delete env.PGPASSWORD; delete env.PGSERVICE; delete env.PGOPTIONS;
  let prisma;
  let startAttempted = false;
  // PostgreSQL children on Windows can inherit pipe handles. Do not give the
  // launcher pipes whose EOF execFileSync would wait for after pg_ctl exits.
  const exec = (file, args) => execFileSync(file, args, { cwd: root, env, stdio: 'ignore', windowsHide: true, timeout: 60000 });
  try {
    exec(binary('initdb'), ['-D', data, '-U', 'postgres', '-A', 'trust', '--encoding=UTF8', '--no-locale']);
    startAttempted = true;
    exec(binary('pg_ctl'), ['start', '-D', data, '-l', path.join(directory, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port}`, '-w', '-t', '30']);
    exec(binary('createdb'), ['-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', 'leadfinder_item_test']);
    exec(process.execPath, [path.join(root, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy']);
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
    const [identity] = await prisma.$queryRaw`SELECT current_database() AS db, inet_server_port() AS port, current_setting('data_directory') AS directory`;
    assert.equal(identity.db, 'leadfinder_item_test'); assert.equal(identity.port, port);
    assert.equal(path.resolve(identity.directory), path.resolve(data));
    const apply = load(prisma);

    async function fixture(count = 1) {
      const leads = [];
      for (let i = 0; i < count; i++) leads.push(await prisma.lead.create({ data: { businessName: 'Disposable fixture', commercialStatus: 'new', scoreReasons: [] } }));
      return prisma.automationRun.create({ data: {
        analyzedCount: count, decisionCount: count,
        items: { create: leads.map(lead => ({ leadId: lead.id, action: 'discard', confidence: 'high', reason: 'test fixture' })) },
      }, include: { items: true } });
    }

    async function snapshot(run) {
      return {
        run: await prisma.automationRun.findUniqueOrThrow({ where: { id: run.id }, include: { items: { orderBy: { id: 'asc' } } } }),
        leads: await prisma.lead.findMany({ where: { id: { in: run.items.map(i => i.leadId) } }, orderBy: { id: 'asc' } }),
        activities: await prisma.leadActivity.findMany({ where: { leadId: { in: run.items.map(i => i.leadId) } }, orderBy: { id: 'asc' } }),
      };
    }

    // Hold worker A after the real row lock; prove B is blocked in PostgreSQL
    // before releasing A. No timing-only Promise.all assertion.
    async function race(firstId, secondId) {
      const held = deferred(); const release = deferred();
      let first = true;
      const wrapped = {
        automationRunItem: prisma.automationRunItem,
        $transaction: (callback, options) => prisma.$transaction(tx => callback(new Proxy(tx, {
          get(target, key) {
            if (key === '$queryRaw') return async (...args) => {
              const value = await target.$queryRaw(...args);
              if (first) { first = false; held.resolve(); await release.promise; }
              return value;
            };
            return Reflect.get(target, key);
          },
        })), { ...options, timeout: 15000 }),
      };
      const a = load(wrapped)({ runItemId: firstId });
      await held.promise;
      const b = apply({ runItemId: secondId });
      let blocked = false;
      try {
        for (let i = 0; i < 100; i++) {
          const rows = await prisma.$queryRaw`SELECT pid FROM pg_stat_activity WHERE datname = current_database() AND cardinality(pg_blocking_pids(pid)) > 0`;
          if (rows.length) { blocked = true; break; }
          await delay(10);
        }
      } finally { release.resolve(); }
      const results = await Promise.all([a, b]);
      assert.ok(blocked, 'second worker must wait for the real PostgreSQL lock');
      return results;
    }

    await t.test('same item race: one application, one activity set, immutable retry', async () => {
      const run = await fixture(); const results = await race(run.items[0].id, run.items[0].id);
      assert.equal(results.filter(r => r.ok).length, 1);
      const state = await snapshot(run);
      assert.equal(state.run.appliedCount, 1); assert.equal(state.run.status, 'completed');
      assert.equal(state.activities.length, 2); assert.equal(state.leads[0].commercialStatus, 'discarded');
      await apply({ runItemId: run.items[0].id }); assert.deepEqual(await snapshot(run), state);
    });

    await t.test('failure after lead/activity writes rolls back before recording failed', async () => {
      const run = await fixture(); const before = await snapshot(run); let injected = false;
      const wrapped = {
        automationRunItem: prisma.automationRunItem,
        $transaction: (callback, options) => prisma.$transaction(tx => callback(new Proxy(tx, {
          get(target, key) {
            if (key !== 'automationRunItem') return Reflect.get(target, key);
            return new Proxy(target.automationRunItem, {
              get(model, method) {
                if (method !== 'updateMany') return Reflect.get(model, method);
                return async args => {
                  if (args.data.status === 'applied') {
                    assert.equal((await tx.lead.findUniqueOrThrow({ where: { id: run.items[0].leadId } })).commercialStatus, 'discarded');
                    assert.equal(await tx.leadActivity.count({ where: { leadId: run.items[0].leadId } }), 2);
                    injected = true; throw new Error('injected between mutation and item finalization');
                  }
                  return model.updateMany(args);
                };
              },
            });
          },
        })), options),
      };
      assert.equal((await load(wrapped)({ runItemId: run.items[0].id })).ok, false);
      const state = await snapshot(run); assert.ok(injected);
      assert.deepEqual(state.leads, before.leads); assert.deepEqual(state.activities, []);
      assert.equal(state.run.items[0].status, 'failed'); assert.equal(state.run.items[0].appliedAt, null);
      assert.equal(state.run.appliedCount, 0); assert.equal(state.run.failedCount, 1);
      assert.equal(state.run.status, 'completed_with_failures');
    });

    await t.test('different items same run serialize counters and pending count', async () => {
      const run = await fixture(3); const results = await race(run.items[0].id, run.items[1].id);
      assert.ok(results.every(r => r.ok)); const state = await snapshot(run);
      assert.equal(state.run.appliedCount, 2); assert.equal(state.run.failedCount, 0);
      assert.equal(state.run.decisionCount - state.run.appliedCount - state.run.failedCount, 1);
      assert.equal(state.run.status, 'in_progress'); assert.equal(state.activities.length, 4);
    });

    await t.test('late worker failure cannot overwrite another committed application', async () => {
      const run = await fixture(); const waiting = deferred(); const release = deferred(); let first = true;
      const wrapped = {
        automationRunItem: prisma.automationRunItem,
        async $transaction(callback, options) {
          if (first) { first = false; waiting.resolve(); await release.promise; throw new Error('late worker failure'); }
          return prisma.$transaction(callback, options);
        },
      };
      const late = load(wrapped)({ runItemId: run.items[0].id }); await waiting.promise;
      let before;
      try { assert.equal((await apply({ runItemId: run.items[0].id })).ok, true); before = await snapshot(run); }
      finally { release.resolve(); }
      assert.equal((await late).ok, false); assert.deepEqual(await snapshot(run), before);
    });

    await t.test('lost response after successful commit preserves applied', async () => {
      const run = await fixture(); let first = true;
      const wrapped = {
        automationRunItem: prisma.automationRunItem,
        async $transaction(callback, options) {
          const result = await prisma.$transaction(callback, options);
          if (first) { first = false; throw new Error('lost commit response'); }
          return result;
        },
      };
      await load(wrapped)({ runItemId: run.items[0].id }); const state = await snapshot(run);
      assert.equal(state.run.items[0].status, 'applied'); assert.equal(state.run.failedCount, 0);
      assert.equal(state.run.appliedCount, 1); assert.equal(state.activities.length, 2);
    });
    await t.test('schedule workers compete: loser creates no run or activities', async () => {
      const lead = await prisma.lead.create({ data: { businessName: 'Schedule fixture' } });
      const schedule = await prisma.automationSchedule.create({ data: { name: 'Competing fixture', autoApplySafe: true } });
      const entered = deferred(); const resume = deferred(); let selections = 0;
      const runner = load(prisma, { all: true, list: async () => {
        selections++; entered.resolve(); await resume.promise; return { leadIds: [lead.id], hasMore: false };
      } });
      const first = runner.executeAutomationScheduleById(schedule.id); await entered.promise;
      try {
        const second = await runner.executeAutomationScheduleById(schedule.id);
        assert.equal(second.ok, false); assert.equal(selections, 1);
        assert.equal(await prisma.automationRun.count({ where: { scheduleId: schedule.id } }), 0);
        assert.equal(await prisma.leadActivity.count({ where: { leadId: lead.id } }), 0);
      } finally { resume.resolve(); }
      const result = await first; assert.equal(result.ok, true);
      assert.equal(await prisma.automationRun.count({ where: { scheduleId: schedule.id } }), 1);
      assert.equal(await prisma.leadActivity.count({ where: { leadId: lead.id } }), 2);
      assert.ok(!JSON.stringify(result).includes('lockToken'));
      assert.ok(!JSON.stringify(result).includes('"lease"'));
      const released = await prisma.automationSchedule.findUniqueOrThrow({ where: { id: schedule.id } });
      assert.equal(released.lockToken, null); assert.equal(released.lockedAt, null); assert.ok(released.lastRunAt);
    });

    await t.test('expired/crashed owner cannot renew, release, update lastRunAt or mutate after recovery', async () => {
      const runner = load(prisma, { all: true });
      const schedule = await prisma.automationSchedule.create({ data: { name: 'Crash fixture' } });
      const first = await runner.acquireScheduleLease(schedule.id); assert.ok(first);
      const old = await prisma.automationSchedule.findUniqueOrThrow({ where: { id: schedule.id } });
      await prisma.automationSchedule.update({ where: { id: schedule.id }, data: { lockedAt: new Date(Date.now() - 16 * 60000) } });
      const contenders = await Promise.all([runner.acquireScheduleLease(schedule.id), runner.acquireScheduleLease(schedule.id)]);
      const owner = contenders.find(Boolean); assert.equal(contenders.filter(Boolean).length, 1);
      const before = await prisma.automationSchedule.findUniqueOrThrow({ where: { id: schedule.id } });
      assert.notEqual(before.lockToken, old.lockToken);
      await assert.rejects(new runner.ScheduleLease(schedule.id, old.lockToken).renew(), runner.ScheduleLockLostError);
      assert.equal(await new runner.ScheduleLease(schedule.id, old.lockToken).release(new Date()), false);
      await assert.rejects(prisma.$transaction(tx => first.guard(tx)), runner.ScheduleLockLostError);
      assert.deepEqual(await prisma.automationSchedule.findUniqueOrThrow({ where: { id: schedule.id } }), before);
      assert.equal(await owner.release(), true);
    });

    await t.test('renewal advances lockedAt preserving the current token', async () => {
      const runner = load(prisma, { all: true });
      const schedule = await prisma.automationSchedule.create({ data: { name: 'Renew fixture' } });
      const owner = await runner.acquireScheduleLease(schedule.id);
      const before = await prisma.automationSchedule.update({ where: { id: schedule.id }, data: { lockedAt: new Date(Date.now() - 60000) } });
      await owner.renew(); const after = await prisma.automationSchedule.findUniqueOrThrow({ where: { id: schedule.id } });
      assert.equal(after.lockToken, before.lockToken); assert.ok(after.lockedAt > before.lockedAt);
      assert.equal(await runner.acquireScheduleLease(schedule.id), null); assert.equal(await owner.release(), true);
    });

    await t.test('ownership loss between items stops the loop without marking remaining items failed', async () => {
      const schedule = await prisma.automationSchedule.create({ data: { name: 'Ownership loss fixture', autoApplySafe: true } });
      const leads = await Promise.all([1, 2, 3].map(() => prisma.lead.create({ data: { businessName: 'Loss fixture' } })));
      const controller = load(prisma, { all: true }); let takeover; let once = false;
      const wrapped = {
        automationSchedule: prisma.automationSchedule, automationRunItem: prisma.automationRunItem,
        lead: prisma.lead,
        async $transaction(callback, options) {
          let applied = false;
          const result = await prisma.$transaction(tx => callback(new Proxy(tx, {
            get(target, key) {
              if (key !== 'automationRunItem') return Reflect.get(target, key);
              return new Proxy(target.automationRunItem, {
                get(model, method) {
                  if (method !== 'updateMany') return Reflect.get(model, method);
                  return async args => { const result = await model.updateMany(args); if (args.data.status === 'applied' && result.count === 1) applied = true; return result; };
                },
              });
            },
          })), options);
          if (applied && !once) {
            once = true;
            await prisma.automationSchedule.update({ where: { id: schedule.id }, data: { lockedAt: new Date(Date.now() - 16 * 60000) } });
            takeover = await controller.acquireScheduleLease(schedule.id);
          }
          return result;
        },
      };
      const runner = load(wrapped, { all: true, list: async () => ({ leadIds: leads.map(l => l.id), hasMore: false }) });
      const result = await runner.executeAutomationScheduleById(schedule.id); assert.equal(result.ok, false); assert.ok(takeover);
      const run = await prisma.automationRun.findFirstOrThrow({ where: { scheduleId: schedule.id }, include: { items: true } });
      assert.equal(run.appliedCount, 1); assert.equal(run.failedCount, 0);
      assert.equal(run.items.filter(i => i.status === 'pending').length, 2);
      const locked = await prisma.automationSchedule.findUniqueOrThrow({ where: { id: schedule.id } });
      assert.ok(locked.lockToken); assert.equal(locked.lastRunAt, null);
      assert.equal(await takeover.release(), true);
    });

    await t.test('duplicate executionKey recovery uses the new lease and rejects the old one', async () => {
      const runner = load(prisma, { all: true });
      const lead = await prisma.lead.create({ data: { businessName: 'Duplicate fixture' } });
      const schedule = await prisma.automationSchedule.create({ data: { name: 'Duplicate fixture' } });
      const old = await runner.acquireScheduleLease(schedule.id);
      const input = { leadIds: [lead.id], source: 'schedule', scheduleId: schedule.id, executionKey: `fixture:${schedule.id}` };
      const original = await runner.createAutomationRunRecord(input, old); assert.equal(original.ok, true);
      await prisma.automationSchedule.update({ where: { id: schedule.id }, data: { lockedAt: new Date(Date.now() - 16 * 60000) } });
      const owner = await runner.acquireScheduleLease(schedule.id);
      const recovered = await runner.createAutomationRunRecord(input, owner);
      assert.equal(recovered.wasDuplicate, true); assert.equal(recovered.run.id, original.run.id);
      assert.equal((await runner.applyAutomationRunItemRecord({ runItemId: original.run.items[0].id }, old)).ok, false);
      assert.equal((await runner.applyAutomationRunItemRecord({ runItemId: original.run.items[0].id }, owner)).ok, true);
      assert.equal(await prisma.automationRun.count({ where: { scheduleId: schedule.id } }), 1);
      assert.equal(await owner.release(), true);
    });
  } finally {
    await prisma?.$disconnect();
    // Stop only the cluster created above. Preserve files if stopping fails.
    if (startAttempted && existsSync(path.join(data, 'postmaster.pid'))) {
      exec(binary('pg_ctl'), ['stop', '-D', data, '-m', 'fast', '-w', '-t', '30']);
    }
    assert.equal(path.dirname(directory), path.resolve(tmpdir()));
    assert.ok(path.basename(directory).startsWith('leadfinder-item-tests-'));
    rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});
