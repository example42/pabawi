import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import UserManagementPage from '../pages/UserManagementPage.svelte';
import UserDetailDialog from './UserDetailDialog.svelte';
import GroupDetailDialog from './GroupDetailDialog.svelte';
import { get, del } from '../lib/api';
import { authManager } from '../lib/auth.svelte';

vi.mock('../lib/api', () => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn() }));
vi.mock('../lib/auth.svelte', () => ({ authManager: { isAuthenticated: true, hasPermission: vi.fn(() => false) } }));
vi.mock('../lib/toast.svelte', () => ({ showError: vi.fn(), showSuccess: vi.fn() }));
vi.mock('../lib/router.svelte', () => ({ router: { navigate: vi.fn() } }));

const user = { id: 'external', username: 'ldap:external', email: null, displayName: 'Directory User',
  firstName: '', lastName: '', isActive: true, isAdmin: false, createdAt: '2026-10-21T12:00:00Z',
  updatedAt: '2026-10-21T12:00:00Z', lastLoginAt: null, groups: [], roles: [], roleSources: [],
  authentication: { profileReadOnly: true, sources: [{ provider: 'ldap', name: 'Corporate directory', directoryId: 'corporate', loginName: 'renamed-user' }] } };

afterEach(() => { cleanup(); vi.clearAllMocks(); vi.mocked(authManager.hasPermission).mockReturnValue(false); });

describe('nullable external contact email', () => {
  it('renders and filters the user table without assuming an email is present', async () => {
    vi.mocked(get).mockResolvedValue({ users: [user], pagination: { total: 1, page: 1, limit: 20, totalPages: 1 } });
    render(UserManagementPage);
    expect(await screen.findByText('Not provided')).toBeTruthy();
    const search = screen.getByPlaceholderText('Search by username, email, or name...');
    await fireEvent.input(search, { target: { value: 'absent@example.test' } });
    expect(screen.queryByText(`@${user.username}`)).toBeNull();
    await fireEvent.input(search, { target: { value: 'renamed-user' } });
    expect(screen.getByText(`@${user.username}`)).toBeTruthy();
  });

  it('renders missing contact email in user details', async () => {
    vi.mocked(get).mockResolvedValue(user);
    render(UserDetailDialog, { isOpen: true, userId: user.id, onClose: vi.fn(), onSaved: vi.fn() });
    expect(await screen.findByText('Not provided')).toBeTruthy();
    expect(screen.getByText(user.username)).toBeTruthy();
    expect(screen.getByText(/Corporate directory.*renamed-user/)).toBeTruthy();
    expect(screen.getByText(/Directory profile fields are read-only/)).toBeTruthy();
    expect(screen.queryByLabelText('Password')).toBeNull();
  });

  it('renders group members whose contact email is missing', async () => {
    vi.mocked(get).mockResolvedValue({ id: 'group', name: 'Operators', description: '',
      createdAt: user.createdAt, updatedAt: user.updatedAt, members: [user], roles: [] });
    render(GroupDetailDialog, { isOpen: true, groupId: 'group', onClose: vi.fn(), onSaved: vi.fn() });
    expect(await screen.findByText(/Not provided/)).toBeTruthy();
    expect(screen.getByText(user.username)).toBeTruthy();
  });
});

describe('directory role ownership in user details', () => {
  it('removes only a manual assignment and retains the directory role after reloading', async () => {
    vi.mocked(authManager.hasPermission).mockReturnValue(true);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const role = { id: 'viewer', name: 'Viewer', description: '', isBuiltIn: true };
    const external = { roleId: 'viewer', source: 'ldap', directoryId: 'corporate', groupName: 'Operators' };
    let removed = false;
    vi.mocked(del).mockImplementation(async () => { removed = true; });
    vi.mocked(get).mockImplementation(async url => {
      if (url === '/api/users/external') return { ...user, roles: [role],
        roleSources: removed ? [external] : [{ roleId: 'viewer', source: 'manual' }, external] };
      if (url.startsWith('/api/groups')) return { groups: [] };
      return { roles: [role] };
    });
    render(UserDetailDialog, { isOpen: true, userId: user.id, onClose: vi.fn(), onSaved: vi.fn() });
    await screen.findByText('Source: manual');
    await fireEvent.click(screen.getByRole('button', { name: 'Remove manual assignment for Viewer' }));
    expect(del).toHaveBeenCalledWith('/api/users/external/roles/viewer');
    expect(await screen.findByText('Source: ldap / corporate / Operators')).toBeTruthy();
    expect(screen.queryByText('Source: manual')).toBeNull();
    expect((screen.getByRole('button', { name: 'Remove manual assignment for Viewer' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Roles (1)')).toBeTruthy();
  });
});
