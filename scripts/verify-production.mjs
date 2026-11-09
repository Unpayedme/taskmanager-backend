import { spawn, execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync, unlinkSync, readFileSync, existsSync, readdirSync, createReadStream } from 'node:fs';
import { dirname, resolve, join, extname, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import https from 'node:https';
import assert from 'node:assert/strict';

const backend = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const frontend = resolve(process.env.FRONTEND_PATH || join(backend, '../taskmanager-frontend'));
const executable = name => process.platform === 'win32' ? `${name}.exe` : name;
let pgBin = process.env.PG_BIN;
if (!pgBin && process.platform === 'win32') {
  const installations = join(process.env.ProgramFiles || 'C:\\Program Files', 'PostgreSQL');
  if (existsSync(installations)) pgBin = readdirSync(installations).sort((a, b) => b.localeCompare(a, undefined, { numeric: true })).map(version => join(installations, version, 'bin')).find(path => existsSync(join(path, 'initdb.exe')));
}
const pgCommand = name => pgBin ? join(pgBin, executable(name)) : name;
const gitOpenSsl = 'C:\\Program Files\\Git\\usr\\bin\\openssl.exe';
const openssl = process.env.OPENSSL_BIN || (process.platform === 'win32' && existsSync(gitOpenSsl) ? gitOpenSsl : 'openssl');
const audit = join(backend, '.validation', `production-${Date.now()}`);
const data = join(audit, 'postgres');
const password = randomBytes(32).toString('hex');
const proxySecret = randomBytes(48).toString('hex');
const dbPort = Number(process.env.AUDIT_DB_PORT || 55440);
const apiPort = Number(process.env.AUDIT_API_PORT || 5300);
const webPort = Number(process.env.AUDIT_WEB_PORT || 5443);
const apiOrigin = `http://127.0.0.1:${apiPort}`;
const frontendOrigin = `https://localhost:${webPort}`;
const databaseUrl = `postgresql://production_audit:${password}@127.0.0.1:${dbPort}/taskmanager_production_test`;
const environment = {
  ...process.env, NODE_ENV: 'production', PORT: String(apiPort),
  DATABASE_URL: databaseUrl, TEST_DATABASE_URL: databaseUrl,
  FRONTEND_ORIGIN: frontendOrigin, API_PROXY_SECRET: proxySecret,
  ACCESS_TOKEN_SECRET: randomBytes(48).toString('hex'), REFRESH_TOKEN_SECRET: randomBytes(48).toString('hex'),
  GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '', GOOGLE_REDIRECT_URI: `${frontendOrigin}/api/auth/google/callback`,
  COOKIE_SAME_SITE: 'lax', TRUST_PROXY: '0',
};
mkdirSync(audit, { recursive: true });
let started = false;
let api;
let web;
function runPg(name, args) {
  execFileSync(pgCommand(name), args, { windowsHide: true, cwd: backend, timeout: 60000, stdio: ['ignore', 'ignore', 'inherit'], env: { ...process.env, PGPASSWORD: password } });
}
async function runNode(args, cwd, childEnv = environment) {
  await new Promise((accept, reject) => {
    const child = spawn(process.execPath, args, { cwd, env: childEnv, windowsHide: true, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? accept() : reject(new Error(`Validation exited with code ${code}`)));
  });
}
async function waitUntilReady() {
  for (let count = 0; count < 80; count++) {
    if (api.exitCode !== null) throw new Error('Production API exited during startup.');
    try { if ((await fetch(`${apiOrigin}/api/ready`)).ok) return; } catch {}
    await new Promise(accept => setTimeout(accept, 250));
  }
  throw new Error('Production API did not become ready.');
}
try {
  const pwfile = join(audit, 'init-password.tmp');
  writeFileSync(pwfile, `${password}\n`, { flag: 'wx' });
  try {
    runPg('initdb', ['-D', data, '-U', 'production_audit', '--auth-local=scram-sha-256', '--auth-host=scram-sha-256', '--encoding=UTF8', '--locale=C', `--pwfile=${pwfile}`]);
  } finally { unlinkSync(pwfile); }
  runPg('pg_ctl', ['-D', data, '-l', join(audit, 'postgres.log'), '-o', `-p ${dbPort} -h 127.0.0.1`, '-w', 'start']);
  started = true;
  runPg('createdb', ['-h', '127.0.0.1', '-p', String(dbPort), '-U', 'production_audit', 'taskmanager_production_test']);
  console.log('Isolated production-test PostgreSQL is running.');
  await runNode(['node_modules/prisma/build/index.js', 'migrate', 'deploy', '--config', 'prisma7.config.ts'], backend);
  await runNode(['--import', 'tsx', 'scripts/check-production.ts'], backend);
  await runNode(['--import', 'tsx', '--test', 'tests/integration/api.test.ts'], backend, { ...environment, NODE_ENV: 'test' });
  const keyPath = join(audit, 'localhost-key.pem');
  const certPath = join(audit, 'localhost-cert.pem');
  execFileSync(openssl, ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', keyPath, '-out', certPath, '-days', '1', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'], { windowsHide: true, timeout: 30000, stdio: 'ignore' });
  api = spawn(process.execPath, ['dist/server.js'], { cwd: backend, env: environment, windowsHide: true, stdio: 'inherit' });
  await waitUntilReady();
  assert.equal((await fetch(`${apiOrigin}/api/auth/config`)).status, 403, 'The backend API must reject direct unauthenticated proxy access.');
  const { createApiProxy } = await import(pathToFileURL(join(frontend, 'server/api-proxy.mjs')).href);
  const proxy = createApiProxy({ origin: apiOrigin, secret: proxySecret });
  const spa = join(frontend, 'dist', 'spa');
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.ico': 'image/x-icon' };
  web = https.createServer({ key: readFileSync(keyPath), cert: readFileSync(certPath) }, async (req, res) => {
    try {
      if (req.url.startsWith('/api/')) {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const body = Buffer.concat(chunks);
        const headers = new Headers();
        for (const [name, value] of Object.entries(req.headers)) if (typeof value === 'string') headers.set(name, value);
        headers.set('x-vercel-forwarded-for', req.socket.remoteAddress || '127.0.0.1');
        // Exercise the routing metadata seen in deployed Vercel function URLs.
        const original = new URL(req.url, frontendOrigin);
        const rewritten = new URL('/api/proxy', frontendOrigin);
        rewritten.search = original.search;
        const route = original.pathname.slice('/api/'.length);
        rewritten.searchParams.set('__path', route);
        rewritten.searchParams.set('path', route);
        const incoming = new Request(rewritten, { method: req.method, headers, ...(!['GET', 'HEAD'].includes(req.method) ? { body } : {}) });
        const response = await proxy(incoming);
        for (const [name, value] of response.headers) if (name !== 'set-cookie') res.setHeader(name, value);
        const cookies = response.headers.getSetCookie();
        if (cookies.length) res.setHeader('Set-Cookie', cookies);
        res.writeHead(response.status);
        res.end(Buffer.from(await response.arrayBuffer()));
        return;
      }
      const pathname = decodeURIComponent(new URL(req.url, frontendOrigin).pathname);
      const target = resolve(spa, pathname === '/' ? 'index.html' : `.${pathname}`);
      if (!target.startsWith(`${spa}${sep}`) || !existsSync(target)) { res.writeHead(404); res.end(); return; }
      res.setHeader('Content-Type', types[extname(target)] || 'application/octet-stream');
      createReadStream(target).pipe(res);
    } catch { res.writeHead(500); res.end('Production test proxy failed.'); }
  });
  await new Promise((accept, reject) => { web.once('error', reject); web.listen(webPort, 'localhost', accept); });
  console.log('Running desktop/mobile browser tests with NODE_ENV=production, HTTPS, Secure cookies and the Vercel proxy handler.');
  await runNode(['node_modules/@playwright/test/cli.js', 'test'], frontend, { ...environment, E2E_BASE_URL: frontendOrigin, E2E_LOCAL_TLS: '1', PLAYWRIGHT_CHANNEL: process.env.PLAYWRIGHT_CHANNEL || 'msedge' });
  runPg('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']);
  started = false;
  assert.equal((await fetch(`${apiOrigin}/api/ready`)).status, 503, 'Database outages must fail readiness.');
  assert.equal((await fetch(`${apiOrigin}/api/health`)).status, 200, 'Liveness must remain available during a database outage.');
  console.log('PRODUCTION_VERIFIED: migrations, isolated integration tests, HTTPS browser tests, proxy isolation and database-outage readiness passed.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (web) { web.closeAllConnections(); await new Promise(accept => web.close(accept)); }
  if (api && api.exitCode === null) { const exited = new Promise(accept => api.once('exit', accept)); api.kill(); await exited; }
  if (started) {
    try { runPg('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']); }
    catch { console.error('Could not stop the temporary database.'); process.exitCode = 1; }
  }
  console.log('Temporary production-test services stopped.');
}
