import { readFileSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';

export const adCases = ['binary-guid-retrieval-filter', 'rename-recreation', 'account-states',
  'nested-groups', 'large-membership', 'equivalent-controller-failover'];

export function validateAdConfig(value) {
  const keys = ['implementation', 'disposableLab', 'baseDn', 'parentOu', 'controllers', 'caFile',
    'fixtureBindDn', 'fixturePasswordFile', 'lookupBindDn', 'lookupPasswordFile', 'userPasswordFile',
    'largeMemberCount', 'maxLockoutAttempts', 'replicationTimeoutSeconds'];
  if (!value || Object.keys(value).some(key => !keys.includes(key)) ||
      value.implementation !== 'microsoft-ad-ds' || value.disposableLab !== true) {
    throw new Error('Explicit Microsoft AD DS disposable-lab attestation is required');
  }
  for (const key of ['baseDn', 'parentOu', 'fixtureBindDn', 'lookupBindDn']) {
    if (typeof value[key] !== 'string' || !value[key] || value[key].length > 8192) throw new Error('Invalid ' + key);
  }
  if (!Array.isArray(value.controllers) || value.controllers.length !== 2) throw new Error('Two equivalent controllers required');
  for (const endpoint of value.controllers) {
    if (Object.keys(endpoint).sort().join(',') !== 'hostname,ldapsPort,starttlsPort' ||
        typeof endpoint.hostname !== 'string' || endpoint.hostname.length > 253 ||
        !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(endpoint.hostname) ||
        ![endpoint.ldapsPort, endpoint.starttlsPort].every(port => Number.isInteger(port) && port > 0 && port <= 65535)) {
      throw new Error('Controllers require FQDNs and explicit TLS ports');
    }
  }
  if (value.controllers[0].hostname.toLowerCase() === value.controllers[1].hostname.toLowerCase()) throw new Error('Distinct controllers required');
  for (const key of ['caFile', 'fixturePasswordFile', 'lookupPasswordFile', 'userPasswordFile']) {
    if (typeof value[key] !== 'string' || !isAbsolute(value[key])) throw new Error('Absolute local file reference required: ' + key);
  }
  for (const [key, min, max] of [['largeMemberCount', 1501, 3000], ['maxLockoutAttempts', 1, 20], ['replicationTimeoutSeconds', 1, 300]]) {
    if (!Number.isInteger(value[key]) || value[key] < min || value[key] > max) throw new Error('Bounded value required: ' + key);
  }
  return value;
}

export function localSecret(path, repository) {
  const target = realpathSync(path);
  const within = relative(realpathSync(repository), target);
  const metadata = statSync(target);
  if (!within.startsWith('..' + '/') && within !== '..' || !metadata.isFile() ||
      (metadata.mode & 0o077) !== 0 || metadata.size < 1 || metadata.size > 8192) {
    throw new Error('Secrets must be private regular files outside the repository');
  }
  const text = readFileSync(target, 'utf8').replace(/\r?\n$/, '');
  if (!text || /[\r\n\0]/.test(text)) throw new Error('Secret file must contain one nonempty line');
  return text;
}

export function readAdConfig(path) {
  return validateAdConfig(JSON.parse(readFileSync(resolve(path), 'utf8')));
}
