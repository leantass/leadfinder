import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import ts from 'typescript';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadBulk, root } from './helpers/bulk-loader.mjs';
import { disposableBulkDatabase } from './helpers/bulk-postgres.mjs';

const require = createRequire(import.meta.url);
const modules = new Map();
function loadPanel(file) {
  const resolved = path.resolve(root, file);
  if (modules.has(resolved)) return modules.get(resolved);
  const code = ts.transpileModule(readFileSync(resolved, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    fileName: resolved,
  }).outputText;
  const compiledModule = { exports: {} };
  const dependency = id => {
    if (id === 'next/navigation') return { useRouter: () => ({ refresh() {} }) };
    if (id === '@/app/actions') return new Proxy({}, { get: () => () => { throw new Error('No actions during render'); } });
    if (id === '@/lib/prisma') throw new Error('Application database forbidden');
    if (id.startsWith('@/') || id.startsWith('.')) {
      const base = id.startsWith('@/') ? path.join(root, 'src', id.slice(2)) : path.resolve(path.dirname(resolved), id);
      const target = ['.ts', '.tsx'].map(ext => base + ext).find(existsSync);
      assert.ok(target, id);
      return loadPanel(target);
    }
    return require(id);
  };
  new Function('require', 'module', 'exports', code)(dependency, compiledModule, compiledModule.exports);
  modules.set(resolved, compiledModule.exports);
  return compiledModule.exports;
}
const { LeadsPanel } = loadPanel('src/components/leads-panel.tsx');
const renderIds = (leads, sort) => {
  const html = renderToStaticMarkup(createElement(LeadsPanel, {
    leads, initialSortBy: sort, showListingControls: false,
  }));
  assert.doesNotMatch(html, /No hay leads en esta prioridad/);
  return [...html.matchAll(/id="select-lead-([^"]+)"/g)].map(match => match[1]);
};

test('all five sorts preserve PostgreSQL order through normalization and actual LeadsPanel render', { timeout: 180000 }, async t => {
  const db = await disposableBulkDatabase();
  try {
    const { prisma } = db;
    const { getPaginatedLeadsForPanel: list } = loadBulk('src/lib/workspace-data.ts', {
      '@/lib/prisma': { prisma }, '@/lib/auth/operator': { async requireAuthenticatedOperator() {} },
    });
    const fixtures = [
      ['a', 'Clínica Sur', 100, 'real', 1, '2026-09-10T08:00:00Z'],
      ['b', 'Estudio Norte', 20, 'unknown', 2, '2026-09-11T08:00:00Z'],
      ['c', 'Panadería Central', 90, 'unknown', 3, '2026-09-12T08:00:00Z'],
      ['d', 'Zeta', 10, 'real', 4, null],
    ];
    for (const [id, businessName, score, websiteType, day, due] of fixtures) {
      await prisma.lead.create({ data: { id, businessName, score, websiteType,
        phone: '+5491112345678', origin: id === 'b' ? 'MANUAL' : 'SEARCH',
        scrapedAt: new Date(`2026-09-0${day}T12:00:00Z`), followUpDueAt: due ? new Date(due) : null,
      } });
    }
    const cases = [
      ['score-desc', [{ score: 'desc' }, { scrapedAt: 'desc' }], ['a', 'c', 'b', 'd']],
      ['recent-desc', [{ scrapedAt: 'desc' }], ['d', 'c', 'b', 'a']],
      ['name-asc', [{ businessName: 'asc' }, { scrapedAt: 'desc' }], ['a', 'b', 'c', 'd']],
      ['follow-up-asc', [{ followUpDueAt: { sort: 'asc', nulls: 'last' } }, { scrapedAt: 'desc' }], ['a', 'b', 'c', 'd']],
      ['follow-up-desc', [{ followUpDueAt: { sort: 'desc', nulls: 'last' } }, { scrapedAt: 'desc' }], ['c', 'b', 'a', 'd']],
    ];
    for (const [sort, orderBy, expected] of cases) await t.test(sort, async () => {
      assert.deepEqual((await prisma.lead.findMany({ orderBy })).map(l => l.id), expected);
      const result = await list({ sort });
      assert.deepEqual(result.leads.map(l => l.id), expected);
      assert.deepEqual(renderIds(result.leads, sort), expected);
      for (const page of [1, 2]) {
        const paginated = await list({ sort, page, pageSize: 2 });
        assert.deepEqual(renderIds(paginated.leads, sort), expected.slice((page - 1) * 2, page * 2));
      }
    });
    await t.test('follow-up timestamps and SQL tie breakers survive conflicting scores', async () => {
      await prisma.lead.update({ where: { id: 'c' }, data: { followUpDueAt: new Date('2026-09-11T16:00:00Z') } });
      assert.deepEqual(renderIds((await list({ sort: 'follow-up-asc' })).leads, 'follow-up-asc'), ['a', 'b', 'c', 'd']);
      await prisma.lead.update({ where: { id: 'b' }, data: { followUpDueAt: new Date('2026-09-11T16:00:00Z'), scrapedAt: new Date('2026-09-05T12:00:00Z') } });
      assert.deepEqual(renderIds((await list({ sort: 'follow-up-desc' })).leads, 'follow-up-desc'), ['b', 'c', 'a', 'd']);
    });
  } finally { await db.cleanup(); }
});
