import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, scryptSync } from 'node:crypto';
import { SignJWT } from 'jose';
import { closeSync, mkdtempSync, openSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { disposableBulkDatabase } from './helpers/bulk-postgres.mjs';
import { root } from './helpers/bulk-loader.mjs';

test('UX 1.0 pages at desktop and mobile widths', { timeout: 360000 }, async t => {
  const db = await disposableBulkDatabase();
  const artifacts = mkdtempSync(path.join(tmpdir(), 'leadfinder-ux-visual-'));
  const log = openSync(path.join(artifacts, 'server.log'), 'a');
  const password = randomBytes(24).toString('hex');
  const salt = randomBytes(16);
  const digest = scryptSync(password, salt, 64, { N: 131072, r: 8, p: 1, maxmem: 268435456 });
  const sessionSecret = randomBytes(32).toString('hex');
  const now = Math.floor(Date.now() / 1000);
  const session = await new SignJWT({ nonce: randomBytes(32).toString('hex') })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer('LeadFinder').setAudience('LeadFinder').setSubject('ux-visual')
    .setIssuedAt(now).setExpirationTime(now + 8 * 60 * 60)
    .sign(Buffer.from(sessionSecret, 'hex'));
  const port = 3102;
  const base = `http://localhost:${port}`;
  let child;
  let browser;

  try {
    child = spawn(process.execPath, [path.join(root, 'node_modules/next/dist/bin/next'), 'start', '-p', String(port)], {
      cwd: root,
      windowsHide: true,
      stdio: ['ignore', log, log],
      env: {
        ...db.env,
        NODE_ENV: 'production',
        __NEXT_PROCESSED_ENV: 'true',
        LEADFINDER_ADMIN_USER: 'ux-visual',
        LEADFINDER_ADMIN_PASSWORD_HASH: `scrypt$131072$8$1$${salt.toString('hex')}$${digest.toString('hex')}`,
        LEADFINDER_SESSION_SECRET: sessionSecret,
        LEADFINDER_APP_ORIGIN: base,
      },
    });

    let ready = false;
    for (let i = 0; i < 100; i++) {
      assert.equal(child.exitCode, null, 'QA app exited; inspect server.log');
      try {
        if ((await fetch(`${base}/login`)).ok) { ready = true; break; }
      } catch {}
      await delay(200);
    }
    assert.ok(ready, 'QA app did not become ready');

    browser = await chromium.launch({
      headless: true,
      channel: process.env.LEADFINDER_TEST_BROWSER_CHANNEL ?? (process.platform === 'win32' ? 'chrome' : undefined),
    });

    for (const width of [1440, 390]) await t.test(`${width}px`, async () => {
      const context = await browser.newContext({ viewport: { width, height: 1000 } });
      await context.addCookies([{ name: '__Host-leadfinder-session', value: session, domain: 'localhost', path: '/', httpOnly: true, secure: true, sameSite: 'Lax' }]);
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      for (const route of ['/', '/searches', '/contacts', '/leads', '/operations']) {
        await page.goto(base + route);
        await page.locator('nav').waitFor();
        assert.deepEqual(await page.locator('nav a').evaluateAll(nodes => nodes.map(node => node.getAttribute('href'))), ['/', '/searches', '/contacts', '/leads', '/operations']);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${route} has horizontal overflow at ${width}px`);
        const visible = await page.locator('body').innerText();
        assert.doesNotMatch(visible, /\b(?:Online|Workspace|CORE|AUTO)\b/);
        if (route === '/searches') assert.doesNotMatch(visible, /\b(?:jobs?|input|scraping|pipeline)\b/i);
        if (route === '/leads') assert.doesNotMatch(visible, /\b(?:server-side|query|drawer|website|HOT|WARM|COLD)\b/i);
        if (route === '/operations') assert.doesNotMatch(visible, /\b(?:runner|schedules|quiet hours|score-desc|executionKey)\b/i);
        await page.screenshot({ path: path.join(artifacts, `${route === '/' ? 'dashboard' : route.slice(1)}-${width}.png`), fullPage: true });
      }
      assert.deepEqual(errors, []);
      await context.close();
    });
  } finally {
    await browser?.close();
    if (child && child.exitCode === null) {
      const exited = new Promise(resolve => child.once('exit', () => resolve(true)));
      assert.equal(child.kill('SIGTERM'), true, 'QA app did not accept the shutdown signal');
      assert.equal(await Promise.race([exited, delay(5000).then(() => false)]), true, 'QA app did not exit after the shutdown signal');
    }
    closeSync(log);
    await db.cleanup();
    console.log(`VISUAL ARTIFACTS: ${artifacts}`);
  }
});
