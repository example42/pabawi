import { describe, expect, it, vi } from 'vitest';
import { authProviders } from './authProviders.svelte';
import { get } from './api';
vi.mock('./api', () => ({ get: vi.fn() }));

describe('common authentication provider discovery', () => {
  it('keeps configured LDAP visible independently of directory availability', async () => {
    vi.mocked(get).mockResolvedValue({ local: true, ldap: { enabled: true, name: 'Corporate', loginHelpUrl: 'https://help.example.test/' } });
    await authProviders.discover();
    expect(authProviders.ldap?.name).toBe('Corporate');
    expect(authProviders.ldapHelpUrl).toBe('https://help.example.test/');
  });

  it.each(['javascript:alert(1)', 'data:text/html,unsafe', '//example.test'])('rejects unsafe help URL %s', async loginHelpUrl => {
    vi.mocked(get).mockResolvedValue({ local: true, ldap: { enabled: true, name: 'Corporate', loginHelpUrl } });
    await authProviders.discover();
    expect(authProviders.ldapHelpUrl).toBeNull();
  });

  it('clears stale provider metadata after discovery fails and retains local emergency login', async () => {
    vi.mocked(get).mockRejectedValue(new Error('Unavailable'));
    await authProviders.discover();
    expect(authProviders.error).toBe(true);
    expect(authProviders.local).toBe(true);
    expect(authProviders.ldap).toBeUndefined();
    expect(authProviders.entraId).toBeUndefined();
  });
});
