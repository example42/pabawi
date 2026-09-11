const { existsSync, readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const root = '/app';
const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
const lock = read(resolve(root, existsSync(resolve(root, 'root-lock.json')) ? 'root-lock.json' : 'package-lock.json'));
const overrides = read(resolve(root, 'package.json')).overrides;
const graph = [];
for (const [location, entry] of Object.entries(lock.packages)) {
  if (!location.includes('node_modules/') || entry.link) continue;
  const manifest = resolve(root, location, 'package.json');
  if (!existsSync(manifest)) continue;
  const pkg = read(manifest);
  if (pkg.version !== entry.version) throw new Error(`Lock mismatch: ${location}`);
  if (typeof overrides[pkg.name] === 'string' && pkg.version !== overrides[pkg.name]) {
    throw new Error(`Override mismatch: ${location}`);
  }
  graph.push({ location, name: pkg.name, version: pkg.version, integrity: entry.integrity });
}
process.stdout.write(JSON.stringify(graph.sort((a, b) => a.location.localeCompare(b.location)), null, 2) + '\n');
