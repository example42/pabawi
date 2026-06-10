import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the api module before importing the module under test
vi.mock('./api', () => ({
  get: vi.fn(),
  post: vi.fn(),
}));

// Mock the auth module
vi.mock('./auth.svelte', () => ({
  authManager: {
    setAuthDataFromSso: vi.fn(),
    isAuthenticated: false,
  },
}));

// Mock the router module
vi.mock('./router.svelte', () => ({
  router: {
    navigate: vi.fn(),
  },
}));

// Mock the toast module
vi.mock('./toast.svelte', () => ({
  showError: vi.fn(),
}));

import * as api from './api';
import { authManager } from './auth.svelte';
import { router } from './router.svelte';
import { entraIdAuth } from './entraIdAuth.svelte';

describe('EntraIdAuthStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset store state between tests
    entraIdAuth.isEntraIdEnabled = false;
    entraIdAuth.entraIdProviderName = 'Microsoft Entra ID';
    entraIdAuth.providerDiscoveryError = false;
    entraIdAuth.isExchangingCode = false;
    entraIdAuth.exchangeError = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('discoverProviders', () => {
    it('sets isEntraIdEnabled to true when API returns entraId enabled', async () => {
      vi.mocked(api.get).mockResolvedValue({
        local: true,
        entraId: { enabled: true, name: 'Contoso SSO' },
      });

      await entraIdAuth.discoverProviders();

      expect(entraIdAuth.isEntraIdEnabled).toBe(true);
      expect(entraIdAuth.entraIdProviderName).toBe('Contoso SSO');
      expect(entraIdAuth.providerDiscoveryError).toBe(false);
    });

    it('sets isEntraIdEnabled to false when entraId is not in response', async () => {
      vi.mocked(api.get).mockResolvedValue({ local: true });

      await entraIdAuth.discoverProviders();

      expect(entraIdAuth.isEntraIdEnabled).toBe(false);
      expect(entraIdAuth.providerDiscoveryError).toBe(false);
    });

    it('sets providerDiscoveryError on timeout/failure', async () => {
      vi.mocked(api.get).mockRejectedValue(new Error('Request timed out'));

      await entraIdAuth.discoverProviders();

      expect(entraIdAuth.providerDiscoveryError).toBe(true);
      expect(entraIdAuth.isEntraIdEnabled).toBe(false);
    });

    it('calls /api/auth/providers with 5s timeout', async () => {
      vi.mocked(api.get).mockResolvedValue({ local: true });

      await entraIdAuth.discoverProviders();

      expect(api.get).toHaveBeenCalledWith('/api/auth/providers', {
        timeout: 5000,
        maxRetries: 0,
        showRetryNotifications: false,
      });
    });
  });

  describe('handleSsoCallback', () => {
    let originalLocation: Location;

    beforeEach(() => {
      originalLocation = window.location;
      Object.defineProperty(window, 'location', {
        writable: true,
        value: {
          ...originalLocation,
          search: '',
          pathname: '/login',
        },
      });

      // Mock window.history.replaceState
      vi.spyOn(window.history, 'replaceState').mockImplementation(() => {});
    });

    afterEach(() => {
      Object.defineProperty(window, 'location', {
        writable: true,
        value: originalLocation,
      });
    });

    it('returns false when no code in URL', async () => {
      window.location.search = '';

      const result = await entraIdAuth.handleSsoCallback();

      expect(result).toBe(false);
      expect(api.post).not.toHaveBeenCalled();
    });

    it('posts code and stores tokens on success', async () => {
      window.location.search = '?code=test-auth-code';

      const mockResponse = {
        token: 'access-token-123',
        refreshToken: 'refresh-token-456',
        user: { id: '1', username: 'testuser', email: 'test@example.com' },
      };
      vi.mocked(api.post).mockResolvedValue(mockResponse);

      const result = await entraIdAuth.handleSsoCallback();

      expect(result).toBe(true);
      expect(api.post).toHaveBeenCalledWith(
        '/api/auth/entra-id/token',
        { code: 'test-auth-code' },
        { maxRetries: 0, showRetryNotifications: false },
      );
      expect(authManager.setAuthDataFromSso).toHaveBeenCalledWith(mockResponse);
      expect(router.navigate).toHaveBeenCalledWith('/');
    });

    it('sets exchangeError on token exchange failure', async () => {
      window.location.search = '?code=invalid-code';
      vi.mocked(api.post).mockRejectedValue(new Error('Token exchange failed'));

      const result = await entraIdAuth.handleSsoCallback();

      expect(result).toBe(false);
      expect(entraIdAuth.exchangeError).toBe('Token exchange failed');
    });

    it('cleans the URL after successful exchange', async () => {
      window.location.search = '?code=test-code';
      vi.mocked(api.post).mockResolvedValue({
        token: 'tok', refreshToken: 'ref', user: {},
      });

      await entraIdAuth.handleSsoCallback();

      expect(window.history.replaceState).toHaveBeenCalledWith({}, '', '/login');
    });

    it('cleans the URL after failed exchange', async () => {
      window.location.search = '?code=bad-code';
      vi.mocked(api.post).mockRejectedValue(new Error('failed'));

      await entraIdAuth.handleSsoCallback();

      expect(window.history.replaceState).toHaveBeenCalledWith({}, '', '/login');
    });
  });
});
