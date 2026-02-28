/**
 * Authentication state management using Svelte 5 runes
 *
 * Handles:
 * - Token storage in localStorage
 * - Automatic token refresh
 * - Token expiration handling
 * - User session management
 *
 * Requirements: 19.1, 19.2, 19.3
 */

import { logger } from './logger.svelte';

const API_BASE_URL = '/api';
const TOKEN_KEY = 'authToken';
const REFRESH_TOKEN_KEY = 'refreshToken';
const USER_KEY = 'authUser';

// Token refresh timing (refresh 5 minutes before expiration)
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;
const ACCESS_TOKEN_LIFETIME_MS = 60 * 60 * 1000; // 1 hour

export interface UserDTO {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  isAdmin: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
}

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  refreshToken: string;
  user: UserDTO;
}

export interface AuthError {
  message: string;
  code?: string;
}

class AuthManager {
  private _token = $state<string | null>(null);
  private _refreshToken = $state<string | null>(null);
  private _user = $state<UserDTO | null>(null);
  private _isAuthenticated = $state<boolean>(false);
  private _isLoading = $state<boolean>(false);
  private _error = $state<AuthError | null>(null);
  private _tokenRefreshTimer: number | null = null;
  private _tokenExpiresAt: number | null = null;

  constructor() {
    // Initialize from localStorage on client side
    if (typeof window !== 'undefined') {
      this.loadFromStorage();
      this.scheduleTokenRefresh();
    }
  }

  // Getters
  get token(): string | null {
    return this._token;
  }

  get refreshToken(): string | null {
    return this._refreshToken;
  }

  get user(): UserDTO | null {
    return this._user;
  }

  get isAuthenticated(): boolean {
    return this._isAuthenticated;
  }

  get isLoading(): boolean {
    return this._isLoading;
  }

  get error(): AuthError | null {
    return this._error;
  }

  get isAdmin(): boolean {
    return this._user?.isAdmin ?? false;
  }

  /**
   * Login with username and password
   * Requirement: 1.1, 1.2, 6.1
   */
  async login(credentials: LoginCredentials): Promise<boolean> {
    this._isLoading = true;
    this._error = null;

    logger.info('Auth', 'login', 'Attempting user login', {
      username: credentials.username,
    });

    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(credentials),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error || 'Login failed';

        logger.warn('Auth', 'login', 'Login failed', {
          status: response.status,
          error: errorMessage,
        });

        this._error = {
          message: errorMessage,
          code: `HTTP_${response.status}`,
        };
        return false;
      }

      const data: AuthResponse = await response.json();

      this.setAuthData(data);

      logger.info('Auth', 'login', 'Login successful', {
        userId: data.user.id,
        username: data.user.username,
      });

      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Network error';

      logger.error('Auth', 'login', 'Login error', error as Error);

      this._error = {
        message: errorMessage,
        code: 'NETWORK_ERROR',
      };
      return false;
    } finally {
      this._isLoading = false;
    }
  }

  /**
   * Logout and clear all auth data
   * Requirement: 1.6, 6.4
   */
  async logout(): Promise<void> {
    logger.info('Auth', 'logout', 'Logging out user', {
      userId: this._user?.id,
    });

    // Call logout endpoint to revoke tokens
    if (this._token) {
      try {
        await fetch(`${API_BASE_URL}/auth/logout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this._token}`,
          },
        });
      } catch (error) {
        logger.warn('Auth', 'logout', 'Logout API call failed', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        // Continue with local logout even if API call fails
      }
    }

    this.clearAuthData();

    logger.info('Auth', 'logout', 'Logout complete');
  }

  /**
   * Refresh the access token using refresh token
   * Requirement: 6.3, 19.2
   */
  async refreshAccessToken(): Promise<boolean> {
    if (!this._refreshToken) {
      logger.warn('Auth', 'refreshAccessToken', 'No refresh token available');
      this.clearAuthData();
      return false;
    }

    logger.debug('Auth', 'refreshAccessToken', 'Refreshing access token');

    try {
      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          refreshToken: this._refreshToken,
        }),
      });

      if (!response.ok) {
        logger.warn('Auth', 'refreshAccessToken', 'Token refresh failed', {
          status: response.status,
        });

        // If refresh fails, clear auth data and require re-login
        this.clearAuthData();
        return false;
      }

      const data: AuthResponse = await response.json();

      this.setAuthData(data);

      logger.info('Auth', 'refreshAccessToken', 'Token refreshed successfully');

      return true;
    } catch (error) {
      logger.error('Auth', 'refreshAccessToken', 'Token refresh error', error as Error);

      // Clear auth data on error
      this.clearAuthData();
      return false;
    }
  }

  /**
   * Check if token is expired or about to expire
   * Requirement: 19.3
   */
  isTokenExpired(): boolean {
    if (!this._tokenExpiresAt) {
      return true;
    }

    // Consider token expired if it expires within the buffer time
    return Date.now() >= (this._tokenExpiresAt - TOKEN_REFRESH_BUFFER_MS);
  }

  /**
   * Get authorization header value
   */
  getAuthHeader(): string | null {
    return this._token ? `Bearer ${this._token}` : null;
  }

  /**
   * Clear error state
   */
  clearError(): void {
    this._error = null;
  }

  // Private methods

  private setAuthData(data: AuthResponse): void {
    this._token = data.token;
    this._refreshToken = data.refreshToken;
    this._user = data.user;
    this._isAuthenticated = true;
    this._tokenExpiresAt = Date.now() + ACCESS_TOKEN_LIFETIME_MS;

    // Save to localStorage (Requirement: 19.1)
    if (typeof window !== 'undefined') {
      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(REFRESH_TOKEN_KEY, data.refreshToken);
      localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    }

    // Schedule automatic token refresh (Requirement: 19.2)
    this.scheduleTokenRefresh();
  }

  private clearAuthData(): void {
    this._token = null;
    this._refreshToken = null;
    this._user = null;
    this._isAuthenticated = false;
    this._tokenExpiresAt = null;

    // Clear localStorage
    if (typeof window !== 'undefined') {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    }

    // Clear refresh timer
    if (this._tokenRefreshTimer !== null) {
      window.clearTimeout(this._tokenRefreshTimer);
      this._tokenRefreshTimer = null;
    }
  }

  private loadFromStorage(): void {
    try {
      const token = localStorage.getItem(TOKEN_KEY);
      const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
      const userJson = localStorage.getItem(USER_KEY);

      if (token && refreshToken && userJson) {
        this._token = token;
        this._refreshToken = refreshToken;
        this._user = JSON.parse(userJson);
        this._isAuthenticated = true;
        this._tokenExpiresAt = Date.now() + ACCESS_TOKEN_LIFETIME_MS;

        logger.info('Auth', 'loadFromStorage', 'Loaded auth data from storage', {
          userId: this._user?.id,
        });

        // Check if token needs refresh immediately
        if (this.isTokenExpired()) {
          logger.info('Auth', 'loadFromStorage', 'Token expired, refreshing');
          this.refreshAccessToken();
        }
      }
    } catch (error) {
      logger.error('Auth', 'loadFromStorage', 'Failed to load auth data', error as Error);
      this.clearAuthData();
    }
  }

  private scheduleTokenRefresh(): void {
    // Clear existing timer
    if (this._tokenRefreshTimer !== null) {
      window.clearTimeout(this._tokenRefreshTimer);
    }

    if (!this._tokenExpiresAt || !this._isAuthenticated) {
      return;
    }

    // Calculate when to refresh (5 minutes before expiration)
    const refreshAt = this._tokenExpiresAt - TOKEN_REFRESH_BUFFER_MS;
    const delay = Math.max(0, refreshAt - Date.now());

    logger.debug('Auth', 'scheduleTokenRefresh', 'Scheduling token refresh', {
      delayMs: delay,
      refreshAt: new Date(refreshAt).toISOString(),
    });

    this._tokenRefreshTimer = window.setTimeout(() => {
      logger.info('Auth', 'scheduleTokenRefresh', 'Auto-refreshing token');
      this.refreshAccessToken();
    }, delay);
  }
}

// Export singleton instance
export const authManager = new AuthManager();
