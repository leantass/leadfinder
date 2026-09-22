import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import ts from 'typescript';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { root } from './helpers/bulk-loader.mjs';

const require = createRequire(import.meta.url);
function loadUI(file, mocks = {}) {
  const cache = new Map();
  function load(filename) {
    const resolved = path.resolve(root, filename);
    if (cache.has(resolved)) return cache.get(resolved);
    const code = ts.transpileModule(readFileSync(resolved, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
      fileName: resolved,
    }).outputText;
    const compiledModule = { exports: {} };
    const dependency = id => {
      if (Object.hasOwn(mocks, id)) return mocks[id];
      if (id === 'next/navigation') return { usePathname: () => '/operations', useRouter: () => ({}) };
      if (id === 'next/link') return { __esModule: true, default: props => createElement('a', props) };
      if (id === '@/app/actions') return new Proxy({}, { get: () => () => { throw new Error('No business actions during presentation tests'); } });
      if (id === '@/lib/prisma') throw new Error('Application database forbidden');
      if (id.startsWith('@/') || id.startsWith('.')) {
        const base = id.startsWith('@/') ? path.join(root, 'src', id.slice(2)) : path.resolve(path.dirname(resolved), id);
        const target = ['.ts', '.tsx'].map(ext => base + ext).find(existsSync);
        assert.ok(target, id);
        return load(target);
      }
      return require(id);
    };
    new Function('require', 'module', 'exports', code)(dependency, compiledModule, compiledModule.exports);
    cache.set(resolved, compiledModule.exports);
    return compiledModule.exports;
  }
  return load(file);
}
const render = (component, props) => renderToStaticMarkup(createElement(component, props));
const text = html => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
const date = '2026-09-16T12:00:00Z';
const jobs = ['completed', 'failed', 'pending', 'running'].map((status, i) => ({
  id: String(i), query: `Búsqueda ${i}`, status, createdAt: date, leadCount: i,
  foundCount: i ? null : 7, createdCount: i ? null : 4,
  duplicateSkippedCount: i ? null : 3, possibleDuplicateCount: i ? null : 0,
}));

test('shell exposes only the five 1.0 routes in its shared responsive navigation', () => {
  const { AppShell } = loadUI('src/components/app-shell.tsx');
  const html = render(AppShell, { title: 'Operaciones', description: '', children: null });
  const nav = html.match(/<nav\b[^>]*>([\s\S]*?)<\/nav>/)[1];
  assert.deepEqual([...nav.matchAll(/href="([^"]+)"/g)].map(m => m[1]), ['/', '/searches', '/contacts', '/leads', '/operations']);
  assert.match(text(nav), /Dashboard Búsquedas Contactos Leads Operaciones/);
  assert.doesNotMatch(text(html), /\b(?:Online|Core|Auto|Workspace|Plataforma activa|Estado general)\b/);
});

test('search history translates every status and distinguishes unavailable counters from zero', () => {
  const { SearchJobsSection } = loadUI('src/components/search-jobs-section.tsx');
  const visible = text(render(SearchJobsSection, { title: 'Historial', description: '', jobs }));
  for (const label of ['Completada', 'Fallida', 'Pendiente', 'En curso', 'Resultados encontrados: 7', 'Leads nuevos: 4', 'Duplicados omitidos: 3', 'Desglose no disponible']) assert.ok(visible.includes(label), label);
  assert.doesNotMatch(visible, /\b(?:completed|failed|pending|running)\b/);
});

test('dashboard copy keeps the supplied counts and removes the Reports shortcut', async () => {
  const counts = { leadCount: 23, searchJobCount: 4, qualifiedLeadsCount: 6, automationReadyLeadsCount: 8, leadsWithoutWebsiteCount: 2, whatsappOutreachLeadsCount: 5, followUpOverdueCount: 0 };
  const { default: Home } = loadUI('src/app/page.tsx', { '@/lib/workspace-data': {
    getWorkspaceShellData: async () => ({ counts }), getLatestSearchJobs: async () => jobs,
    getDashboardSummaryData: async () => ({ urgentLeadsCount: 11, followUpDueTodayCount: 3 }),
  } });
  const html = renderToStaticMarkup(await Home()), visible = text(html);
  assert.equal((visible.match(/Leads con teléfono por gestionar 11/g) ?? []).length, 2);
  assert.match(visible, /Leads totales 23/);
  assert.match(visible, /Candidatos a automatización 8/);
  assert.match(visible, /Calificados para contacto 6/);
  assert.match(visible, /Sin URL web registrada 2/);
  assert.doesNotMatch(html, /href="\/reports"/);
  for (const label of ['Completada', 'Fallida', 'Pendiente', 'En curso']) assert.ok(visible.includes(label));
});

const lead = { id: 'lead-ui', origin: 'MANUAL', businessName: 'Comercio', phone: '+5491112345678', website: null, websiteType: 'unknown', commercialStatus: 'new', businessType: null, suggestedOffer: null, offerReason: null, readyForAutomation: false, outreachStatus: 'pending_review', outreachChannel: 'whatsapp', scrapedAt: date, score: 50, scoreReasons: [], notes: [] };
test('Leads presentation preserves origins and classification while clarifying actions', () => {
  const { LeadsPanel } = loadUI('src/components/leads-panel.tsx');
  const visible = text(render(LeadsPanel, { leads: [lead, { ...lead, id: 'search-ui', origin: 'SEARCH', phone: null }], showListingControls: false }));
  for (const label of ['Contacto prioritario', 'Menor prioridad', 'Manual', 'Búsqueda', '+3 señales adicionales', 'Abrir WhatsApp', 'Ver detalle']) assert.ok(visible.includes(label), label);
  assert.doesNotMatch(visible, /\b(?:HOT|WARM|COLD)\b/);
  const { getOpportunityLevel, getLeadOriginLabel } = loadUI('src/lib/leads/lead-ui.ts');
  assert.equal(getOpportunityLevel(lead), 'hot');
  assert.equal(getOpportunityLevel({ ...lead, phone: null }), 'cold');
  assert.equal(getLeadOriginLabel('MANUAL'), 'Manual');
  const { CommercialIntelligenceCard } = loadUI('src/components/leads-panel/commercial-intelligence-card.tsx');
  assert.match(text(render(CommercialIntelligenceCard, { lead })), /Requiere revisión/);
  assert.match(visible, /Sitio web/);
  assert.doesNotMatch(visible, /\bWebsite\b/);
});

test('quick actions keep their targets, callbacks and disabled commercial states', () => {
  const { RowQuickActions } = loadUI('src/components/leads-panel/row-quick-actions.tsx');
  const calls = [];
  const props = { lead: { ...lead, phone: null }, isPending: false, onOpenDetail: id => calls.push(['detail', id]), onMark: id => calls.push(['mark', id]), onSendToSales: id => calls.push(['sales', id]) };
  const buttons = RowQuickActions(props).props.children.filter(c => c?.type === 'button');
  for (const button of buttons) button.props.onClick({ stopPropagation() {} });
  assert.deepEqual(calls, [['detail', lead.id], ['mark', lead.id], ['sales', lead.id]]);
  const html = render(RowQuickActions, { ...props, lead });
  assert.match(html, /href="https:\/\/wa.me\//);
  assert.match(text(html), /Abrir WhatsApp/);
  assert.match(render(RowQuickActions, { ...props, lead: { ...lead, commercialStatus: 'ready' } }), /disabled=""[^>]*>En ventas/);
});

test('operations translates all three contexts without changing values or hiding controls', () => {
  const context = { query: '', filter: 'all', sort: 'score-desc', page: 1, pageSize: 20 };
  const schedule = { ...context, id: 'schedule-ui', name: 'Programación de prueba', isEnabled: true, runEveryMinutes: 60, autoApplySafe: true, autoApplyMinConfidence: 'high', autoApplyActions: ['review_manually'], respectQuietHours: false, runWindowStart: '09:00', runWindowEnd: '21:00', timezone: 'America/Argentina/Buenos_Aires', maxItemsPerRun: 20, lastRunAt: null, createdAt: date, updatedAt: date };
  const run = { ...context, id: 'run-ui', source: 'schedule', scheduleId: schedule.id, scheduleName: schedule.name, status: 'pending', analyzedCount: 1, decisionCount: 0, pendingCount: 0, appliedCount: 0, failedCount: 0, items: [], createdAt: date, updatedAt: date };
  const before = JSON.stringify({ schedule, run });
  const { OperationsAutomationPanel } = loadUI('src/components/operations-automation-panel.tsx');
  const html = render(OperationsAutomationPanel, { leads: [lead], initialRun: run, recentRuns: [run], schedules: [schedule], latestSchedulerExecution: null, recentSchedulerExecutions: [], queryContext: { ...context, q: '' } });
  const visible = text(html);
  assert.equal((visible.match(/Página 1 · 20 leads por página/g) ?? []).length, 3);
  assert.equal((visible.match(/Filtro Todos|filtro Todos/g) ?? []).length, 3);
  assert.equal((visible.match(/Mayor score/g) ?? []).length, 3);
  for (const label of ['Confianza mínima: alta', 'Sin restricción horaria', 'Pendientes por intervalo', 'Ejecutar programaciones pendientes', 'Ejecutar ahora', 'Guardar política', 'Analizar leads', 'Ejecutar cola', 'Autoaplicar seguras', 'Respetar horario operativo']) assert.ok(visible.includes(label), label);
  assert.doesNotMatch(visible, /\b(?:all|score-desc|runner|schedules|quiet hours|executionKey)\b/);
  assert.equal(JSON.stringify({ schedule, run }), before);
  assert.match(html, /value="high"/);
});
