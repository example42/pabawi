import { get, post, put, del } from './api';
import { authManager } from './auth.svelte';

export interface LdapGroup { subject: string; dn: string; name: string }
export interface LdapMapping {
  id: string; directoryId: string; groupSubject: string; groupDn: string; groupName: string;
  roleId: string; roleName: string; enabled: boolean; source: 'ldap';
}
export interface LdapDiagnostics {
  authenticated: false;
  stages: { stage: string; status: 'passed' | 'failed'; durationMs: number; code?: string }[];
  groupSubjects?: string[];
}

const once = { maxRetries: 0, showRetryNotifications: false };
export function searchLdapGroups(query: string, cursor?: string): Promise<{ items: LdapGroup[]; nextCursor: string | null }> {
  const params = new URLSearchParams({ query });
  if (cursor) params.set('cursor', cursor);
  return get('/api/auth/ldap/groups?' + params.toString(), once);
}
export function listLdapMappings(): Promise<{ items: LdapMapping[] }> {
  return get('/api/auth/ldap/mappings', once);
}
export function createLdapMapping(groupSubject: string, roleId: string): Promise<LdapMapping> {
  return post('/api/auth/ldap/mappings', { groupSubject, roleId }, once);
}
export function updateLdapMapping(id: string, input: { roleId?: string; enabled?: boolean }): Promise<LdapMapping> {
  return put('/api/auth/ldap/mappings/' + encodeURIComponent(id), input, once);
}
export function removeLdapMapping(id: string): Promise<void> {
  return del('/api/auth/ldap/mappings/' + encodeURIComponent(id), once);
}

export async function diagnoseLdap(input: { username?: string; groupSubjects?: string[] }): Promise<LdapDiagnostics> {
  // Failed directory stages use non-2xx statuses and must remain visible in the report.
  const response = await fetch('/api/auth/ldap/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (authManager.token ?? '') },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(65_000),
  });
  const data = await response.json() as Partial<Omit<LdapDiagnostics, 'authenticated'>> & { authenticated?: unknown; error?: { message?: string } };
  if ([200, 422, 429, 503].includes(response.status) && data.authenticated === false && Array.isArray(data.stages)) {
    return { authenticated: false, stages: data.stages, ...(data.groupSubjects ? { groupSubjects: data.groupSubjects } : {}) };
  }
  throw new Error(data.error?.message ?? 'Directory diagnostics failed (HTTP ' + String(response.status) + ')');
}
