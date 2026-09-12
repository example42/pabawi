import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

test('backend rebuild replaces retired migrations and modules with the current source tree', async () => {
  const root = new URL('../../', import.meta.url);
  const source = new URL('backend/src/database/migrations/', root);
  const output = new URL('backend/dist/database/migrations/', root);
  await mkdir(output, { recursive: true });
  await writeFile(new URL('000_retired_build_fixture.sql', output), '-- retired build fixture\n');
  const retiredModule = new URL('backend/dist/retired-build-fixture.js', root);
  await writeFile(retiredModule, '// retired build fixture\n');
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('scripts/compilation/backend.mjs', root))], {
    encoding: 'utf8', timeout: 120_000,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.deepEqual((await readdir(output)).sort(), (await readdir(source)).sort());
  for (const name of await readdir(source)) {
    assert.deepEqual(await readFile(new URL(name, output)), await readFile(new URL(name, source)));
  }
  await assert.rejects(readFile(retiredModule), { code: 'ENOENT' });
});
