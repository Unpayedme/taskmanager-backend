import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const missing = Object.keys(manifest.devDependencies ?? {}).filter(name =>
  !existsSync(join(root, 'node_modules', name, 'package.json'))
);

if (missing.length) {
  console.log(`Installing missing build dependencies from the lockfile: ${missing.join(', ')}`);
  const npmCli = process.env.npm_execpath;
  if (!npmCli || !existsSync(npmCli)) {
    console.error('Run npm ci --include=dev before building or linting.');
    process.exit(1);
  }
  const result = spawnSync(process.execPath, [npmCli, 'ci', '--include=dev'], {
    cwd: root,
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.error || result.status !== 0) {
    console.error('Build dependency installation failed; compilation was stopped.');
    process.exit(result.status || 1);
  }
}
