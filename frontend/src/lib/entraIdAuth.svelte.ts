/**
 * Entra ID (Azure AD) authentication state management using Svelte 5 runes
 *
 * Handles:
 * - Provider discovery via /api/auth/providers
 * - SSO callback code extraction and token exchange
 * - Error state for discovery and token exchange failures
 *
 * Requirements: 10.1, 10.2, 10.5, 10.6, 10.7
 */

import { get, post } from './api';
import { authManager } from './auth.svelte';
import type { AuthResponse } from './auth.svelte';
import { router } from './router.svelte';
import { showError } from './toast.svelte';

const PROVIDER_DISCOVERY_TIMEOUT_MS = 5000;

interface ProvidersResponse {
  local: boolean;
  entraId?: {
    enabled: boolean;
    name: string;
  };
}

class EntraIdAuthStore {
  isEntraIdEnabled = $state(false);
  entraIdProviderName = $state('Microsoft Entra ID');
  providerDiscoveryError = $state(false);
  isDiscovering = $state(false);
  isExchangingCode = $state(false);
  exchangeError = $state<string | null>(null);

  /**
   * Discover available authentication providers.
   * Calls GET /api/auth/providers with a 5s timeout.
   * On failure or timeout, sets providerDiscoveryError = true and
   * leaves isEntraIdEnabled = false (show only local login).
   *
   * Requirement: 10.1, 10.2, 10.7
   */
  async discoverProviders(): Promise<void> {
    this.isDiscovering = true;
    this.providerDiscoveryError = false;

    try {
      const response = await get<ProvidersResponse>('/api/auth/providers', {
        timeout: PROVIDER_DISCOVERY_TIMEOUT_MS,
        maxRetries: 0,
        showRetryNotifications: false,
      });

      if (response.entraId?.enabled) {
        this.isEntraIdEnabled = true;
        this.entraIdProviderName = response.entraId.name || 'Microsoft Entra ID';
      } else {
        this.isEntraIdEnabled = false;
      }
    } catch {
      this.providerDiscoveryError = true;
      this.isEntraIdEnabled = false;
    } finally {
      this.isDiscovering = false;
    }
  }

  /**
   * Handle the SSO callback redirect.
   * Extracts `code` from the current URL query parameters, POSTs it to
   * /api/auth/entra-id/token, stores tokens in auth state, and navigates
   * to the landing page.
   *
   * Returns true if a code was present and exchange was attempted,
   * false if no code was found (not a callback).
   *
   * Requirement: 10.5, 10.6
   */
  async handleSsoCallback(): Promise<boolean> {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');

    if (!code) {
      return false;
    }

    this.isExchangingCode = true;
    this.exchangeError = null;

    try {
      const response = await post<AuthResponse>('/api/auth/entra-id/token', { code }, {
        maxRetries: 0,
        showRetryNotifications: false,
      });

      // Store tokens in auth state using the same method as local login
      authManager.setAuthDataFromSso(response);

      // Clean the URL (remove ?code= parameter) and navigate to landing page
      window.history.replaceState({}, '', window.location.pathname);
      router.navigate('/');

      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'SSO authentication failed';
      this.exchangeError = message;
      showError('SSO authentication failed', message);

      // Clean the URL to remove the code parameter but stay on login page
      window.history.replaceState({}, '', window.location.pathname);

      return false;
    } finally {
      this.isExchangingCode = false;
    }
  }

  /**
   * Clear exchange error state
   */
  clearExchangeError(): void {
    this.exchangeError = null;
  }
}

export const entraIdAuth = new EntraIdAuthStore();
