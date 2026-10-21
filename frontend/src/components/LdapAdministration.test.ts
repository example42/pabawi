import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import LdapAdministration from './LdapAdministration.svelte';
import { authManager } from '../lib/auth.svelte';
import * as ldap from '../lib/ldapApi';

const guard = vi.hoisted(() => ({ admin: true }));
vi.mock('../lib/auth.svelte', () => ({ authManager: { get isAdmin() { return guard.admin; }, hasPermission: vi.fn(() => true) } }));
vi.mock('../lib/authProviders.svelte', () => ({ authProviders: { ldap: { name: 'Corporate directory' } } }));
vi.mock('../lib/api', () => ({ get: vi.fn().mockResolvedValue({
  roles: [{ id: 'viewer', name: 'Viewer' }, { id: 'operator', name: 'Operator' }], pagination: { totalPages: 1 },
}) }));
vi.mock('../lib/ldapApi', () => ({
  listLdapMappings: vi.fn(), searchLdapGroups: vi.fn(), createLdapMapping: vi.fn(),
  updateLdapMapping: vi.fn(), removeLdapMapping: vi.fn(), diagnoseLdap: vi.fn(),
}));

const subject = '00112233-4455-6677-8899-aabbccddeeff';
const mapping: ldap.LdapMapping = { id: 'mapping', directoryId: 'corporate', groupSubject: subject,
  groupName: 'Operators', groupDn: 'cn=operators,dc=example,dc=test',
  roleId: 'viewer', roleName: 'Viewer', enabled: true, source: 'ldap' };

beforeEach(() => {
  vi.clearAllMocks();
  guard.admin = true;
  vi.mocked(authManager.hasPermission).mockReturnValue(true);
  vi.mocked(ldap.listLdapMappings).mockResolvedValue({ items: [mapping] });
  vi.mocked(ldap.searchLdapGroups).mockResolvedValue({ items: [], nextCursor: null });
});

async function ready(): Promise<void> {
  await screen.findByText('Operators to Viewer: Enabled');
  await waitFor(() => expect((screen.getByRole('button', { name: 'Search groups' }) as HTMLButtonElement).disabled).toBe(true));
  await waitFor(() => expect((screen.getByRole('button', { name: 'Reload mappings' }) as HTMLButtonElement).disabled).toBe(false));
}

describe('LDAP role mapping administration', () => {
  it.each(['page', 'permission'])('does no directory work when the %s guard denies access', async gate => {
    if (gate === 'page') guard.admin = false;
    else vi.mocked(authManager.hasPermission).mockReturnValue(false);
    render(LdapAdministration);
    expect(screen.queryByRole('region', { name: 'LDAP administration' })).toBeNull();
    expect(ldap.listLdapMappings).not.toHaveBeenCalled();
  });

  it('renders empty search results without discarding stored mappings', async () => {
    render(LdapAdministration);
    await ready();
    await fireEvent.input(screen.getByLabelText('Search directory groups'), { target: { value: 'absent' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Search groups' }));
    expect(await screen.findByText('No directory groups found.')).toBeTruthy();
    expect(screen.getByText('Operators to Viewer: Enabled')).toBeTruthy();
  });

  it('retains the searched filter with its cursor and creates a mapping using only immutable IDs', async () => {
    vi.mocked(ldap.searchLdapGroups).mockResolvedValueOnce({
      items: [{ subject, dn: mapping.groupDn, name: mapping.groupName }], nextCursor: 'opaque',
    }).mockResolvedValueOnce({ items: [], nextCursor: null });
    render(LdapAdministration);
    await ready();
    await fireEvent.input(screen.getByLabelText('Search directory groups'), { target: { value: 'op' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Search groups' }));
    await screen.findByLabelText('Directory group');
    await fireEvent.input(screen.getByLabelText('Search directory groups'), { target: { value: 'edited' } });
    await fireEvent.click(screen.getByRole('button', { name: 'More groups' }));
    expect(ldap.searchLdapGroups).toHaveBeenLastCalledWith('op', 'opaque');
    await waitFor(() => expect((screen.getByLabelText('Directory group') as HTMLSelectElement).disabled).toBe(false));
    await fireEvent.change(screen.getByLabelText('Directory group'), { target: { value: subject } });
    await fireEvent.change(screen.getByLabelText('Pabawi role'), { target: { value: 'operator' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Create mapping' }));
    expect(ldap.createLdapMapping).toHaveBeenCalledExactlyOnceWith(subject, 'operator');
  });

  it('supports role replacement and outage-safe disablement, preserving labels on failure', async () => {
    render(LdapAdministration);
    await ready();
    await fireEvent.change(screen.getByLabelText('Mapped role'), { target: { value: 'operator' } });
    expect(ldap.updateLdapMapping).toHaveBeenLastCalledWith('mapping', { roleId: 'operator' });
    await waitFor(() => expect((screen.getByRole('button', { name: /Disable mapping/ }) as HTMLButtonElement).disabled).toBe(false));
    vi.mocked(ldap.updateLdapMapping).mockRejectedValueOnce(new Error('LDAP directory operation failed'));
    await fireEvent.click(screen.getByRole('button', { name: /Disable mapping/ }));
    expect(ldap.updateLdapMapping).toHaveBeenLastCalledWith('mapping', { enabled: false });
    expect((await screen.findByRole('alert')).textContent).toContain('LDAP directory operation failed');
    expect(screen.getByText('Operators to Viewer: Enabled')).toBeTruthy();
  });

  it('requires confirmation for removal and only removes the selected mapping', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(LdapAdministration);
    await ready();
    await fireEvent.click(screen.getByRole('button', { name: /Remove mapping/ }));
    expect(ldap.removeLdapMapping).not.toHaveBeenCalled();
    vi.mocked(window.confirm).mockReturnValue(true);
    await fireEvent.click(screen.getByRole('button', { name: /Remove mapping/ }));
    expect(ldap.removeLdapMapping).toHaveBeenCalledExactlyOnceWith('mapping');
  });

  it('shows failed stages and sends exact lookup input with selected mapped group subjects', async () => {
    vi.mocked(ldap.diagnoseLdap).mockResolvedValue({ authenticated: false, stages: [
      { stage: 'tls', status: 'passed', durationMs: 2 },
      { stage: 'eligibility', status: 'failed', durationMs: 3, code: 'INELIGIBLE' },
    ] });
    render(LdapAdministration);
    await ready();
    await fireEvent.input(screen.getByLabelText('Exact directory username (optional)'), { target: { value: ' a ' } });
    await fireEvent.click(screen.getByLabelText('Operators'));
    await fireEvent.click(screen.getByRole('button', { name: 'Run directory diagnostics' }));
    expect(ldap.diagnoseLdap).toHaveBeenCalledExactlyOnceWith({ username: ' a ', groupSubjects: [subject] });
    expect(await screen.findByText('eligibility: failed (3 ms), INELIGIBLE')).toBeTruthy();
    expect(screen.getByText('Lookup diagnostic result. No password authentication performed.')).toBeTruthy();
  });

  it('uses the current role when opened from its detail dialog', async () => {
    vi.mocked(ldap.searchLdapGroups).mockResolvedValue({ items: [
      { subject, dn: mapping.groupDn, name: mapping.groupName },
    ], nextCursor: null });
    render(LdapAdministration, { roleId: 'viewer' });
    await ready();
    await fireEvent.input(screen.getByLabelText('Search directory groups'), { target: { value: 'op' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Search groups' }));
    await screen.findByLabelText('Directory group');
    expect(screen.queryByLabelText('Pabawi role')).toBeNull();
    await fireEvent.change(screen.getByLabelText('Directory group'), { target: { value: subject } });
    await fireEvent.click(screen.getByRole('button', { name: 'Create mapping' }));
    expect(ldap.createLdapMapping).toHaveBeenCalledWith(subject, 'viewer');
  });
});
