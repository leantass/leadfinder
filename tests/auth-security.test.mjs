import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { randomBytes, scryptSync } from 'node:crypto';
import ts from 'typescript';
import * as jose from 'jose';

const require = createRequire(import.meta.url);
const root = new URL('../', import.meta.url);
const password = randomBytes(32).toString('hex');
const salt = randomBytes(16);
const hash = scryptSync(password, salt, 64, { N: 131072, r: 8, p: 1, maxmem: 268435456 });
const environment = { ...process.env };
process.env.LEADFINDER_ADMIN_USER = 'qa-operator';
process.env.LEADFINDER_ADMIN_PASSWORD_HASH = `scrypt$131072$8$1$${salt.toString('hex')}$${hash.toString('hex')}`;
process.env.LEADFINDER_SESSION_SECRET = randomBytes(32).toString('hex');
process.env.LEADFINDER_APP_ORIGIN = 'http://localhost:3000';
process.env.NODE_ENV = 'test';
test.after(() => {
  for (const key of Object.keys(process.env)) if (!(key in environment)) delete process.env[key];
  Object.assign(process.env, environment);
});

// Compile the actual TS modules in memory. Only explicitly supplied dependencies
// can load: Prisma, scrapers and the real runner can never enter this harness.
function load(file, mocks = {}) {
  const code = ts.transpileModule(readFileSync(new URL(file, root), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: file,
  }).outputText;
  const compiledModule = { exports: {} };
  function safeRequire(id) {
    if (Object.hasOwn(mocks, id)) return mocks[id];
    if (id === 'server-only') return {};
    if (id === 'jose') return jose;
    if (id === 'node:crypto' || id === 'next/server') return require(id);
    throw new Error(`Unmocked dependency: ${id}`);
  }
  new Function('require', 'module', 'exports', code)(safeRequire, compiledModule, compiledModule.exports);
  return compiledModule.exports;
}
const crypto = load('src/lib/auth/crypto.ts');
const session = load('src/lib/auth/session.ts', { '@/lib/auth/crypto': crypto });
let cookie;
const redirectError = new Error('UNAUTHENTICATED_REDIRECT');
const operator = load('src/lib/auth/operator.ts', {
  '@/lib/auth/session': session,
  'next/headers': { cookies: async () => ({ get: () => cookie ? { value: cookie } : undefined }) },
  'next/navigation': { redirect: () => { throw redirectError; } },
});
const authMocks = { '@/lib/auth/crypto': crypto, '@/lib/auth/session': session, '@/lib/auth/operator': operator };
const login = load('src/app/api/auth/login/route.ts', authMocks);
const logout = load('src/app/api/auth/logout/route.ts', authMocks);
const proxy = load('src/proxy.ts', authMocks);
const request = (path, options = {}) => new Request(`http://localhost:3000${path}`, options);
function loginRequest(user, pass, origin = 'http://localhost:3000') {
  return request('/api/auth/login', { method: 'POST', headers: {
    'content-type': 'application/x-www-form-urlencoded', ...(origin ? { origin } : {}),
  }, body: new URLSearchParams({ user, password: pass }) });
}

test('session: valid, altered, expired, wrong secret, identity and claims', async () => {
  const token = await session.issueSession();
  assert.equal((await session.verifySession(token)).user, 'qa-operator');
  const parts = token.split('.');
  parts[1] = Buffer.from(JSON.stringify({ sub: 'attacker' })).toString('base64url');
  assert.equal(await session.verifySession(parts.join('.')), null);
  const key = Buffer.from(process.env.LEADFINDER_SESSION_SECRET, 'hex');
  const now = Math.floor(Date.now() / 1000);
  for (const overrides of [
    { iat: now - 28801, exp: now - 1 }, { iss: 'other' }, { aud: 'other' },
    { sub: 'other' }, { nonce: undefined }, { exp: now + 86400 },
  ]) {
    const invalid = await new jose.SignJWT({ iss: 'LeadFinder', aud: 'LeadFinder', sub: 'qa-operator',
      iat: now, exp: now + 28800, nonce: randomBytes(32).toString('hex'), ...overrides })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' }).sign(key);
    assert.equal(await session.verifySession(invalid), null);
  }
  const saved = process.env.LEADFINDER_SESSION_SECRET;
  process.env.LEADFINDER_SESSION_SECRET = randomBytes(32).toString('hex');
  assert.equal(await session.verifySession(token), null);
  delete process.env.LEADFINDER_SESSION_SECRET;
  assert.equal(await session.verifySession(token), null);
  process.env.LEADFINDER_SESSION_SECRET = saved;
});

test('login: missing/wrong Origin rejected; invalid credentials indistinguishable', async () => {
  for (const origin of [null, 'https://evil.example']) {
    assert.equal((await login.POST(loginRequest('qa-operator', password, origin))).status, 403);
  }
  const wrongUser = await login.POST(loginRequest('wrong', password));
  const wrongPass = await login.POST(loginRequest('qa-operator', 'wrong'));
  assert.equal(wrongUser.status, 303);
  assert.equal(wrongUser.headers.get('location'), wrongPass.headers.get('location'));
  assert.equal(wrongUser.headers.get('set-cookie'), null);
  assert.equal(wrongPass.headers.get('set-cookie'), null);
});

test('login/logout: fresh tokens, cookie flags, origin and session required', async () => {
  const response = await login.POST(loginRequest('qa-operator', password));
  assert.equal(response.status, 303);
  const setCookie = response.headers.get('set-cookie');
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=lax/i);
  assert.match(setCookie, /Max-Age=28800/i);
  assert.doesNotMatch(setCookie, /Domain=/i);
  cookie = setCookie.split(';')[0].split('=').slice(1).join('=');
  assert.ok(await session.verifySession(cookie));
  assert.notEqual(cookie, await session.issueSession());
  assert.equal((await logout.POST(request('/api/auth/logout', { method: 'POST' }))).status, 403);
  const out = await logout.POST(request('/api/auth/logout', { method: 'POST', headers: { origin: 'http://localhost:3000' } }));
  assert.match(out.headers.get('set-cookie'), /Max-Age=0/i);
  cookie = undefined;
  await assert.rejects(() => logout.POST(request('/api/auth/logout', { method: 'POST', headers: { origin: 'http://localhost:3000' } })), e => e === redirectError);
  process.env.NODE_ENV = 'production';
  assert.equal(session.sessionCookieName(), '__Host-leadfinder-session');
  assert.equal(session.sessionCookieOptions().secure, true);
  process.env.NODE_ENV = 'test';
});

test('proxy: private routes including RSC/prefetch reject anonymous; public login and cron', async () => {
  const { NextRequest } = require('next/server');
  for (const path of ['/', '/leads', '/operations', '/contacts', '/api/private', '/private.csv', '/operations?_rsc=qa']) {
    const response = await proxy.proxy(new NextRequest(`http://localhost:3000${path}`, { headers: { RSC: '1', 'Next-Router-Prefetch': '1' } }));
    assert.equal(response.status, 303);
    assert.equal(new URL(response.headers.get('location')).pathname, '/login');
  }
  for (const path of ['/login', '/api/auth/login', '/api/automation/run-due-schedules']) {
    assert.equal((await proxy.proxy(new NextRequest(`http://localhost:3000${path}`))).status, 200);
  }
  const token = await session.issueSession();
  assert.equal((await proxy.proxy(new NextRequest('http://localhost:3000/operations', { headers: { cookie: `${session.sessionCookieName()}=${token}` } }))).status, 200);
});

test('proxy matcher exempts only static assets and the exact favicon', () => {
  // Next 16.2.3 retains the old name for this testing helper.
  const { unstable_doesMiddlewareMatch } = require('next/experimental/testing/server');
  for (const url of ['/_next/static/chunks/app.js', '/favicon.ico']) {
    assert.equal(unstable_doesMiddlewareMatch({ config: proxy.config, url }), false);
  }
  for (const url of ['/faviconXico', '/private.svg', '/_next/image', '/operations?_rsc=qa']) {
    assert.equal(unstable_doesMiddlewareMatch({ config: proxy.config, url }), true);
  }
});

const forbidden = new Proxy(function () { throw new Error('BUSINESS EFFECT ATTEMPTED'); }, {
  get: () => forbidden, apply: () => { throw new Error('BUSINESS EFFECT ATTEMPTED'); },
});
const actions = load('src/app/actions.ts', {
  ...authMocks, 'next/cache': forbidden, '@/lib/prisma': forbidden,
  '@/lib/lead-commercial': forbidden, '@/lib/leads/lead-ui': forbidden,
  '@/lib/leads/manual-lead': forbidden, '@/lib/automation/schedule-runner': forbidden,
  '@/services/search-jobs': forbidden,
});
for (const [name, action] of Object.entries(actions)) {
  test(`anonymous Server Action rejected before business effects: ${name}`, async () => {
    cookie = undefined;
    await assert.rejects(() => action({}, new FormData()), e => e === redirectError);
  });
}
test('all twelve mutating actions covered', () => assert.equal(Object.keys(actions).length, 12));

const reads = load('src/lib/workspace-data.ts', {
  ...authMocks, '@/lib/prisma': forbidden, '@/lib/leads/list-query': forbidden,
});
for (const [name, read] of Object.entries(reads).filter(([name, value]) => name !== 'getLeadIdsForListContext' && typeof value === 'function' && value.constructor.name === 'AsyncFunction')) {
  test(`anonymous workspace read rejected before Prisma: ${name}`, async () => {
    cookie = undefined;
    await assert.rejects(() => read({}), e => e === redirectError);
  });
}

test('empty schedules: authenticated read returns [] and never creates', async () => {
  cookie = await session.issueSession();
  let finds = 0;
  const workspace = load('src/lib/workspace-data.ts', {
    ...authMocks, '@/lib/leads/list-query': forbidden,
    '@/lib/prisma': { prisma: { automationSchedule: {
      findMany: async () => { finds++; return []; }, create: forbidden,
    } } },
  });
  assert.deepEqual(await workspace.getAutomationSchedules(), []);
  assert.equal(finds, 1);
  cookie = undefined;
});

test('internal runner query remains independent of human sessions', async () => {
  cookie = undefined;
  const queryHelpers = load('src/lib/leads/list-query.ts');
  const workspace = load('src/lib/workspace-data.ts', {
    ...authMocks, '@/lib/leads/list-query': queryHelpers,
    '@/lib/prisma': { prisma: { lead: { findMany: async () => [] } } },
  });
  assert.deepEqual((await workspace.getLeadIdsForListContext({})).leadIds, []);
});

test('runner GET/POST: authorization and fail closed; valid secret calls only stub', async () => {
  let runs = 0;
  const runner = load('src/app/api/automation/run-due-schedules/route.ts', {
    ...authMocks, 'next/cache': { revalidatePath() {} },
    '@/lib/automation/schedule-runner': { runDueAutomationSchedules: async () => { runs++; return { ok: true }; } },
  });
  process.env.AUTOMATION_RUNNER_SECRET = randomBytes(32).toString('hex');
  for (const method of ['GET', 'POST']) {
    for (const headers of [{}, { authorization: 'Bearer wrong' }]) {
      assert.equal((await runner[method](request('/api/automation/run-due-schedules', { method, headers }))).status, 401);
    }
    assert.equal(runs, method === 'GET' ? 0 : 2);
    for (const headers of [{ authorization: `Bearer ${process.env.AUTOMATION_RUNNER_SECRET}` }, { 'x-automation-runner-secret': process.env.AUTOMATION_RUNNER_SECRET }]) {
      assert.equal((await runner[method](request('/api/automation/run-due-schedules', { method, headers }))).status, 200);
    }
  }
  assert.equal(runs, 4);
  delete process.env.AUTOMATION_RUNNER_SECRET;
  assert.equal((await runner.GET(request('/api/automation/run-due-schedules'))).status, 500);
  assert.equal(runs, 4);
});
