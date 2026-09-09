import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { loadBulk } from './helpers/bulk-loader.mjs';
import { disposableBulkDatabase } from './helpers/bulk-postgres.mjs';

const user = 'bulk-test-operator';
const input = text => ({ text, config: { delimiter: '\t', hasHeaders: false, mapping: ['businessName', 'phone'] } });
const request = (source, preview, selectedRows = preview.rows.filter(r => r.status === 'NEW').map(r => r.sourceRow), overrides = []) =>
  ({ ...source, batchId: preview.batchId, contentHash: preview.contentHash, token: preview.token, selectedRows, overrides });

test('bulk contacts in owned disposable PostgreSQL', { timeout: 180000 }, async t => {
  const db = await disposableBulkDatabase();
  const { prisma } = db;
  const savedSecret = process.env.LEADFINDER_SESSION_SECRET;
  process.env.LEADFINDER_SESSION_SECRET = randomBytes(32).toString('hex');
  const load = (client = prisma) => loadBulk('src/lib/leads/bulk-contact-import.ts', { '@/lib/prisma': { prisma: client } });
  const service = load();
  const snapshot = async () => ({ leads: await prisma.lead.count(), activities: await prisma.leadActivity.count() });
  try {
    await t.test('NEW creates manual leads and activities; invalid and batch duplicate omitted', async () => {
      const source = input('Initial\t+12025550111\nInitial\t+12025550111\nInvalid\tabc');
      const preview = await service.previewBulkContacts(source, user);
      assert.deepEqual(preview.rows.map(r => r.status), ['NEW', 'DUPLICATE', 'INVALID']);
      assert.equal(preview.rows[1].matches[0].reference, 'fila:1');
      const outcome = await service.confirmBulkContacts(request(source, preview), user);
      assert.equal(outcome.result.created, 1); assert.equal(outcome.result.duplicate, 1); assert.equal(outcome.result.invalid, 1);
      const lead = await prisma.lead.findUniqueOrThrow({ where: { id: outcome.result.leadIds[0] }, include: { activities: true } });
      assert.equal(lead.origin, 'MANUAL'); assert.equal(lead.searchJobId, null); assert.equal(lead.sourcePlatform, null);
      assert.equal(lead.commercialStatus, 'new'); assert.equal(lead.outreachStatus, 'pending_review');
      assert.equal(lead.activities.length, 1); assert.equal(lead.activities[0].type, 'manual_created');
      const metadata = JSON.parse(lead.activities[0].metadata);
      assert.equal(metadata.batchId, preview.batchId); assert.equal(metadata.sourceRow, 1);
      assert.equal(metadata.entryMode, 'bulk_paste'); assert.equal(metadata.origin, 'MANUAL'); assert.equal(metadata.importerVersion, 1);
      assert.equal(metadata.contentHash, preview.contentHash); assert.ok(!lead.activities[0].metadata.includes('Initial'));
    });
    for (const origin of ['SEARCH', 'MANUAL']) await t.test(`dedup against ${origin} and duplicate cannot be selected`, async () => {
      await prisma.lead.create({ data: { businessName: origin, phone: '+12025550222', origin } });
      const source = input(`${origin}\t+12025550222`);
      const preview = await service.previewBulkContacts(source, user);
      assert.equal(preview.rows[0].status, 'DUPLICATE');
      const before = await snapshot();
      await assert.rejects(() => service.confirmBulkContacts(request(source, preview, [1]), user), /bloqueadas/);
      assert.deepEqual(await snapshot(), before);
    });
    await t.test('possible duplicate needs explicit override', async () => {
      await prisma.lead.create({ data: { businessName: 'Shared line A', phone: '123456' } });
      const source = input('Shared line B\t123456');
      const preview = await service.previewBulkContacts(source, user);
      assert.equal(preview.rows[0].status, 'POSSIBLE_DUPLICATE');
      const before = await snapshot();
      await assert.rejects(() => service.confirmBulkContacts(request(source, preview, [1]), user), /sin confirmar/);
      assert.deepEqual(await snapshot(), before);
      const outcome = await service.confirmBulkContacts(request(source, preview, [1], [1]), user);
      assert.equal(outcome.result.created, 1);
    });
    await t.test('DB change after preview produces refreshed preview and zero writes', async () => {
      const source = input('Appeared\t+12025550333');
      const preview = await service.previewBulkContacts(source, user);
      await prisma.lead.create({ data: { businessName: 'Appeared', phone: '+12025550333' } });
      const before = await snapshot();
      const outcome = await service.confirmBulkContacts(request(source, preview), user);
      assert.equal(outcome.kind, 'changed'); assert.equal(outcome.preview.batchId, preview.batchId);
      assert.equal(outcome.preview.rows[0].status, 'DUPLICATE'); assert.deepEqual(await snapshot(), before);
    });
    await t.test('rollback on second activity failure leaves no partial batch', async () => {
      const source = input('Rollback 1\t+12025550441\nRollback 2\t+12025550442');
      const preview = await service.previewBulkContacts(source, user);
      let creates = 0;
      const wrapped = { ...prisma, $transaction: (callback, options) => prisma.$transaction(tx => callback(new Proxy(tx, {
        get(target, key) {
          if (key !== 'leadActivity') return Reflect.get(target, key);
          return new Proxy(target.leadActivity, { get(model, method) {
            if (method !== 'create') return Reflect.get(model, method);
            return args => { if (++creates === 2) throw new Error('Injected activity failure'); return model.create(args); };
          } });
        },
      })), options) };
      const before = await snapshot();
      await assert.rejects(() => load(wrapped).confirmBulkContacts(request(source, preview), user), /Injected/);
      assert.equal(creates, 2); assert.deepEqual(await snapshot(), before);
    });
    await t.test('lost response retry returns same stored result, changed content/selection rejected', async () => {
      const source = input('Retry\t+12025550555');
      const preview = await service.previewBulkContacts(source, user), req = request(source, preview);
      const first = await service.confirmBulkContacts(req, user); const before = await snapshot();
      const retry = await service.confirmBulkContacts(req, user);
      assert.deepEqual(retry, first); assert.deepEqual(await snapshot(), before);
      await assert.rejects(() => service.confirmBulkContacts({ ...req, text: 'Altered\t+12025550555' }, user), /preview/);
      await assert.rejects(() => service.confirmBulkContacts({ ...req, overrides: [1] }, user), /otro contenido o selección/);
    });
    await t.test('signed preview rejects altered signature, contentHash and different operator', async () => {
      const source = input('Signed\t+12025550666'), preview = await service.previewBulkContacts(source, user);
      const req = request(source, preview), before = await snapshot();
      for (const altered of [{ ...req, token: req.token + 'x' }, { ...req, contentHash: 'fake' }, { ...req, batchId: 'fake' }]) {
        await assert.rejects(() => service.confirmBulkContacts(altered, user), /preview/);
      }
      await assert.rejects(() => service.confirmBulkContacts(req, 'other'), /preview/);
      assert.deepEqual(await snapshot(), before);
    });
    await t.test('two overlapping transactions for same batch produce one commit and recover retry', async () => {
      const source = input('Concurrent\t+12025550777'), preview = await service.previewBulkContacts(source, user);
      let arrivals = 0, attempts = 0, release;
      const barrier = new Promise(resolve => { release = resolve; });
      const wrapped = { $transaction: (callback, options) => {
        attempts++; assert.equal(options.isolationLevel, 'Serializable');
        return prisma.$transaction(tx => callback(new Proxy(tx, { get(target, key) {
          if (key !== 'leadActivity') return Reflect.get(target, key);
          return new Proxy(target.leadActivity, { get(model, method) {
            if (method !== 'findMany') return Reflect.get(model, method);
            return async args => {
              const result = await model.findMany(args);
              if (arrivals < 2) { arrivals++; if (arrivals === 2) release(); await barrier; }
              return result;
            };
          } });
        } })), options);
      } };
      const concurrent = load(wrapped), req = request(source, preview);
      const results = await Promise.all([concurrent.confirmBulkContacts(req, user), concurrent.confirmBulkContacts(req, user)]);
      assert.deepEqual(results[0], results[1]); assert.ok(attempts >= 3, 'one serializable conflict must retry');
      assert.equal(await prisma.lead.count({ where: { businessName: 'Concurrent' } }), 1);
    });
    await t.test('P2034 retries are capped at three attempts', async () => {
      const source = input('Exhausted\t+12025550888'), preview = await service.previewBulkContacts(source, user);
      let attempts = 0;
      const wrapped = { async $transaction() { attempts++; throw new Prisma.PrismaClientKnownRequestError('Conflict', { code: 'P2034', clientVersion: '7.7.0' }); } };
      await assert.rejects(() => load(wrapped).confirmBulkContacts(request(source, preview), user), e => e.code === 'P2034');
      assert.equal(attempts, 3);
    });
    await t.test('selection errors and server limits cannot be bypassed', async () => {
      const source = input('Selection\t+12025550999\nBad\tabc');
      const preview = await service.previewBulkContacts(source, user), before = await snapshot();
      for (const [rows, overrides] of [[[2], []], [[1], [1]], [[99], []], [[1, 1], []], [[], []]]) {
        await assert.rejects(() => service.confirmBulkContacts(request(source, preview, rows, overrides), user));
      }
      for (const text of ['a'.repeat(262145), `${'a'.repeat(2001)}\t123456`, Array(101).fill('One\t123456').join('\n')]) {
        await assert.rejects(() => service.previewBulkContacts(input(text), user));
        await assert.rejects(() => service.confirmBulkContacts({ ...request(source, preview), text }, user));
      }
      assert.deepEqual(await snapshot(), before);
    });
    await t.test('unselected possible duplicates are counted without being created', async () => {
      const source = input('Selection New\t+12025550901\nSelection Possible\t123456');
      const preview = await service.previewBulkContacts(source, user);
      assert.deepEqual(preview.rows.map(row => row.status), ['NEW', 'POSSIBLE_DUPLICATE']);
      const outcome = await service.confirmBulkContacts(request(source, preview), user);
      assert.equal(outcome.result.created, 1); assert.equal(outcome.result.possibleOmitted, 1);
      assert.equal(await prisma.lead.count({ where: { businessName: 'Selection Possible' } }), 0);
    });
    await t.test('individual action retains validation, enrichment and activity', async () => {
      const paths = [];
      const actions = loadBulk('src/app/actions.ts', {
        '@/lib/prisma': { prisma }, '@/lib/auth/operator': { requireAuthenticatedOperator: async () => ({ user }) },
        'next/cache': { revalidatePath: path => paths.push(path) }, '@/lib/automation/schedule-runner': {}, '@/services/search-jobs': {},
      });
      const before = await snapshot();
      assert.equal((await actions.createManualLeadAction({ businessName: '', phone: 'bad' })).ok, false);
      assert.deepEqual(await snapshot(), before);
      const result = await actions.createManualLeadAction({ businessName: ' Individual ', phone: '123987', website: 'example.org' });
      assert.equal(result.ok, true); assert.equal(result.lead.businessName, 'Individual');
      assert.equal(result.lead.website, 'https://example.org/'); assert.equal(result.lead.outreachStatus, 'pending_review');
      assert.deepEqual(JSON.parse(result.activity.metadata), { origin: 'MANUAL' });
      assert.deepEqual(paths, ['/', '/leads', '/operations']);
    });
    await t.test('100-row preview against 5000 synthetic leads and full 100-row confirmation', async () => {
      for (let start = 0; start < 5000; start += 500) await prisma.lead.createMany({ data: Array.from({ length: 500 }, (_, j) => ({
        businessName: `Synthetic ${start + j}`, phone: `+4420${String(start + j).padStart(8, '0')}`, city: 'Synthetic',
      })) });
      const source = input(Array.from({ length: 100 }, (_, i) => `Performance ${i}\t+3399${String(i).padStart(8, '0')}`).join('\n'));
      const size = await prisma.lead.count(), started = performance.now();
      const preview = await service.previewBulkContacts(source, user);
      const elapsed = performance.now() - started;
      console.log(`PERFORMANCE: DB=${size} leads, preview=100 rows, elapsed=${Math.round(elapsed)}ms`);
      assert.equal(preview.rows.length, 100); assert.equal(preview.counts.new, 100);
      const latePage = await service.previewBulkContacts(input('Synthetic 4999\t+442000004999'), user);
      assert.equal(latePage.rows[0].status, 'DUPLICATE', 'dedup includes DB pages after first 500 records');
      const outcome = await service.confirmBulkContacts(request(source, preview), user);
      assert.equal(outcome.result.created, 100);
      assert.equal(await prisma.leadActivity.count({ where: { metadata: { contains: preview.batchId } } }), 100);
    });
  } finally {
    if (savedSecret === undefined) delete process.env.LEADFINDER_SESSION_SECRET; else process.env.LEADFINDER_SESSION_SECRET = savedSecret;
    await db.cleanup();
  }
});
