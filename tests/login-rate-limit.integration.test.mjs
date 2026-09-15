import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { loadBulk } from './helpers/bulk-loader.mjs';
import { disposableBulkDatabase } from './helpers/bulk-postgres.mjs';

test('login limiter: real disposable PostgreSQL reservations', { timeout: 180000 }, async t => {
  const db = await disposableBulkDatabase(), { prisma } = db;
  const oldSecret = process.env.LEADFINDER_RATE_LIMIT_SECRET;
  process.env.LEADFINDER_RATE_LIMIT_SECRET = randomBytes(32).toString('hex');
  const service = (client = prisma) => loadBulk('src/lib/auth/login-rate-limit.ts', { '@/lib/prisma': { prisma: client } });
  const limiter = service();
  const reserve = (ip = '192.0.2.1', user = 'qa-operator') => limiter.reserveLoginAttempt({ ip, normalizedUsername: limiter.normalizeLoginUsername(user) });
  const clear = () => prisma.loginRateLimit.deleteMany();
  try {
    await t.test('five admitted; sixth blocked; rejection changes neither counter nor expiry', async () => {
      for (let i = 0; i < 5; i++) assert.equal((await reserve()).allowed, true);
      const before = await prisma.loginRateLimit.findMany({ orderBy: { keyHash: 'asc' } });
      const blocked = await reserve(); assert.equal(blocked.allowed, false); assert.ok(blocked.retryAfterSeconds > 0 && blocked.retryAfterSeconds <= 900);
      assert.deepEqual(await prisma.loginRateLimit.findMany({ orderBy: { keyHash: 'asc' } }), before);
      assert.equal((await reserve('192.0.2.1', ' QA-OPERATOR ')).allowed, false);
    });
    await t.test('different username shares IP budget; different IP independent', async () => {
      assert.equal((await reserve('192.0.2.1', 'other')).allowed, true);
      assert.equal((await reserve('192.0.2.2')).allowed, true);
      assert.equal((await prisma.loginRateLimit.findFirst({ where: { scope: 'ip', count: 6 } })).count, 6);
    });
    await t.test('twenty per IP; twenty-first denied even with new username', async () => {
      await clear(); for (let i = 0; i < 20; i++) assert.equal((await reserve('192.0.2.1', `user-${i}`)).allowed, true);
      assert.equal((await reserve('192.0.2.1', 'user-21')).allowed, false);
      assert.equal(await prisma.loginRateLimit.count(), 21);
    });
    await t.test('twenty concurrent reservations across services admit exactly five', async () => {
      await clear(); const results = await Promise.all(Array.from({ length: 20 }, () => service().reserveLoginAttempt({ ip: '192.0.2.1', normalizedUsername: 'qa' })));
      assert.equal(results.filter(r => r.allowed).length, 5);
      assert.deepEqual((await prisma.loginRateLimit.findMany()).map(r => r.count), [5, 5]);
    });
    await t.test('aggregate concurrency across usernames admits exactly twenty', async () => {
      await clear(); const results = await Promise.all(Array.from({ length: 30 }, (_, i) => reserve('192.0.2.1', `user-${i}`)));
      assert.equal(results.filter(r => r.allowed).length, 20);
    });
    await t.test('DB-clock expiration starts a fresh fixed window without waiting', async () => {
      await clear(); for (let i = 0; i < 5; i++) await reserve();
      await prisma.$executeRaw`UPDATE "LoginRateLimit" SET "expiresAt" = (clock_timestamp() AT TIME ZONE 'UTC') - interval '1 second'`;
      assert.equal((await reserve()).allowed, true);
      for (const row of await prisma.loginRateLimit.findMany()) { assert.equal(row.count, 1); assert.equal(row.expiresAt - row.windowStartedAt, 900000); }
    });
    await t.test('success consumes budget, never resets; actual route uses committed reservation', async () => {
      await clear(); process.env.LEADFINDER_APP_ORIGIN = 'https://qa.example';
      const route = loadBulk('src/app/api/auth/login/route.ts', {
        '@/lib/auth/login-rate-limit': limiter, '@/lib/auth/client-ip': { getLoginClientIp: () => '192.0.2.1' },
        '@/lib/auth/crypto': { hasTrustedOrigin: () => true, verifyOperatorPassword: async () => { assert.equal((await prisma.loginRateLimit.findFirst({ where: { scope: 'ip_user' } })).count > 0, true); return true; } },
        '@/lib/auth/session': { issueSession: async () => 'token', sessionCookieName: () => 'qa', sessionCookieOptions: () => ({}) },
      });
      const request = () => new Request('https://qa.example/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'user=qa-operator&password=not-persisted' });
      for (let i = 0; i < 5; i++) assert.equal((await route.POST(request())).status, 303);
      assert.equal((await route.POST(request())).status, 429);
      assert.equal((await prisma.loginRateLimit.findFirst({ where: { scope: 'ip_user' } })).count, 5);
    });
    await t.test('privacy: only opaque HMAC, scope, count and window stored', async () => {
      const rows = await prisma.loginRateLimit.findMany();
      assert.doesNotMatch(JSON.stringify(rows), /192\.0\.2\.1|qa-operator|not-persisted/);
      for (const row of rows) { assert.match(row.keyHash, /^[0-9a-f]{64}$/); assert.deepEqual(Object.keys(row).sort(), ['count', 'expiresAt', 'keyHash', 'scope', 'windowStartedAt'].sort()); }
    });
    await t.test('cleanup is bounded; cleanup failure does not revoke reservation', async () => {
      await clear(); await prisma.loginRateLimit.createMany({ data: Array.from({ length: 150 }, (_, i) => ({ keyHash: `expired-${i}`, scope: 'ip', count: 1, windowStartedAt: new Date(0), expiresAt: new Date(1) })) });
      await reserve(); assert.equal(await prisma.loginRateLimit.count({ where: { expiresAt: { lt: new Date() } } }), 50);
      const brokenCleanup = { $transaction: prisma.$transaction.bind(prisma), $executeRaw: async () => { throw Error('cleanup unavailable'); } };
      assert.equal((await service(brokenCleanup).reserveLoginAttempt({ ip: '192.0.2.2', normalizedUsername: 'qa' })).allowed, true);
    });
    await t.test('partial reservation rolls back both buckets; DB errors propagate', async () => {
      await clear();
      const broken = { $transaction: (fn, options) => prisma.$transaction(tx => fn(new Proxy(tx, { get(target, key) {
        if (key === 'loginRateLimit') return { findMany: tx.loginRateLimit.findMany.bind(tx.loginRateLimit), upsert: async args => { if (args.create.scope === 'ip_user') throw Error('forced second bucket failure'); return tx.loginRateLimit.upsert(args); } };
        return Reflect.get(target, key);
      } })), options) };
      await assert.rejects(service(broken).reserveLoginAttempt({ ip: '192.0.2.1', normalizedUsername: 'qa' }), /forced second/);
      assert.equal(await prisma.loginRateLimit.count(), 0);
    });
  } finally { if (oldSecret === undefined) delete process.env.LEADFINDER_RATE_LIMIT_SECRET; else process.env.LEADFINDER_RATE_LIMIT_SECRET = oldSecret; await db.cleanup(); }
});
