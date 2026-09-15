import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { loadBulk } from './helpers/bulk-loader.mjs';

const original = { ...process.env };
const restore = () => { for (const key of Object.keys(process.env)) if (!(key in original)) delete process.env[key]; Object.assign(process.env, original); };
test.afterEach(restore);
const { getLoginClientIp } = loadBulk('src/lib/auth/client-ip.ts');
const ipRequest = (headers = {}, url = 'http://localhost:3100/api/auth/login') => new Request(url, { headers });
function env(values) { delete process.env.VERCEL; delete process.env.LEADFINDER_TRUST_PROXY; Object.assign(process.env, { NODE_ENV: 'production', ...values }); }

test('IP: explicit local development fallback ignores forged headers', () => {
  env({ NODE_ENV: 'development', LEADFINDER_APP_ORIGIN: 'http://localhost:3100' });
  assert.equal(getLoginClientIp(ipRequest({ 'x-forwarded-for': '1.2.3.4', 'x-vercel-forwarded-for': '5.6.7.8' })), 'local-development');
  assert.throws(() => getLoginClientIp(ipRequest({}, 'https://public.example/api/auth/login')));
});
test('IP: production fails closed without configured ingress', () => {
  env({}); assert.throws(() => getLoginClientIp(ipRequest({ 'x-forwarded-for': '1.2.3.4', 'x-leadfinder-client-ip': '1.2.3.4' })));
});
test('IP: Vercel only uses platform header', () => {
  env({ VERCEL: '1' });
  assert.equal(getLoginClientIp(ipRequest({ 'x-vercel-forwarded-for': '203.0.113.4', 'x-forwarded-for': '1.2.3.4' })), '203.0.113.4');
  assert.throws(() => getLoginClientIp(ipRequest({ 'x-forwarded-for': '1.2.3.4' })));
});
test('IP: own Node requires explicit proxy and canonicalizes IPv6 and mapped IPv4', () => {
  env({ LEADFINDER_TRUST_PROXY: 'true' });
  for (const [input, expected] of [['2001:0DB8:0:0:0:0:0:1', '2001:db8::1'], ['::ffff:192.0.2.1', '192.0.2.1'], ['192.0.2.1', '192.0.2.1']]) {
    assert.equal(getLoginClientIp(ipRequest({ 'x-leadfinder-client-ip': input })), expected);
  }
  for (const value of ['1.2.3.4, 5.6.7.8', 'unknown', '1.2.3.4:123', '[::1]', 'fe80::1%eth0']) assert.throws(() => getLoginClientIp(ipRequest({ 'x-leadfinder-client-ip': value })));
  assert.throws(() => getLoginClientIp(ipRequest()));
});
test('normalization is confined to the limiter key', () => {
  const { normalizeLoginUsername } = loadBulk('src/lib/auth/login-rate-limit.ts', { '@/lib/prisma': { prisma: {} } });
  assert.equal(normalizeLoginUsername('  OPE\u0301RATOR  '), 'op\u00e9rator');
});
test('missing, malformed or reused secret fails before DB', async () => {
  const service = loadBulk('src/lib/auth/login-rate-limit.ts', { '@/lib/prisma': { prisma: { $transaction() { assert.fail('must not access DB'); } } } });
  process.env.LEADFINDER_SESSION_SECRET = randomBytes(32).toString('hex');
  for (const secret of ['', 'short', process.env.LEADFINDER_SESSION_SECRET.toUpperCase()]) {
    process.env.LEADFINDER_RATE_LIMIT_SECRET = secret;
    await assert.rejects(service.reserveLoginAttempt({ ip: '192.0.2.1', normalizedUsername: 'qa' }), /configuration unavailable/);
  }
});

function routeHarness({ admission = { allowed: true, retryAfterSeconds: null }, unavailable = false, ipFailure = false } = {}) {
  const events = [];
  const route = loadBulk('src/app/api/auth/login/route.ts', {
    '@/lib/auth/crypto': { hasTrustedOrigin: request => request.headers.get('origin') === 'https://qa.example', verifyOperatorPassword: async (user, password) => { events.push(['verify', user]); return user === 'Operator' && password === 'correct'; } },
    '@/lib/auth/session': { issueSession: async () => 'qa-token', sessionCookieName: () => 'qa-session', sessionCookieOptions: () => ({ httpOnly: true }) },
    '@/lib/auth/client-ip': { getLoginClientIp: () => { if (ipFailure) throw Error('untrusted'); return '192.0.2.1'; } },
    '@/lib/auth/login-rate-limit': { normalizeLoginUsername: user => user.trim().toLowerCase(), reserveLoginAttempt: async input => { events.push(['reserve', input.normalizedUsername]); if (unavailable) throw Error('DB unavailable'); return admission; } },
  });
  process.env.LEADFINDER_APP_ORIGIN = 'https://qa.example';
  const request = (user = 'Operator', password = 'correct', headers = {}) => new Request('https://qa.example/api/auth/login', { method: 'POST', headers: { origin: 'https://qa.example', 'content-type': 'application/x-www-form-urlencoded', ...headers }, body: new URLSearchParams({ user, password }) });
  return { ...route, events, request };
}
test('route: reservation precedes verification; exact username and success preserved', async () => {
  const h = routeHarness(); const response = await h.POST(h.request());
  assert.deepEqual(h.events, [['reserve', 'operator'], ['verify', 'Operator']]);
  assert.equal(response.status, 303); assert.equal(response.headers.get('location'), 'https://qa.example/');
  assert.match(response.headers.get('set-cookie'), /qa-session=qa-token/);
  assert.equal((await h.POST(h.request('operator'))).headers.get('location'), 'https://qa.example/login?error=1');
});
test('route: invalid username/password indistinguishable', async () => {
  const h = routeHarness(); const a = await h.POST(h.request('absent')), b = await h.POST(h.request('Operator', 'wrong'));
  assert.equal(a.status, 303); assert.equal(a.headers.get('location'), b.headers.get('location'));
  assert.equal(a.headers.get('set-cookie'), null); assert.equal(b.headers.get('set-cookie'), null);
});
test('route: 429 native HTML, generic response, no password verification', async () => {
  const h = routeHarness({ admission: { allowed: false, retryAfterSeconds: 42 } });
  const a = await h.POST(h.request()), b = await h.POST(h.request('absent'));
  assert.equal(a.status, 429); assert.equal(a.headers.get('retry-after'), '42'); assert.equal(a.headers.get('cache-control'), 'no-store');
  assert.match(a.headers.get('content-type'), /text\/html/);
  const html = await a.text(); assert.equal(html, await b.text());
  assert.match(html, /No se pudo iniciar sesión\. Intentá nuevamente más tarde\./); assert.match(html, /href="\/login"/);
  assert.doesNotMatch(html, /Operator|absent|192\.0|ip_user|count/); assert.ok(h.events.every(e => e[0] === 'reserve'));
});
test('route: DB/config or trusted IP failure returns 503 without scrypt', async () => {
  for (const config of [{ unavailable: true }, { ipFailure: true }]) {
    const h = routeHarness(config), response = await h.POST(h.request());
    assert.equal(response.status, 503); assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('set-cookie'), null); assert.ok(h.events.every(e => e[0] !== 'verify'));
  }
});
test('route: origin, body and format rejected before reservation', async () => {
  const h = routeHarness();
  assert.equal((await h.POST(h.request('Operator', 'correct', { origin: 'https://evil.example' }))).status, 403);
  for (const req of [h.request('x'.repeat(257)), h.request('Operator', 'x'.repeat(1025)), h.request('x'.repeat(9000)), h.request('Operator', 'correct', { 'content-type': 'application/json' })]) assert.equal((await h.POST(req)).status, 303);
  assert.deepEqual(h.events, []);
});
