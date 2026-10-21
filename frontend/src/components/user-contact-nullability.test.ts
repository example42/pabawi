import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import UserManagementPage from '../pages/UserManagementPage.svelte';
import UserDetailDialog from './UserDetailDialog.svelte';
import GroupDetailDialog from './GroupDetailDialog.svelte';
import { get } from '../lib/api';

vi.mock('../lib/api', () => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn() }));
vi.mock('../lib/auth.svelte', () => ({ authManager: { isAuthenticated: true, hasPermission: () => false } }));
vi.mock('../lib/toast.svelte', () => ({ showError: vi.fn(), showSuccess: vi.fn() }));
vi.mock('../lib/router.svelte', () => ({ router: { navigate: vi.fn() } }));

const user = { id: 'external', username: 'ldap:external', email: null, displayName: 'Directory User',
  firstName: '', lastName: '', isActive: true, isAdmin: false, createdAt: '2026-10-21T12:00:00Z',
  updatedAt: '2026-10-21T12:00:00Z', lastLoginAt: null, groups: [], roles: [] };

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('nullable external contact email', () => {
  it('renders and filters the user table without assuming an email is present', async () => {
    vi.mocked(get).mockResolvedValue({ users: [user], pagination: { total: 1, page: 1, limit: 20, totalPages: 1 } });
    render(UserManagementPage);
    expect(await screen.findByText('Not provided')).toBeTruthy();
    const search = screen.getByPlaceholderText('Search by username, email, or name...');
    await fireEvent.input(search, { target: { value: 'absent@example.test' } });
    expect(screen.queryByText(`@${user.username}`)).toBeNull();
    await fireEvent.input(search, { target: { value: 'external' } });
    expect(screen.getByText(`@${user.username}`)).toBeTruthy();
  });

  it('renders missing contact email in user details', async () => {
    vi.mocked(get).mockResolvedValue(user);
    render(UserDetailDialog, { isOpen: true, userId: user.id, onClose: vi.fn(), onSaved: vi.fn() });
    expect(await screen.findByText('Not provided')).toBeTruthy();
    expect(screen.getByText(user.username)).toBeTruthy();
  });

  it('renders group members whose contact email is missing', async () => {
    vi.mocked(get).mockResolvedValue({ id: 'group', name: 'Operators', description: '',
      createdAt: user.createdAt, updatedAt: user.updatedAt, members: [user], roles: [] });
    render(GroupDetailDialog, { isOpen: true, groupId: 'group', onClose: vi.fn(), onSaved: vi.fn() });
    expect(await screen.findByText(/Not provided/)).toBeTruthy();
    expect(screen.getByText(user.username)).toBeTruthy();
  });
});
