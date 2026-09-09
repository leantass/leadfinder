import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBulk } from './helpers/bulk-loader.mjs';

const parser = loadBulk('src/lib/leads/bulk-contact-parser.ts');
const dedup = loadBulk('src/lib/leads/bulk-contact-dedup.ts');
const mapping = ['businessName', 'phone', 'website', 'category', 'address', 'city'];
const input = (text, config = {}) => ({ text, config: { delimiter: '\t', hasHeaders: false, mapping: ['businessName', 'phone'], ...config } });

for (const [name, text, delimiter] of [
  ['TSV Excel CRLF', 'Empresa\tTeléfono\r\nUno\t123456\r\n', '\t'],
  ['TSV Sheets LF', 'Empresa\tTeléfono\nUno\t123456', '\t'],
  ['CSV comma', 'Empresa,Teléfono\nUno,123456', ','],
  ['CSV semicolon BOM', '\uFEFFEmpresa;Teléfono\nUno;123456', ';'],
]) test(name, () => {
  assert.equal(parser.detectBulkDelimiter(text).delimiter, delimiter);
  const result = parser.prepareBulkRows(input(text, { delimiter, hasHeaders: true }));
  assert.equal(result.rows.length, 1); assert.equal(result.rows[0].validation.ok, true);
  assert.equal(result.rows[0].sourceRow, 2);
});

test('quoted delimiters, escaped quotes, empty cells and multiline preserve physical source row', () => {
  const result = parser.parseBulkText('"Uno, ";"Dijo ""hola""";\r\n"Dos\r\nTres";x;y\r\nFinal;x;y', ';');
  assert.deepEqual(result.records[0].cells, ['Uno, ', 'Dijo "hola"', '']);
  assert.equal(result.records[1].cells[0], 'Dos\nTres');
  assert.equal(result.records[2].sourceRow, 4);
});
test('unclosed and malformed quotes fail, no guessed rows', () => {
  for (const text of ['"Uno,123456', '"Uno"x,123456', 'Un"o,123456']) assert.throws(() => parser.parseBulkText(text, ','), /comillas/);
  assert.throws(() => parser.detectBulkDelimiter('"Uno,123456'), /comillas/);
});
test('ambiguous delimiter requires explicit selection', () => {
  const detected = parser.detectBulkDelimiter('Uno,123456;web\nDos,456789;web');
  assert.equal(detected.delimiter, null); assert.deepEqual(detected.options, [',', ';']);
});
test('uneven rows fail without truncation', () => assert.throws(() => parser.parseBulkText('Uno,123456\nDos,456789,extra', ','), /distinta/));
for (const headers of [
  ['nombre', 'teléfono', 'sitio web', 'categoría', 'dirección', 'ciudad'],
  ['businessName', 'phone', 'website', 'category', 'address', 'city'],
  [' EMPRESA ', 'WhatsApp', 'Web', 'Categoria', 'Direccion', 'CITY'],
]) test(`header aliases ${headers[0]}`, () => assert.deepEqual(parser.inferBulkMapping(headers), { mapping, hasHeaders: true }));
test('unrecognized first row stays data with manual mapping', () => {
  assert.equal(parser.inferBulkMapping(['Uno', '123456']).hasHeaders, false);
  assert.equal(parser.prepareBulkRows(input('Uno\t123456')).rows[0].validation.data.businessName, 'Uno');
});
for (const bad of [['businessName', 'businessName'], ['city', 'phone'], ['businessName', 'city']]) {
  test(`mapping rejects ${bad.join('/')}`, () => assert.throws(() => parser.prepareBulkRows(input('Uno\t123456', { mapping: bad }))));
}
for (const [name, text, config] of [
  ['empty name', '\t123456', {}], ['invalid phone', 'Uno\tabc', {}],
  ['invalid website', 'Uno\tbad', { mapping: ['businessName', 'website'] }],
  ['missing contact', 'Uno\t', {}],
]) test(name, () => assert.equal(parser.prepareBulkRows(input(text, config)).rows[0].validation.ok, false));
test('empty rows ignored and source row preserved', () => {
  const result = parser.prepareBulkRows(input('\n\t\nUno\t123456\n\nDos\t456789'));
  assert.equal(result.emptyRows, 3); assert.deepEqual(result.rows.map(r => r.sourceRow), [3, 5]);
});
test('100 rows accepted, 101 rejected with or without headers', () => {
  const rows = Array.from({ length: 100 }, (_, i) => `Business ${i}\t123456`).join('\n');
  assert.equal(parser.prepareBulkRows(input(rows)).rows.length, 100);
  assert.equal(parser.prepareBulkRows(input(`nombre\tphone\n${rows}`, { hasHeaders: true })).rows.length, 100);
  assert.throws(() => parser.prepareBulkRows(input(`${rows}\nextra\t123456`)), /100/);
});
test('payload byte limit includes multibyte text and config', () => {
  assert.throws(() => parser.assertBulkPayload({ text: 'á'.repeat(131072) }), /256 KiB/);
});
test('2000 characters accepted, 2001 rejected', () => {
  assert.equal(parser.prepareBulkRows(input(`${'a'.repeat(2000)}\t123456`)).rows.length, 1);
  assert.throws(() => parser.prepareBulkRows(input(`${'a'.repeat(2001)}\t123456`)), /2000/);
});

const base = { businessName: 'Estudio Norte', phone: '+54 11 5555 1234', website: null, city: 'Buenos Aires', address: 'Calle 1', category: null, reference: 'lead:1' };
const classify = (a, b, within = false) => dedup.classifyContact(dedup.contactKeys({ ...base, ...a }), [dedup.contactKeys({ ...base, ...b })], within);
test('international + and 00 equivalent without inventing country', () => {
  assert.equal(classify({}, { phone: '0054 (11) 5555-1234' }).status, 'DUPLICATE');
  assert.deepEqual(dedup.phoneKey('011 5555-1234'), { digits: '01155551234', international: false });
});
test('local phone and mixed explicit/local remain possible', () => {
  assert.equal(classify({ phone: '123456' }, { phone: '123456' }).status, 'POSSIBLE_DUPLICATE');
  assert.equal(classify({}, { phone: '541155551234' }).status, 'POSSIBLE_DUPLICATE');
});
for (const changes of [{ city: 'Córdoba' }, { address: 'Calle 2' }, { businessName: 'Otro negocio' }]) {
  test(`shared phone contradiction ${Object.keys(changes)[0]}`, () => assert.equal(classify({}, changes).status, 'POSSIBLE_DUPLICATE'));
}
test('exact normalized batch row blocks even with only website', () => {
  assert.equal(classify({ phone: null, website: 'http://www.example.com/' }, { phone: null, website: 'https://example.com/' }, true).status, 'DUPLICATE');
});
test('same website and shared business host never automatically block', () => {
  assert.equal(classify({ phone: null, website: 'https://example.com/branch1' }, { phone: null, city: null, website: 'http://www.example.com/branch2' }).status, 'POSSIBLE_DUPLICATE');
});
test('social profiles distinct, same profile possible, subdomains retained', () => {
  const a = { phone: null, city: null, website: 'https://instagram.com/one' };
  assert.equal(classify(a, { ...a, website: 'https://instagram.com/two' }).status, 'NEW');
  assert.equal(classify(a, { ...a, website: 'http://www.instagram.com/one/' }).status, 'POSSIBLE_DUPLICATE');
  assert.equal(classify(a, { ...a, website: 'https://instagram.com/one/?utm_source=sheet' }).status, 'POSSIBLE_DUPLICATE');
  assert.notEqual(dedup.websiteKey('https://facebook.com/profile.php?id=1').profile, dedup.websiteKey('https://facebook.com/profile.php?id=2').profile);
  assert.notEqual(dedup.websiteKey('https://one.example.com').host, dedup.websiteKey('https://two.example.com').host);
});
test('exact name/city possible, similar names never fuzzy matched', () => {
  assert.equal(classify({ phone: null }, { phone: null, businessName: '  ESTUDIO   NORTE ' }).status, 'POSSIBLE_DUPLICATE');
  assert.equal(classify({ phone: null }, { phone: null, businessName: 'Estudios Norte' }).status, 'NEW');
});
