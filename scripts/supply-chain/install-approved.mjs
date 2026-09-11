import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
const policy = read(resolve(root, 'package.json')).lavamoat.allowScripts;
const lock = read(resolve(root, 'package-lock.json'));
const events = ['preinstall', 'install', 'postinstall'];
const approved = [];

// Validate the whole installed workspace graph before granting any script execution.
for (const [location, entry] of Object.entries(lock.packages)) {
  if (!location.includes('node_modules/') || entry.link) continue;
  const directory = resolve(root, location);
  const manifest = resolve(directory, 'package.json');
  if (!existsSync(manifest)) continue;
  const pkg = read(manifest);
  if (pkg.version !== entry.version) throw new Error(`Lock mismatch: ${location}`);
  const implicitBuild = existsSync(resolve(directory, 'binding.gyp'))
    && !pkg.scripts?.install && !pkg.scripts?.preinstall;
  if (!implicitBuild && !events.some((event) => pkg.scripts?.[event])) continue;
  if (!Object.hasOwn(policy, pkg.name) || typeof policy[pkg.name] !== 'boolean') {
    throw new Error(`Unreviewed dependency scripts: ${location} (${pkg.name})`);
  }
  if (!policy[pkg.name]) continue;
  if (implicitBuild) throw new Error(`Explicit install script required: ${location}`);
  approved.push({ directory, pkg });
}

for (const event of events) {
  for (const { directory, pkg } of approved) {
    if (!pkg.scripts?.[event]) continue;
    // Explicit npm run executes just this event; ignore-scripts suppresses adjacent hooks.
    const result = spawnSync('npm', ['run', event, '--prefix', directory, '--ignore-scripts'], {
      stdio: 'inherit',
      env: { ...process.env, npm_config_ignore_scripts: 'true' },
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Approved script failed: ${pkg.name}:${event}`);
  }
}
