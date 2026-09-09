import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

export const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(import.meta.url);
const compiled = new Map();
export function loadBulk(file, mocks = {}) {
  const loaded = new Map();
  function load(filename) {
    const resolved = path.resolve(root, filename);
    if (loaded.has(resolved)) return loaded.get(resolved);
    if (!compiled.has(resolved)) compiled.set(resolved, ts.transpileModule(readFileSync(resolved, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: resolved,
    }).outputText);
    const compiledModule = { exports: {} };
    const dependency = id => {
      if (Object.hasOwn(mocks, id)) return mocks[id];
      if (id === 'server-only') return {};
      if (id === '@/lib/prisma') throw new Error('Real application DB must never enter tests');
      if (id.startsWith('@/')) return load(`src/${id.slice(2)}.ts`);
      if (id.startsWith('.')) return load(path.resolve(path.dirname(resolved), id.endsWith('.ts') ? id : `${id}.ts`));
      return require(id);
    };
    new Function('require', 'module', 'exports', compiled.get(resolved))(dependency, compiledModule, compiledModule.exports);
    loaded.set(resolved, compiledModule.exports);
    return compiledModule.exports;
  }
  return load(file);
}
