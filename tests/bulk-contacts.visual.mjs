import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, scryptSync } from 'node:crypto';
import { mkdtempSync, openSync, closeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { disposableBulkDatabase } from './helpers/bulk-postgres.mjs';
import { root } from './helpers/bulk-loader.mjs';

// Run explicitly. Local HTTP uses development auth policy, never production bypasses.
// All browser writes use this owned DB.
test('authenticated contacts browser QA on disposable PostgreSQL', { timeout: 240000 }, async t => {
  const db = await disposableBulkDatabase();
  const artifacts = mkdtempSync(path.join(tmpdir(), 'leadfinder-bulk-visual-'));
  const log = openSync(path.join(artifacts, 'server.log'), 'a');
  const password = randomBytes(24).toString('hex'), salt = randomBytes(16);
  const digest = scryptSync(password, salt, 64, { N: 131072, r: 8, p: 1, maxmem: 268435456 });
  const port = 3100;
  const base = `http://localhost:${port}`;
  let child, browser;
  try {
    child = spawn(process.execPath, [path.join(root, 'node_modules/next/dist/bin/next'), 'dev', '--webpack', '-p', String(port)], {
      cwd: root, windowsHide: true, stdio: ['ignore', log, log], env: { ...db.env, NODE_ENV: 'development', __NEXT_PROCESSED_ENV: 'true',
        LEADFINDER_ADMIN_USER: 'bulk-visual', LEADFINDER_ADMIN_PASSWORD_HASH: `scrypt$131072$8$1$${salt.toString('hex')}$${digest.toString('hex')}`,
        LEADFINDER_SESSION_SECRET: randomBytes(32).toString('hex'), LEADFINDER_APP_ORIGIN: base },
    });
    let ready = false;
    for (let i = 0; i < 100; i++) {
      assert.equal(child.exitCode, null, 'QA app exited; inspect artifact server.log');
      try { if ((await fetch(`${base}/login`)).ok) { ready = true; break; } } catch {}
      await delay(200);
    }
    assert.ok(ready);
    browser = await chromium.launch({ headless: true, channel: process.env.LEADFINDER_TEST_BROWSER_CHANNEL ?? (process.platform === 'win32' ? 'chrome' : undefined) });
    for (const width of [1440, 390]) await t.test(`contacts ${width}px paste/mapping/preview/override/result without horizontal overflow`, async () => {
      const context = await browser.newContext({ viewport: { width, height: 1000 } });
      const page = await context.newPage();
      page.setDefaultTimeout(20000);
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      const noOverflow = async () => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'horizontal page overflow');
      try {
        await page.goto(`${base}/contacts`);
        await page.waitForURL('**/login');
        await page.getByLabel('Usuario', { exact: true }).fill('bulk-visual');
        await page.locator('input[name=password]').fill(password);
        const loginResponse = page.waitForResponse(response => response.url() === `${base}/api/auth/login`);
        await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
        assert.equal((await loginResponse).headers().location, base + '/', 'QA login must succeed');
        await page.waitForURL(base + '/');
        await page.goto(`${base}/contacts`);
        await page.getByRole('heading', { name: 'Nuevo contacto manual', exact: true }).waitFor();
        await noOverflow();
        await page.getByRole('button', { name: 'Pegar lista', exact: true }).click();
        await page.getByLabel('Lista de contactos', { exact: true }).fill('"Unclosed,123456');
        await page.getByRole('button', { name: 'Detectar formato' }).click();
        await page.getByRole('alert').filter({ hasText: 'comillas' }).waitFor();
        await db.prisma.lead.create({ data: { businessName: `Existing ${width}`, phone: '123456' } });
        const row = [`New ${width}`, `+1202555${String(width).padStart(4, '0')}`, `https://qa-${width}.example/${'long'.repeat(30)}`, 'Servicios', 'Calle principal 123', 'Ciudad'];
        const text = [['Nombre', 'Teléfono', 'Web', 'Categoría', 'Dirección', 'Ciudad'], row, row,
          ['Invalid', 'abc', '', '', '', ''], [`Other ${width}`, '123456', '', '', '', '']].map(r => r.join('\t')).join('\n');
        await page.getByLabel('Lista de contactos', { exact: true }).fill(text);
        await page.getByRole('button', { name: 'Detectar formato' }).click();
        await page.getByLabel('La primera fila contiene encabezados').waitFor();
        assert.equal(await page.getByLabel('La primera fila contiene encabezados').isChecked(), true);
        await noOverflow();
        await page.screenshot({ path: path.join(artifacts, `mapping-${width}.png`), fullPage: true });
        await page.getByRole('button', { name: 'Ver preview', exact: true }).click();
        await page.getByRole('button', { name: 'Crear 1 contactos', exact: true }).waitFor();
        for (const status of ['NEW', 'DUPLICATE', 'INVALID', 'POSSIBLE_DUPLICATE']) assert.equal(await page.getByText(status, { exact: true }).count(), 1);
        assert.equal(await page.getByLabel('Crear fila 3', { exact: true }).isDisabled(), true);
        assert.equal(await page.getByLabel('Crear fila 4', { exact: true }).isDisabled(), true);
        assert.equal(await page.getByLabel('Crear fila 5', { exact: true }).isDisabled(), true);
        await noOverflow();
        await page.screenshot({ path: path.join(artifacts, `preview-${width}.png`), fullPage: true });
        await page.getByLabel('Es otro negocio').check();
        await page.getByLabel('Crear fila 5', { exact: true }).check();
        await page.getByRole('button', { name: 'Crear 2 contactos', exact: true }).click();
        await page.getByRole('heading', { name: '2 contactos incorporados al pipeline', exact: true }).waitFor();
        assert.equal(await db.prisma.lead.count({ where: { businessName: row[0] } }), 1);
        await noOverflow();
        await page.screenshot({ path: path.join(artifacts, `result-${width}.png`), fullPage: true });
        await page.getByRole('button', { name: 'Pegar otra lista', exact: true }).click();
        assert.equal(await page.getByLabel('Lista de contactos', { exact: true }).inputValue(), '');
        await page.getByLabel('Lista de contactos', { exact: true }).fill('Manual mapping,987654;unused');
        await page.getByRole('button', { name: 'Detectar formato' }).click();
        await page.getByLabel('Formato ambiguo: elegí el delimitador').selectOption(',');
        assert.equal(await page.getByLabel('La primera fila contiene encabezados').isChecked(), false);
        await page.getByLabel('Destino columna 1').selectOption('businessName');
        await page.getByLabel('Destino columna 2').selectOption('phone');
        await page.getByRole('button', { name: 'Ver preview', exact: true }).click();
        await page.getByText('INVALID', { exact: true }).waitFor();
        assert.equal(await page.getByRole('button', { name: 'Crear 0 contactos', exact: true }).isDisabled(), true);
        await noOverflow();
        await page.getByRole('button', { name: 'Alta individual', exact: true }).click();
        await page.getByRole('heading', { name: 'Nuevo contacto manual', exact: true }).waitFor();
        assert.deepEqual(errors, []);
      } catch (error) {
        await page.screenshot({ path: path.join(artifacts, `failure-${width}.png`), fullPage: true }).catch(() => undefined);
        throw error;
      } finally { await context.close(); }
    });
  } finally {
    await browser?.close();
    if (child && child.exitCode === null) {
      const exited = new Promise(resolve => child.once('exit', resolve));
      if (process.platform === 'win32') execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      else child.kill();
      await exited;
    }
    closeSync(log);
    await db.cleanup();
    console.log(`VISUAL ARTIFACTS: ${artifacts}`);
  }
});
