import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'dotenv';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const localPath = join(root, '.local');
const dataPath = join(localPath, 'postgres');
const manifestPath = join(localPath, 'database.json');
const envPath = join(root, '.env');
const executable = (name) => process.platform === 'win32' ? `${name}.exe` : name;

function findPostgres() {
  const candidates = [process.env.PG_BIN].filter(Boolean);
  if (process.platform === 'win32') {
    const installPath = join(process.env.ProgramFiles || 'C:\\Program Files', 'PostgreSQL');
    if (existsSync(installPath)) {
      candidates.push(...readdirSync(installPath, { withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name)
        .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
        .map(version => join(installPath, version, 'bin')));
    }
  }
  return candidates.find(directory => ['initdb', 'pg_ctl', 'psql'].every(name => existsSync(join(directory, executable(name)))));
}

function run(binaryPath, name, args, options = {}) {
  return execFileSync(join(binaryPath, executable(name)), args, {
    cwd: root, windowsHide: true, encoding: 'utf8', stdio: 'inherit', timeout: 60000, ...options,
  });
}

export function readEnvironment() {
  return existsSync(envPath) ? parse(readFileSync(envPath)) : null;
}

export function createEnvironment() {
  if (existsSync(envPath)) return;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Configure production environment variables explicitly. Development setup cannot create production credentials.');
  }
  const binaryPath = findPostgres();
  if (!binaryPath) {
    throw new Error('PostgreSQL binaries were not found. Set PG_BIN to the PostgreSQL bin folder, or copy .env.example to .env and configure DATABASE_URL and both JWT secrets.');
  }
  const port = 15432;
  const user = 'taskmanager';
  const database = 'taskmanager';
  const password = randomBytes(32).toString('hex');
  const databaseUrl = `postgresql://${user}:${password}@127.0.0.1:${port}/${database}?schema=public`;
  let content = readFileSync(join(root, '.env.example'), 'utf8');
  const values = {
    DATABASE_URL: databaseUrl,
    ACCESS_TOKEN_SECRET: randomBytes(48).toString('hex'),
    REFRESH_TOKEN_SECRET: randomBytes(48).toString('hex'),
  };
  for (const [key, value] of Object.entries(values)) content = content.replace(new RegExp(`^${key}=.*$`, 'm'), `${key}=${value}`);
  mkdirSync(localPath, { recursive: true });
  writeFileSync(manifestPath, JSON.stringify({ binaryPath, port, user, database }, null, 2) + '\n', { flag: 'wx' });
  writeFileSync(envPath, content, { flag: 'wx', mode: 0o600 });
  console.log('Created .env with random JWT secrets and a project-local PostgreSQL connection.');
}

export function startLocalDatabase() {
  if (!existsSync(manifestPath)) return false;
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const environment = readEnvironment();
  const configuredUrl = process.env.DATABASE_URL || environment?.DATABASE_URL;
  if (!configuredUrl) throw new Error('DATABASE_URL is missing. Run npm run setup:dev or configure .env.');
  const url = new URL(configuredUrl);
  if (url.hostname !== '127.0.0.1' || Number(url.port) !== manifest.port || decodeURIComponent(url.username) !== manifest.user || decodeURIComponent(url.pathname.slice(1)) !== manifest.database) {
    return false;
  }
  const childEnv = { ...process.env, PGPASSWORD: decodeURIComponent(url.password) };
  if (!existsSync(join(dataPath, 'PG_VERSION'))) {
    const passwordFile = join(localPath, 'init-password.tmp');
    writeFileSync(passwordFile, `${childEnv.PGPASSWORD}\n`, { flag: 'wx', mode: 0o600 });
    try {
      run(manifest.binaryPath, 'initdb', ['-D', dataPath, '-U', manifest.user, '--auth-local=scram-sha-256', '--auth-host=scram-sha-256', '--encoding=UTF8', '--locale=C', `--pwfile=${passwordFile}`]);
    } finally { unlinkSync(passwordFile); }
  }
  let running = false;
  try {
    run(manifest.binaryPath, 'pg_ctl', ['-D', dataPath, 'status'], { stdio: 'pipe' });
    running = true;
  } catch (error) {
    if (error.status !== 3) throw error;
  }
  if (!running) {
    run(manifest.binaryPath, 'pg_ctl', ['-D', dataPath, '-l', join(localPath, 'postgres.log'), '-o', `-p ${manifest.port} -h 127.0.0.1`, '-w', 'start']);
  }
  const connectionArgs = ['-h', '127.0.0.1', '-p', String(manifest.port), '-U', manifest.user];
  const databaseExists = run(manifest.binaryPath, 'psql', [...connectionArgs, '-d', 'postgres', '-Atqc', "SELECT 1 FROM pg_database WHERE datname = 'taskmanager'"], { env: childEnv, stdio: 'pipe' }).trim() === '1';
  if (!databaseExists) run(manifest.binaryPath, 'createdb', [...connectionArgs, manifest.database], { env: childEnv });
  console.log(`Project-local PostgreSQL is ready on 127.0.0.1:${manifest.port}.`);
  return true;
}

export function applyMigrations() {
  execFileSync(process.execPath, [join(root, 'node_modules', 'prisma', 'build', 'index.js'), 'migrate', 'deploy', '--config', 'prisma7.config.ts'], {
    cwd: root, windowsHide: true, stdio: 'inherit', timeout: 60000,
    env: { ...readEnvironment(), ...process.env },
  });
}

export function stopLocalDatabase() {
  if (!existsSync(manifestPath) || !existsSync(join(dataPath, 'PG_VERSION'))) {
    console.log('No project-local PostgreSQL database is configured.');
    return;
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  run(manifest.binaryPath, 'pg_ctl', ['-D', dataPath, '-m', 'fast', '-w', 'stop']);
}
