import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBulk } from './helpers/bulk-loader.mjs';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const { mapsIdentity, searchCandidateKeys: keys, classifySearchPair: pair } = loadBulk('src/lib/search/search-dedup.ts');
const candidate = changes => ({businessName:'Café Norte',phone:null,website:null,sourceUrl:null,sourcePlatform:'google_maps',address:null,city:null,...changes});
const url = token => `https://www.google.com/maps/place/Cafe/data=${token}`;
const classify = (a,b) => pair(keys(candidate(a)),keys(candidate(b)));
for(const [name,input,expected] of [
  ['place token',url('!19sChIJabcdefghijklm'),'google_maps:place:ChIJabcdefghijklm'],
  ['feature token',url('!1s0xABCD:0x1234'),'google_maps:feature:0xabcd:0x1234'],
]) test(name,()=>assert.ok(mapsIdentity(input,'google_maps').tokens.includes(expected)));
for(const value of ['invalid','https://www.google.com/maps','https://www.google.com/maps/place/Cafe','https://evil.test/maps/place/Cafe/data=!19sChIJabcdefghijklm','https://www.google.com/maps/place/%XX'])
  test(`unsafe or generic identity ${value}`,()=>assert.deepEqual(mapsIdentity(value,'google_maps'),{tokens:[],url:null}));
test('namespace excludes non Maps sources',()=>assert.equal(mapsIdentity(url('!19sChIJabcdefghijklm'),'other').url,null));
test('tracking and place name changes retain identity',()=>assert.equal(classify({sourceUrl:url('!19sChIJabcdefghijklm')+'?hl=es&rclk=1'},{sourceUrl:url('!19sChIJabcdefghijklm').replace('/Cafe/','/Renamed/')+'?authuser=2'}),'DUPLICATE'));
test('concrete URL fallback strips only known tracking',()=>assert.equal(classify({sourceUrl:url('!16s%2Fg%2Fabcdef')+'?hl=es&g_ep=x'},{sourceUrl:url('!16s%2Fg%2Fabcdef')+'?rclk=1'}),'DUPLICATE'));
test('unknown URL identity parameters retained',()=>assert.equal(classify({sourceUrl:url('!16s%2Fg%2Fabcdef')+'?identity=a'},{sourceUrl:url('!16s%2Fg%2Fabcdef')+'?identity=b'}),'NEW'));
for(const [name,a,b,expected] of [
  ['international formats and exact normalized name',{phone:'+54 11 1234-5678',businessName:' CAFÉ  NORTE '},{phone:'00541112345678'},'DUPLICATE'],
  ['different name shared phone',{phone:'+541112345678'},{phone:'+541112345678',businessName:'Other'},'POSSIBLE_DUPLICATE'],
  ['local phone',{phone:'011 1234-5678'},{phone:'01112345678'},'POSSIBLE_DUPLICATE'],
  ['local international ambiguity',{phone:'011 1234-5678'},{phone:'+541112345678'},'POSSIBLE_DUPLICATE'],
  ['address contradiction',{phone:'+541112345678',address:'A'},{phone:'+541112345678',address:'B'},'POSSIBLE_DUPLICATE'],
  ['city contradiction',{phone:'+541112345678',city:'A'},{phone:'+541112345678',city:'B'},'POSSIBLE_DUPLICATE'],
  ['different Maps branches',{phone:'+541112345678',sourceUrl:url('!1s0x1:0x2')},{phone:'+541112345678',sourceUrl:url('!1s0x1:0x3')},'POSSIBLE_DUPLICATE'],
  ['same profile',{website:'https://www.instagram.com/cafe/?utm_source=x'},{website:'https://instagram.com/cafe'},'POSSIBLE_DUPLICATE'],
  ['different profiles',{website:'https://instagram.com/a'},{website:'https://instagram.com/b'},'NEW'],
  ['same name address',{address:'Street 1'},{address:'street 1'},'POSSIBLE_DUPLICATE'],
  ['same name city',{city:'Lanús'},{city:'LANÚS'},'POSSIBLE_DUPLICATE'],
  ['name alone',{}, {},'NEW'],
]) test(name,()=>assert.equal(classify(a,b),expected));

const require = createRequire(import.meta.url);
const code = ts.transpileModule(readFileSync(new URL('../src/components/search-jobs-section.tsx',import.meta.url),'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX},fileName:'search-jobs-section.tsx',
}).outputText;
const compiled={exports:{}};
new Function('require','module','exports',code)(require,compiled,compiled.exports);
const renderJob = counters => renderToStaticMarkup(createElement(compiled.exports.SearchJobsSection,{
  title:'Jobs',description:'Search history',jobs:[{id:'job',query:'fixture',status:'completed',createdAt:'2026-09-15T12:00:00Z',leadCount:0,...counters}],
}));
test('historical UI does not invent zero counters',()=>{const html=renderJob({foundCount:null});assert.match(html,/Sin desglose histórico/);assert.doesNotMatch(html,/Encontrados:/);});
test('new duplicate-only job renders persisted execution counts',()=>{const html=renderJob({foundCount:3,createdCount:0,duplicateSkippedCount:3,possibleDuplicateCount:0});assert.match(html,/Encontrados: 3 · Nuevos leads: 0 · Duplicados omitidos: 3/);assert.doesNotMatch(html,/Posibles coincidencias/);});
test('possible count is informative and visible when positive',()=>assert.match(renderJob({foundCount:3,createdCount:3,duplicateSkippedCount:0,possibleDuplicateCount:2}),/Posibles coincidencias: 2/));
