import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const testFiles = readdirSync(join(root, 'test'))
  .filter((name) => name.endsWith('.test.ts'))
  .sort()
  .map((name) => join('test', name));

testFiles.push(join('src', 'features', 'generations', 'generation-contracts.test.ts'));

const result = spawnSync(process.execPath, ['--test', ...testFiles], {
  cwd: root,
  stdio: 'inherit',
  shell: false,
});

process.exit(result.status ?? 1);
