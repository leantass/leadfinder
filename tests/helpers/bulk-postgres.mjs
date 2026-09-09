import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { root } from './bulk-loader.mjs';

export async function disposableBulkDatabase() {
  const pgBin = process.env.LEADFINDER_TEST_PG_BIN ?? (process.platform === 'win32'
    ? path.join(process.env.LOCALAPPDATA, 'caritas-postgresql-16.15', 'pgsql', 'bin') : '/usr/lib/postgresql/16/bin');
  const binary = name => path.join(pgBin, name + (process.platform === 'win32' ? '.exe' : ''));
  assert.ok(['initdb', 'pg_ctl', 'createdb'].every(name => existsSync(binary(name))), 'PostgreSQL test binaries required');
  const directory = mkdtempSync(path.join(tmpdir(), 'leadfinder-bulk-tests-'));
  const data = path.join(directory, 'data');
  const server = createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  assert.ok(![5432, 5433].includes(port));
  const url = `postgresql://postgres@127.0.0.1:${port}/leadfinder_bulk_test`;
  const env = { ...process.env, DATABASE_URL: url, PGHOST: '127.0.0.1', PGPORT: String(port), PGUSER: 'postgres', PGDATABASE: 'leadfinder_bulk_test' };
  delete env.PGPASSWORD; delete env.PGSERVICE; delete env.PGOPTIONS;
  const exec = (file, args) => execFileSync(file, args, { cwd: root, env, stdio: 'ignore', windowsHide: true, timeout: 60000 });
  let prisma;
  async function cleanup() {
    await prisma?.$disconnect();
    try {
      if (existsSync(path.join(data, 'postmaster.pid'))) exec(binary('pg_ctl'), ['stop', '-D', data, '-m', 'fast', '-w', '-t', '30']);
      assert.equal(path.dirname(directory), path.resolve(tmpdir()));
      assert.ok(path.basename(directory).startsWith('leadfinder-bulk-tests-'));
      rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    } catch (error) {
      console.error(`Disposable cluster evidence preserved: ${directory}`);
      throw error;
    }
  }
  try {
    exec(binary('initdb'), ['-D', data, '-U', 'postgres', '-A', 'trust', '--encoding=UTF8', '--no-locale']);
    exec(binary('pg_ctl'), ['start', '-D', data, '-l', path.join(directory, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port}`, '-w', '-t', '30']);
    exec(binary('createdb'), ['-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', 'leadfinder_bulk_test']);
    exec(process.execPath, [path.join(root, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy']);
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
    const [identity] = await prisma.$queryRaw`SELECT current_database() AS db, inet_server_port() AS port, current_setting('data_directory') AS directory`;
    assert.equal(identity.db, 'leadfinder_bulk_test'); assert.equal(identity.port, port);
    assert.equal(path.resolve(identity.directory), path.resolve(data));
    return { prisma, env, url, directory, cleanup };
  } catch (error) { await cleanup(); throw error; }
}
