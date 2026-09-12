import { spawnSync } from 'node:child_process';
import { cp, mkdtemp, rename, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const backend = fileURLToPath(new URL('../../backend/', import.meta.url));
const require = createRequire(new URL('../../backend/package.json', import.meta.url));
// Keep the staging directory at the same depth as dist for relative source maps.
const staging = await mkdtemp(join(backend, '.build-'));
try {
  const compilation = spawnSync(process.execPath, [require.resolve('typescript/bin/tsc'), '--outDir', staging], {
    cwd: backend, stdio: 'inherit',
  });
  if (compilation.status !== 0) {
    throw compilation.error ?? new Error('Backend compilation failed');
  }
  await cp(join(backend, 'src/database/migrations'), join(staging, 'database/migrations'), { recursive: true });
  // dist is generated output. Merging into it preserves removed modules and migrations.
  await rm(join(backend, 'dist'), { recursive: true, force: true });
  await rename(staging, join(backend, 'dist'));
} finally {
  await rm(staging, { recursive: true, force: true });
}
