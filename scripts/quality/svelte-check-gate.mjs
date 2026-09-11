#!/usr/bin/env node
/**
 * Component type-check gate.
 *
 * `eslint` ignores `**\/*.svelte` and `tsc --noEmit` never sees component
 * markup, so a type error inside a Svelte component reached deployment without
 * failing anything (finding I10). `svelte-check` closes that, but the existing
 * components carry a backlog of errors that cannot be cleared safely in one
 * change, so this wraps it in a ratchet: the recorded errors are tolerated and
 * anything else fails.
 *
 * The baseline records a count per (file, message) rather than line numbers,
 * which move whenever a component is edited. Fewer errors than the baseline is
 * reported, never failed; refresh it with `--update` after fixing some.
 *
 *   node scripts/quality/svelte-check-gate.mjs            # check
 *   node scripts/quality/svelte-check-gate.mjs --update   # rewrite the baseline
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const frontendDir = resolve(repoRoot, 'frontend');
const baselinePath = resolve(frontendDir, 'svelte-check-baseline.json');
const update = process.argv.includes('--update');

/** One machine-output line: `<timestamp> ERROR "<file>" <line>:<col> "<message>"`. */
const ERROR_LINE = /^\d+ ERROR "([^"]+)" \d+:\d+ "(.*)"$/;

function runSvelteCheck() {
  const result = spawnSync(
    'npx',
    ['svelte-check', '--tsconfig', './tsconfig.json', '--output', 'machine', '--threshold', 'error'],
    { cwd: frontendDir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );

  if (result.error) {
    throw new Error(`Failed to run svelte-check: ${result.error.message}`);
  }
  // svelte-check exits non-zero when it reports errors, which is the normal
  // case here. A run that produced no parsable output at all is the failure.
  const lines = `${result.stdout}\n${result.stderr}`.split('\n');
  if (!lines.some((line) => /^\d+ (COMPLETED|ERROR|WARNING)/.test(line))) {
    throw new Error(`svelte-check produced no diagnostics:\n${result.stdout}\n${result.stderr}`);
  }
  return lines;
}

function collect(lines) {
  const errors = new Map();
  for (const line of lines) {
    const match = ERROR_LINE.exec(line);
    if (!match) continue;
    const [, file, message] = match;
    const byMessage = errors.get(file) ?? new Map();
    byMessage.set(message, (byMessage.get(message) ?? 0) + 1);
    errors.set(file, byMessage);
  }
  return errors;
}

function toBaseline(errors) {
  const entries = {};
  let total = 0;
  for (const file of [...errors.keys()].sort()) {
    const byMessage = errors.get(file);
    entries[file] = {};
    for (const message of [...byMessage.keys()].sort()) {
      entries[file][message] = byMessage.get(message);
      total += byMessage.get(message);
    }
  }
  return { total, entries };
}

const errors = collect(runSvelteCheck());
const observed = toBaseline(errors);

if (update) {
  writeFileSync(baselinePath, `${JSON.stringify(observed, null, 2)}\n`);
  console.log(`Baseline updated: ${String(observed.total)} errors in ${String(Object.keys(observed.entries).length)} files.`);
  process.exit(0);
}

let baseline;
try {
  baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
} catch (error) {
  console.error(`Cannot read ${baselinePath}: ${error.message}`);
  console.error('Create it with: node scripts/quality/svelte-check-gate.mjs --update');
  process.exit(1);
}

const added = [];
const removed = [];

for (const [file, byMessage] of Object.entries(observed.entries)) {
  for (const [message, count] of Object.entries(byMessage)) {
    const allowed = baseline.entries[file]?.[message] ?? 0;
    if (count > allowed) added.push({ file, message, count, allowed });
  }
}
for (const [file, byMessage] of Object.entries(baseline.entries)) {
  for (const [message, allowed] of Object.entries(byMessage)) {
    const count = observed.entries[file]?.[message] ?? 0;
    if (count < allowed) removed.push({ file, message, count, allowed });
  }
}

if (removed.length > 0) {
  console.log(`${String(removed.length)} baseline entries are now clean. Refresh with: node scripts/quality/svelte-check-gate.mjs --update`);
  for (const entry of removed) {
    console.log(`  fixed  ${entry.file}: ${entry.message.split('\\n')[0]} (${String(entry.allowed)} -> ${String(entry.count)})`);
  }
}

if (added.length > 0) {
  console.error(`\nsvelte-check reports ${String(added.length)} error type(s) that are not in the baseline:`);
  for (const entry of added) {
    console.error(`  ${entry.file}: ${entry.message.split('\\n')[0]} (${String(entry.count)}, baseline ${String(entry.allowed)})`);
  }
  console.error('\nFix them. The baseline records existing component debt and must not grow.');
  process.exit(1);
}

console.log(`svelte-check: ${String(observed.total)} known errors, none new (baseline ${String(baseline.total)}).`);
