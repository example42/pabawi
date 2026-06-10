import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';

vi.mock('../lib/entraIdAuth.svelte', () => ({
  entraIdAuth: {
    isEntraIdEnabled: false,
    entraIdProviderName: 'Microsoft Entra ID',
    providerDiscoveryError: false,
    isExchangingCode: false,
    exchangeError: null as string | null,
    isDiscovering: false,
    discoverProviders: vi.fn().mockResolvedValue(undefined),
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

import LoginPage from './LoginPage.svelte';
import { entraIdAuth } from '../lib/entraIdAuth.svelte';

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock state
    entraIdAuth.isEntraIdEnabled = false;
    entraIdAuth.entraIdProviderName = 'Microsoft Entra ID';
    entraIdAuth.providerDiscoveryError = false;
    entraIdAuth.isExchangingCode = false;
    entraIdAuth.exchangeError = null;
    vi.mocked(entraIdAuth.handleSsoCallback).mockResolvedValue(false);
    vi.mocked(entraIdAuth.discoverProviders).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('SSO button conditional rendering', () => {
    it('shows SSO button when entraIdAuth.isEntraIdEnabled is true', () => {
      entraIdAuth.isEntraIdEnabled = true;

      render(LoginPage);

      expect(screen.getByRole('button', { name: /sign in with microsoft/i })).toBeTruthy();
    });

    it('hides SSO button when entraIdAuth.isEntraIdEnabled is false', () => {
      entraIdAuth.isEntraIdEnabled = false;

      render(LoginPage);

      expect(screen.queryByRole('button', { name: /sign in with microsoft/i })).toBeNull();
    });
  });

  describe('Provider discovery error', () => {
    it('shows warning when providerDiscoveryError is true', () => {
      entraIdAuth.providerDiscoveryError = true;

      render(LoginPage);

      expect(screen.getByText(/SSO availability could not be determined/)).toBeTruthy();
    });

    it('does not show warning when providerDiscoveryError is false', () => {
      entraIdAuth.providerDiscoveryError = false;

      render(LoginPage);

      expect(screen.queryByText(/SSO availability could not be determined/)).toBeNull();
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
      entraIdAuth.isEntraIdEnabled = true;

      render(LoginPage);

      expect(screen.getByText('SSO authentication failed')).toBeTruthy();
      expect(screen.getByRole('button', { name: /sign in with microsoft/i })).toBeTruthy();
    });
  });

  describe('Local login form always present', () => {
    it('shows local login form when SSO is disabled', () => {
      entraIdAuth.isEntraIdEnabled = false;

      render(LoginPage);

      expect(screen.getByLabelText('Username')).toBeTruthy();
      expect(screen.getByLabelText('Password')).toBeTruthy();
      expect(screen.getByRole('button', { name: /sign in$/i })).toBeTruthy();
    });

    it('shows both SSO button and local login form when SSO is enabled', () => {
      entraIdAuth.isEntraIdEnabled = true;

      render(LoginPage);

      expect(screen.getByRole('button', { name: /sign in with microsoft/i })).toBeTruthy();
      expect(screen.getByLabelText('Username')).toBeTruthy();
      expect(screen.getByLabelText('Password')).toBeTruthy();
    });
  });
});
