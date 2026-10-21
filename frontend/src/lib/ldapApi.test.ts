import { afterEach, describe, expect, it, vi } from 'vitest';
import { diagnoseLdap, searchLdapGroups, createLdapMapping } from './ldapApi';
import { get, post } from './api';

vi.mock('./auth.svelte', () => ({ authManager: { token: 'synthetic-access-token' } }));
vi.mock('./api', () => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn() }));
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe('LDAP administration HTTP client', () => {
  it('encodes query and opaque cursor separately and never sends directory overrides', async () => {
    await searchLdapGroups('a&filter=*', 'opaque');
    expect(get).toHaveBeenCalledWith('/api/auth/ldap/groups?query=a%26filter%3D*&cursor=opaque',
      { maxRetries: 0, showRetryNotifications: false });
    await createLdapMapping('subject', 'role');
    expect(post).toHaveBeenCalledWith('/api/auth/ldap/mappings', { groupSubject: 'subject', roleId: 'role' },
      { maxRetries: 0, showRetryNotifications: false });
  });

  it.each([200, 422, 429, 503])('preserves stage reports at HTTP %s without replay', async status => {
    const report = { authenticated: false, stages: [{ stage: 'lookup', status: 'failed', durationMs: 2, code: 'UNAVAILABLE' }] };
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(report), { status }));
    vi.stubGlobal('fetch', fetch);
    expect(await diagnoseLdap({ username: 'a' })).toEqual(report);
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer synthetic-access-token');
    expect(fetch.mock.calls[0][1].body).toBe(JSON.stringify({ username: 'a' }));
  });

  it.each([401, 403, 429])('renders HTTP %s guard errors without treating them as diagnostics', async status => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { message: 'Access unavailable' },
    }), { status })));
    await expect(diagnoseLdap({})).rejects.toThrow('Access unavailable');
  });
});
