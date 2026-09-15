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
test('Leads filters and origin browser QA on disposable PostgreSQL', { timeout: 360000 }, async t => {
  const db = await disposableBulkDatabase();
  const artifacts = mkdtempSync(path.join(tmpdir(), 'leadfinder-origin-visual-'));
  const log = openSync(path.join(artifacts, 'server.log'), 'a');
  const password = randomBytes(24).toString('hex'), salt = randomBytes(16);
  const digest = scryptSync(password, salt, 64, { N: 131072, r: 8, p: 1, maxmem: 268435456 });
  const port = 3101;
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
    for (const origin of ["SEARCH", "MANUAL"]) await db.prisma.lead.createMany({ data: Array.from({ length: 25 }, (_, i) => ({
      businessName: `${origin} clinic ${String(i).padStart(2, "0")}`, origin, commercialStatus: "new", score: i,
    })) });
    for (const width of [1440, 390]) await t.test(`Leads ${width}px URL, filters, badges and drawer`, async () => {
      const context = await browser.newContext({ viewport: { width, height: 1000 } });
      const page = await context.newPage(); page.setDefaultTimeout(30000);
      const errors = []; page.on("pageerror", e => errors.push(e.message));
      const origin = page.getByLabel("Origen", { exact: true });
      const commercial = page.getByLabel("Estado comercial", { exact: true });
      const other = page.getByLabel("Otros filtros", { exact: true });
      const noOverflow = async () => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "horizontal overflow");
      const apply = async () => { await Promise.all([page.waitForNavigation(), page.getByRole("button", { name: "Aplicar", exact: true }).click()]); };
      const params = () => new URL(page.url()).searchParams;
      try {
        await page.goto(`${base}/leads`); await page.waitForURL("**/login");
        await page.getByLabel("Usuario", { exact: true }).fill("bulk-visual");
        await page.locator("input[name=password]").fill(password);
        await page.getByRole("button", { name: "Ingresar", exact: true }).click(); await page.waitForURL(base + "/");
        await page.goto(`${base}/leads?origin=manual&q=clinic&filter=new&sort=name-asc&page=2&pageSize=20`);
        assert.equal(await origin.inputValue(), "manual"); assert.equal(await commercial.inputValue(), "new"); assert.equal(await other.inputValue(), "all");
        await noOverflow();
        await page.screenshot({ path: path.join(artifacts, `leads-${width}.png`), fullPage: true, caret: "initial" });
        assert.ok(await page.locator("article").filter({ has: page.getByRole("heading", { level: 4 }) }).count() > 0);
        const row = page.locator("article").filter({ has: page.getByRole("heading", { name: /MANUAL clinic/ }) }).first();
        await row.getByText("Manual", { exact: true }).waitFor();
        await row.getByRole("button", { name: "Detalle", exact: true }).click();
        await page.getByText("Origen: Manual", { exact: true }).waitFor(); await noOverflow();
        await page.screenshot({ path: path.join(artifacts, `drawer-${width}.png`), fullPage: false, caret: "initial" });
        await page.getByRole("button", { name: "Cerrar detalle" }).click();
        await origin.selectOption("search"); await apply();
        assert.deepEqual(Object.fromEntries(params()), { page: "1", q: "clinic", origin: "search", filter: "new", sort: "name-asc", pageSize: "20" });
        const searchRow = page.locator("article").filter({ has: page.getByRole("heading", { name: /SEARCH clinic/ }) }).first();
        await searchRow.getByText("Búsqueda", { exact: true }).waitFor();
        await searchRow.getByRole("button", { name: "Detalle", exact: true }).click();
        await page.getByText("Origen: Búsqueda", { exact: true }).waitFor(); await page.getByRole("button", { name: "Cerrar detalle" }).click();
        await page.getByRole("link", { name: "Siguiente", exact: true }).click(); await page.waitForURL(/page=2/);
        assert.equal(params().get("origin"), "search"); assert.equal(params().get("filter"), "new"); assert.equal(params().get("q"), "clinic"); assert.equal(params().get("sort"), "name-asc");
        await page.reload(); assert.equal(await origin.inputValue(), "search"); assert.equal(await commercial.inputValue(), "new");
        await commercial.selectOption("reviewed"); await apply(); assert.equal(params().get("page"), "1"); assert.equal(params().get("filter"), "reviewed");
        await other.selectOption("no-website"); assert.equal(await commercial.inputValue(), "all"); await apply();
        assert.equal(params().get("filter"), "no-website"); assert.equal(params().getAll("filter").length, 1);
        await page.reload(); assert.equal(await other.inputValue(), "no-website"); assert.equal(await commercial.inputValue(), "all");
        await commercial.selectOption("new"); assert.equal(await other.inputValue(), "all");
        await page.locator("select[name=pageSize]").selectOption("50"); await page.locator("select[name=sort]").selectOption("recent-desc"); await apply();
        assert.equal(params().get("origin"), "search"); assert.equal(params().get("pageSize"), "50"); assert.equal(params().get("sort"), "recent-desc"); assert.equal(params().get("q"), "clinic");
        await page.locator("input[name=q]").fill("clinic 00"); await apply(); assert.equal(params().get("origin"), "search");
        for (const value of ["", "?origin=", "?origin=invalid", "?origin=all"]) { await page.goto(`${base}/leads${value}`); assert.equal(await origin.inputValue(), "all"); }
        await apply(); assert.equal(params().get("origin"), "all");
        await page.getByRole("link", { name: "Limpiar", exact: true }).click(); await page.waitForURL("**/leads?origin=all");
        await page.goto(`${base}/operations?filter=marked`);
        assert.equal(await origin.count(), 0); assert.equal(await commercial.count(), 0);
        assert.equal(await page.locator("select[name=filter]").inputValue(), "marked");
        assert.deepEqual(await page.locator("select[name=filter] option").evaluateAll(nodes => nodes.map(n => n.value)), ["all", "no-website", "marked", "ready", "with-follow-up", "without-follow-up", "follow-up-today", "follow-up-overdue"]);
        assert.deepEqual(errors, []);
      } catch (error) { await page.screenshot({ path: path.join(artifacts, `failure-${width}.png`), fullPage: true, caret: "initial" }).catch(() => undefined); throw error; }
      finally { await context.close(); }
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
