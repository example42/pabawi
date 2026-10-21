import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';

vi.mock('../lib/entraIdAuth.svelte', () => ({
  entraIdAuth: {
    isExchangingCode: false,
    exchangeError: null as string | null,
    isDiscovering: false,
    handleSsoCallback: vi.fn().mockResolvedValue(false),
    clearExchangeError: vi.fn(),
  },
}));

vi.mock('../lib/auth.svelte', () => ({
  authManager: {
    isAuthenticated: false,
    error: null,
    login: vi.fn().mockResolvedValue(false),
    clearError: vi.fn(),
  },
}));

vi.mock('../lib/router.svelte', () => ({
  router: {
    navigate: vi.fn(),
    navigateToIntendedOrDefault: vi.fn(),
  },
}));

vi.mock('../lib/toast.svelte', () => ({
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

vi.mock('../lib/api', () => ({
  get: vi.fn().mockResolvedValue({ config: null }),
  post: vi.fn(),
  getErrorGuidance: vi.fn(() => ({ guidance: undefined })),
}));

vi.mock('../lib/authProviders.svelte', () => ({
  authProviders: { local: true, entraId: undefined as { enabled: boolean; name: string } | undefined,
    ldap: undefined as { enabled: boolean; name: string; loginHelpUrl: string } | undefined,
    ldapHelpUrl: null as string | null, error: false, isDiscovering: false, discover: vi.fn().mockResolvedValue(undefined) },
}));

import { authProviders } from '../lib/authProviders.svelte';
import { authManager } from '../lib/auth.svelte';
import LoginPage from './LoginPage.svelte';
import { entraIdAuth } from '../lib/entraIdAuth.svelte';

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock state
    authProviders.local = true;
    authProviders.entraId = undefined;
    authProviders.ldap = undefined;
    authProviders.error = false;
    entraIdAuth.isExchangingCode = false;
    entraIdAuth.exchangeError = null;
    vi.mocked(entraIdAuth.handleSsoCallback).mockResolvedValue(false);
    vi.mocked(authProviders.discover).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('SSO button conditional rendering', () => {
    it('shows SSO button when entraIdAuth.isEntraIdEnabled is true', () => {
      authProviders.entraId = { enabled: true, name: 'Microsoft Entra ID' };

      render(LoginPage);

      expect(screen.getByRole('button', { name: /sign in with microsoft/i })).toBeTruthy();
    });

    it('hides SSO button when entraIdAuth.isEntraIdEnabled is false', () => {
      authProviders.entraId = undefined;

      render(LoginPage);

      expect(screen.queryByRole('button', { name: /sign in with microsoft/i })).toBeNull();
    });
  });

  describe('Provider discovery error', () => {
    it('shows warning when providerDiscoveryError is true', () => {
      authProviders.error = true;

      render(LoginPage);

      expect(screen.getByText(/Authentication provider availability could not be determined/)).toBeTruthy();
    });

    it('does not show warning when providerDiscoveryError is false', () => {
      authProviders.error = false;

      render(LoginPage);

      expect(screen.queryByText(/Authentication provider availability could not be determined/)).toBeNull();
    });
  });

  describe('SSO code exchange in progress', () => {
    it('shows "Completing sign-in..." when isExchangingCode is true', () => {
      entraIdAuth.isExchangingCode = true;

      render(LoginPage);

      expect(screen.getByText('Completing sign-in...')).toBeTruthy();
    });

    it('hides local login form when isExchangingCode is true', () => {
      entraIdAuth.isExchangingCode = true;

      render(LoginPage);

      expect(screen.queryByLabelText('Username')).toBeNull();
    });
  });

  describe('Token exchange error', () => {
    it('shows error message when exchangeError is set', () => {
      entraIdAuth.exchangeError = 'Token exchange failed';

      render(LoginPage);

      expect(screen.getByText('SSO authentication failed')).toBeTruthy();
      expect(screen.getByText('Token exchange failed')).toBeTruthy();
    });

    it('shows SSO button below error when entraId is enabled', () => {
      entraIdAuth.exchangeError = 'Something went wrong';
      authProviders.entraId = { enabled: true, name: 'Microsoft Entra ID' };

      render(LoginPage);

      expect(screen.getByText('SSO authentication failed')).toBeTruthy();
      expect(screen.getByRole('button', { name: /sign in with microsoft/i })).toBeTruthy();
    });
  });

  describe('Local login form always present', () => {
    it('shows local login form when SSO is disabled', () => {
      authProviders.entraId = undefined;

      render(LoginPage);

      expect(screen.getByLabelText('Username')).toBeTruthy();
      expect(screen.getByLabelText('Password')).toBeTruthy();
      expect(screen.getByRole('button', { name: /sign in$/i })).toBeTruthy();
    });

    it('shows both SSO button and local login form when SSO is enabled', () => {
      authProviders.entraId = { enabled: true, name: 'Microsoft Entra ID' };

      render(LoginPage);

      expect(screen.getByRole('button', { name: /sign in with microsoft/i })).toBeTruthy();
      expect(screen.getByLabelText('Username')).toBeTruthy();
      expect(screen.getByLabelText('Password')).toBeTruthy();
    });
  });
});

describe('explicit password provider selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authProviders.local = true;
    authProviders.ldap = { enabled: true, name: 'Corporate directory', loginHelpUrl: '' };
    authProviders.error = false;
    entraIdAuth.isExchangingCode = false;
    entraIdAuth.exchangeError = null;
    vi.mocked(entraIdAuth.handleSsoCallback).mockResolvedValue(false);
    vi.mocked(authProviders.discover).mockResolvedValue(undefined);
  });

  async function submit(username: string, password: string): Promise<void> {
    await fireEvent.input(screen.getByLabelText('Username'), { target: { value: username } });
    await fireEvent.input(screen.getByLabelText('Password'), { target: { value: password } });
    await fireEvent.submit(screen.getByRole('button', { name: /^sign in$/i }).closest('form')!);
  }

  it('submits short LDAP credentials unchanged without falling through after denial', async () => {
    render(LoginPage);
    await waitFor(() => expect(authProviders.discover).toHaveBeenCalled());
    await fireEvent.change(screen.getByLabelText('Sign in using'), { target: { value: 'ldap' } });
    await submit(' a ', ' x ');
    expect(authManager.login).toHaveBeenCalledExactlyOnceWith({ username: ' a ', password: ' x ' }, 'ldap');
    expect((screen.getByLabelText('Sign in using') as HTMLSelectElement).value).toBe('ldap');
    expect((screen.getByLabelText('Password') as HTMLInputElement).value).toBe('');
  });

  it('keeps local validation and clears credentials when provider changes', async () => {
    render(LoginPage);
    await submit('a', 'x');
    expect(authManager.login).not.toHaveBeenCalled();
    expect(screen.getByText('Password must be at least 8 characters')).toBeTruthy();
    await fireEvent.change(screen.getByLabelText('Sign in using'), { target: { value: 'ldap' } });
    expect((screen.getByLabelText('Password') as HTMLInputElement).value).toBe('');
    expect(screen.queryByText('Password must be at least 8 characters')).toBeNull();
  });

  it('rejects oversized UTF-8 directory inputs before submission', async () => {
    render(LoginPage);
    await fireEvent.change(screen.getByLabelText('Sign in using'), { target: { value: 'ldap' } });
    await submit('é'.repeat(513), 'é'.repeat(2049));
    expect(authManager.login).not.toHaveBeenCalled();
    expect(screen.getByText('Username must be at most 1024 bytes')).toBeTruthy();
    expect(screen.getByText('Password must be at most 4096 bytes')).toBeTruthy();
  });
});
