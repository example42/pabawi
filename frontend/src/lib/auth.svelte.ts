/**
 * Authentication Store
 *
 * Part of v1.0.0 Modular Plugin Architecture (Phase 4, Step 19)
 *
 * Provides authentication state management with:
 * - Login/logout functionality
 * - Token refresh with automatic retry
 * - User and permissions storage
 * - Reactive permission checking
 * - localStorage persistence
 *
 * @module auth
 */

// Storage keys
const AUTH_TOKENS_KEY = "pabawi_auth_tokens";
const AUTH_USER_KEY = "pabawi_auth_user";

/**
 * JWT token pair from authentication
 */
export interface AuthTokens {
  /** Short-lived access token */
  accessToken: string;
  /** Long-lived refresh token */
  refreshToken: string;
  /** Token type (always "Bearer") */
  tokenType: "Bearer";
  /** Access token expiration time in seconds */
  expiresIn: number;
  /** Refresh token expiration time in seconds */
  refreshExpiresIn: number;
}

/**
 * User data (public, no password hash)
 */
export interface User {
  id: string;
  username: string;
  email: string;
  displayName?: string;
  groups: string[];
  roles: string[];
  active: boolean;
  createdAt: string;
  updatedAt?: string;
  lastLoginAt?: string;
}

/**
 * User permissions from /api/auth/me
 */
export interface UserPermissions {
  /** Capability names explicitly allowed */
  allowed: string[];
  /** Capability names explicitly denied */
  denied: string[];
  /** Role names the user has */
  roles: string[];
}

/**
 * Login credentials
 */
export interface LoginCredentials {
  username: string;
  password: string;
}

/**
 * Login response from API
 */
export interface LoginResponse {
  tokens: AuthTokens;
  user: User;
}

/**
 * Me response from API
 */
export interface MeResponse {
  user: User;
  permissions: UserPermissions;
}

/**
 * Refresh response from API
 */
export interface RefreshResponse {
  tokens: AuthTokens;
}

/**
 * Permission check result
 */
export interface PermissionCheckResult {
  /** Whether the capability is allowed */
  allowed: boolean;
  /** Reason for the decision */
  reason: string;
}

/**
 * Auth store state
 */
export interface AuthState {
  /** Current user (null if not authenticated) */
  user: User | null;
  /** User permissions (null if not authenticated) */
  permissions: UserPermissions | null;
  /** Authentication tokens (null if not authenticated) */
  tokens: AuthTokens | null;
  /** Whether currently authenticated */
  isAuthenticated: boolean;
  /** Whether authentication is in progress */
  isLoading: boolean;
  /** Last authentication error */
  error: string | null;
  /** Token expiration timestamp (ms) */
  tokenExpiresAt: number | null;
  /** Whether token refresh is in progress */
  isRefreshing: boolean;
}

/**
 * Auth event types
 */
export type AuthEvent =
  | { type: "login"; user: User }
  | { type: "logout"; reason?: string }
  | { type: "token_refresh"; success: boolean }
  | { type: "permission_change"; permissions: UserPermissions }
  | { type: "error"; error: string };

export type AuthEventHandler = (event: AuthEvent) => void;

// API base URL
const API_BASE = "/api";

/**
 * Authentication Store Class
 *
 * Manages all authentication state with Svelte 5 reactivity
 */
class AuthStore {
  // Reactive state using Svelte 5 runes
  user = $state<User | null>(null);
  permissions = $state<UserPermissions | null>(null);
  tokens = $state<AuthTokens | null>(null);
  isLoading = $state(false);
  error = $state<string | null>(null);
  tokenExpiresAt = $state<number | null>(null);
  isRefreshing = $state(false);

  // Event subscribers
  private subscribers = new Set<AuthEventHandler>();

  // Refresh timer
  private refreshTimer: number | null = null;

  // Refresh threshold (refresh when 5 minutes before expiry)
  private readonly REFRESH_THRESHOLD_MS = 5 * 60 * 1000;

  constructor() {
    // Load persisted state on initialization
    if (typeof window !== "undefined") {
      this.loadPersistedState();
      this.setupAutoRefresh();
    }
  }

  // Derived state
  get isAuthenticated(): boolean {
    return this.user !== null && this.tokens !== null;
  }

  /**
   * Subscribe to auth events
   */
  subscribe(handler: AuthEventHandler): () => void {
    this.subscribers.add(handler);
    return () => this.subscribers.delete(handler);
  }

  /**
   * Emit an auth event to all subscribers
   */
  private emit(event: AuthEvent): void {
    for (const handler of this.subscribers) {
      try {
        handler(event);
      } catch (err) {
        console.error("[AuthStore] Event handler error:", err);
      }
    }
  }

  /**
   * Load persisted authentication state from localStorage
   */
  private loadPersistedState(): void {
    try {
      const tokensJson = localStorage.getItem(AUTH_TOKENS_KEY);
      const userJson = localStorage.getItem(AUTH_USER_KEY);

      if (tokensJson && userJson) {
        const tokens = JSON.parse(tokensJson) as AuthTokens;
        const userData = JSON.parse(userJson) as {
          user: User;
          permissions: UserPermissions;
          expiresAt: number;
        };

        // Check if token is still valid
        if (userData.expiresAt > Date.now()) {
          this.tokens = tokens;
          this.user = userData.user;
          this.permissions = userData.permissions;
          this.tokenExpiresAt = userData.expiresAt;
        } else {
          // Token expired, try to refresh
          this.tokens = tokens;
          this.tokenExpiresAt = userData.expiresAt;
          // Will be refreshed by setupAutoRefresh
        }
      }
    } catch (err) {
      console.error("[AuthStore] Failed to load persisted state:", err);
      this.clearPersistedState();
    }
  }

  /**
   * Persist authentication state to localStorage
   */
  private persistState(): void {
    if (typeof window === "undefined") return;

    try {
      if (this.tokens && this.user && this.permissions) {
        localStorage.setItem(AUTH_TOKENS_KEY, JSON.stringify(this.tokens));
        localStorage.setItem(
          AUTH_USER_KEY,
          JSON.stringify({
            user: this.user,
            permissions: this.permissions,
            expiresAt: this.tokenExpiresAt,
          })
        );
      }
    } catch (err) {
      console.error("[AuthStore] Failed to persist state:", err);
    }
  }

  /**
   * Clear persisted authentication state
   */
  private clearPersistedState(): void {
    if (typeof window === "undefined") return;

    localStorage.removeItem(AUTH_TOKENS_KEY);
    localStorage.removeItem(AUTH_USER_KEY);
  }

  /**
   * Setup automatic token refresh
   */
  private setupAutoRefresh(): void {
    // Clear any existing timer
    if (this.refreshTimer !== null) {
      window.clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }

    // If we have tokens and an expiration time, schedule refresh
    if (this.tokens && this.tokenExpiresAt) {
      const now = Date.now();
      const refreshAt = this.tokenExpiresAt - this.REFRESH_THRESHOLD_MS;

      if (refreshAt <= now) {
        // Token is about to expire or already expired, refresh now
        void this.refreshTokens();
      } else {
        // Schedule refresh
        const delay = refreshAt - now;
        this.refreshTimer = window.setTimeout(() => {
          void this.refreshTokens();
        }, delay);
      }
    }
  }

  /**
   * Get authorization header for API requests
   */
  getAuthHeader(): Record<string, string> {
    if (this.tokens) {
      return {
        Authorization: `${this.tokens.tokenType} ${this.tokens.accessToken}`,
      };
    }
    return {};
  }

  /**
   * Make an authenticated API request
   */
  private async authenticatedFetch<T>(
    url: string,
    options?: RequestInit
  ): Promise<T> {
    const headers = new Headers(options?.headers);

    // Add auth header
    if (this.tokens) {
      headers.set(
        "Authorization",
        `${this.tokens.tokenType} ${this.tokens.accessToken}`
      );
    }

    // Add content type for POST/PUT
    if (
      options?.method &&
      ["POST", "PUT", "PATCH"].includes(options.method) &&
      options.body
    ) {
      headers.set("Content-Type", "application/json");
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      // Handle 401 - token might be expired
      if (response.status === 401 && this.tokens?.refreshToken) {
        // Try to refresh
        const refreshed = await this.refreshTokens();
        if (refreshed) {
          // Retry the request with new token
          headers.set(
            "Authorization",
            `${this.tokens.tokenType} ${this.tokens.accessToken}`
          );
          const retryResponse = await fetch(url, { ...options, headers });
          if (retryResponse.ok) {
            return (await retryResponse.json()) as T;
          }
        }
        // Refresh failed, logout
        await this.logout("Session expired");
        throw new Error("Session expired. Please log in again.");
      }

      // Parse error response
      let errorMessage = response.statusText || "Request failed";
      try {
        const errorData = (await response.json()) as {
          error?: string;
          message?: string;
        };
        errorMessage = errorData.error ?? errorData.message ?? errorMessage;
      } catch {
        // Ignore JSON parse errors
      }
      throw new Error(errorMessage);
    }

    return (await response.json()) as T;
  }

  /**
   * Login with username and password
   */
  async login(credentials: LoginCredentials): Promise<boolean> {
    this.isLoading = true;
    this.error = null;

    try {
      // Call login endpoint
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
      });

      if (!response.ok) {
        let errorMessage = "Login failed";
        try {
          const errorData = (await response.json()) as {
            error?: string;
            message?: string;
          };
          errorMessage = errorData.error ?? errorData.message ?? errorMessage;
        } catch {
          // Ignore JSON parse errors
        }
        throw new Error(errorMessage);
      }

      const data = (await response.json()) as LoginResponse;

      // Set state
      this.tokens = data.tokens;
      this.user = data.user;
      this.tokenExpiresAt = Date.now() + data.tokens.expiresIn * 1000;

      // Fetch permissions
      await this.fetchPermissions();

      // Persist state
      this.persistState();

      // Setup auto-refresh
      this.setupAutoRefresh();

      // Emit login event
      this.emit({ type: "login", user: data.user });

      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Login failed";
      this.error = message;
      this.emit({ type: "error", error: message });
      return false;
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Logout and clear all authentication state
   */
  async logout(reason?: string): Promise<void> {
    // Call logout endpoint if we have tokens
    if (this.tokens) {
      try {
        await fetch(`${API_BASE}/auth/logout`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `${this.tokens.tokenType} ${this.tokens.accessToken}`,
          },
          body: JSON.stringify({
            refreshToken: this.tokens.refreshToken,
          }),
        });
      } catch {
        // Ignore logout errors - we're clearing local state anyway
      }
    }

    // Clear refresh timer
    if (this.refreshTimer !== null) {
      window.clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }

    // Clear state
    this.user = null;
    this.permissions = null;
    this.tokens = null;
    this.tokenExpiresAt = null;
    this.error = null;

    // Clear persisted state
    this.clearPersistedState();

    // Emit logout event
    this.emit({ type: "logout", reason });
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshTokens(): Promise<boolean> {
    if (!this.tokens?.refreshToken || this.isRefreshing) {
      return false;
    }

    this.isRefreshing = true;

    try {
      const response = await fetch(`${API_BASE}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          refreshToken: this.tokens.refreshToken,
        }),
      });

      if (!response.ok) {
        // Refresh failed
        this.emit({ type: "token_refresh", success: false });

        // If refresh token is invalid, logout
        if (response.status === 401) {
          await this.logout("Session expired");
        }
        return false;
      }

      const data = (await response.json()) as RefreshResponse;

      // Update tokens
      this.tokens = data.tokens;
      this.tokenExpiresAt = Date.now() + data.tokens.expiresIn * 1000;

      // Persist updated state
      this.persistState();

      // Setup next refresh
      this.setupAutoRefresh();

      // Emit success event
      this.emit({ type: "token_refresh", success: true });

      return true;
    } catch (err) {
      console.error("[AuthStore] Token refresh failed:", err);
      this.emit({ type: "token_refresh", success: false });
      return false;
    } finally {
      this.isRefreshing = false;
    }
  }

  /**
   * Fetch current user info and permissions from /api/auth/me
   */
  async fetchPermissions(): Promise<void> {
    if (!this.tokens) {
      throw new Error("Not authenticated");
    }

    try {
      const data = await this.authenticatedFetch<MeResponse>(
        `${API_BASE}/auth/me`
      );

      this.user = data.user;
      this.permissions = data.permissions;

      // Persist updated state
      this.persistState();

      // Emit permission change event
      this.emit({ type: "permission_change", permissions: data.permissions });
    } catch (err) {
      console.error("[AuthStore] Failed to fetch permissions:", err);
      throw err;
    }
  }

  /**
   * Check if user has a specific capability
   *
   * Uses local permission data for fast reactive checks.
   * Supports wildcard patterns (e.g., "bolt.*" matches "bolt.command")
   *
   * NOTE: When permissions is null (no authentication configured),
   * returns true to allow all capabilities. Pabawi is designed for
   * local/workstation use without authentication by default.
   */
  hasCapability(capability: string): boolean {
    // No authentication configured - allow all capabilities
    // This is expected for local/workstation use without auth
    if (!this.permissions) {
      return true;
    }

    // Check explicit deny first
    if (this.matchesCapabilityPattern(capability, this.permissions.denied)) {
      return false;
    }

    // Check explicit allow
    return this.matchesCapabilityPattern(capability, this.permissions.allowed);
  }

  /**
   * Check if user has any of the specified capabilities
   */
  hasAnyCapability(capabilities: string[]): boolean {
    return capabilities.some((cap) => this.hasCapability(cap));
  }

  /**
   * Check if user has all of the specified capabilities
   */
  hasAllCapabilities(capabilities: string[]): boolean {
    return capabilities.every((cap) => this.hasCapability(cap));
  }

  /**
   * Check if user has a specific role
   */
  hasRole(role: string): boolean {
    return this.permissions?.roles.includes(role) ?? false;
  }

  /**
   * Check if user has any of the specified roles
   */
  hasAnyRole(roles: string[]): boolean {
    if (!this.permissions) return false;
    return roles.some((role) => this.permissions?.roles.includes(role));
  }

  /**
   * Check if user is an admin
   */
  get isAdmin(): boolean {
    return this.hasRole("admin");
  }

  /**
   * Check capability against server (for conditional permissions)
   *
   * Use this when you need to check capabilities with context
   * (e.g., node filters, time windows)
   */
  async checkCapability(
    capability: string,
    context?: Record<string, unknown>
  ): Promise<PermissionCheckResult> {
    if (!this.tokens) {
      return { allowed: false, reason: "Not authenticated" };
    }

    try {
      const result = await this.authenticatedFetch<{
        capability: string;
        allowed: boolean;
        reason: string;
      }>(`${API_BASE}/auth/check`, {
        method: "POST",
        body: JSON.stringify({ capability, context }),
      });

      return { allowed: result.allowed, reason: result.reason };
    } catch (err) {
      return {
        allowed: false,
        reason: err instanceof Error ? err.message : "Permission check failed",
      };
    }
  }

  /**
   * Get active session count
   */
  async getActiveSessions(): Promise<number> {
    if (!this.tokens) {
      return 0;
    }

    try {
      const result = await this.authenticatedFetch<{
        activeSessions: number;
        userId: string;
      }>(`${API_BASE}/auth/sessions`);
      return result.activeSessions;
    } catch {
      return 0;
    }
  }

  /**
   * Logout from all sessions
   */
  async logoutAllSessions(): Promise<void> {
    if (!this.tokens) {
      return;
    }

    try {
      await this.authenticatedFetch(`${API_BASE}/auth/logout`, {
        method: "POST",
        body: JSON.stringify({ allSessions: true }),
      });
    } catch {
      // Ignore errors
    }

    // Clear local state
    await this.logout("Logged out from all sessions");
  }

  /**
   * Match a capability against a list of patterns
   * Supports wildcards: "*" matches everything, "category.*" matches "category.action"
   */
  private matchesCapabilityPattern(
    capability: string,
    patterns: string[]
  ): boolean {
    for (const pattern of patterns) {
      // Exact match
      if (pattern === capability) {
        return true;
      }

      // Wildcard match all
      if (pattern === "*") {
        return true;
      }

      // Category wildcard (e.g., "bolt.*" matches "bolt.command")
      if (pattern.endsWith(".*")) {
        const category = pattern.slice(0, -2);
        if (capability.startsWith(category + ".")) {
          return true;
        }
      }

      // Glob-like pattern matching (e.g., "inventory.*.read")
      if (pattern.includes("*")) {
        const regex = new RegExp(
          "^" + pattern.replace(/\./g, "\\.").replace(/\*/g, "[^.]+") + "$"
        );
        if (regex.test(capability)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Get the current auth state snapshot
   */
  getState(): AuthState {
    return {
      user: this.user,
      permissions: this.permissions,
      tokens: this.tokens,
      isAuthenticated: this.isAuthenticated,
      isLoading: this.isLoading,
      error: this.error,
      tokenExpiresAt: this.tokenExpiresAt,
      isRefreshing: this.isRefreshing,
    };
  }

  /**
   * Reset the auth store to initial state
   * Useful for testing
   */
  reset(): void {
    // Clear refresh timer
    if (this.refreshTimer !== null) {
      window.clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }

    // Clear state
    this.user = null;
    this.permissions = null;
    this.tokens = null;
    this.tokenExpiresAt = null;
    this.error = null;
    this.isLoading = false;
    this.isRefreshing = false;

    // Clear subscribers
    this.subscribers.clear();

    // Clear persisted state
    this.clearPersistedState();
  }
}

// Singleton instance
let authStoreInstance: AuthStore | null = null;

/**
 * Get the authentication store singleton
 */
export function getAuthStore(): AuthStore {
  authStoreInstance ??= new AuthStore();
  return authStoreInstance;
}

/**
 * Reset the auth store (for testing)
 */
export function resetAuthStore(): void {
  if (authStoreInstance) {
    authStoreInstance.reset();
    authStoreInstance = null;
  }
}

/**
 * Default auth store instance for convenient imports
 */
export const auth = /* @__PURE__ */ getAuthStore();

// ============================================================================
// Reactive Helpers for Svelte Components
// ============================================================================

/**
 * Check if user has capability (reactive)
 *
 * Usage in Svelte component:
 * ```svelte
 * <script>
 *   import { useCapability } from '$lib/auth.svelte';
 *   const canExecute = useCapability('command.execute');
 * </script>
 *
 * {#if canExecute.value}
 *   <button>Execute</button>
 * {/if}
 * ```
 */
export function useCapability(capability: string): { readonly value: boolean } {
  const store = getAuthStore();
  return {
    get value(): boolean {
      return store.hasCapability(capability);
    },
  };
}

/**
 * Check if user has any of the capabilities (reactive)
 */
export function useAnyCapability(
  capabilities: string[]
): { readonly value: boolean } {
  const store = getAuthStore();
  return {
    get value(): boolean {
      return store.hasAnyCapability(capabilities);
    },
  };
}

/**
 * Check if user has all of the capabilities (reactive)
 */
export function useAllCapabilities(
  capabilities: string[]
): { readonly value: boolean } {
  const store = getAuthStore();
  return {
    get value(): boolean {
      return store.hasAllCapabilities(capabilities);
    },
  };
}

/**
 * Check if user has role (reactive)
 */
export function useRole(role: string): { readonly value: boolean } {
  const store = getAuthStore();
  return {
    get value(): boolean {
      return store.hasRole(role);
    },
  };
}

/**
 * Check if user is authenticated (reactive)
 */
export function useIsAuthenticated(): { readonly value: boolean } {
  const store = getAuthStore();
  return {
    get value(): boolean {
      return store.isAuthenticated;
    },
  };
}

/**
 * Get current user (reactive)
 */
export function useUser(): { readonly value: User | null } {
  const store = getAuthStore();
  return {
    get value(): User | null {
      return store.user;
    },
  };
}

/**
 * Check if user is admin (reactive)
 */
export function useIsAdmin(): { readonly value: boolean } {
  const store = getAuthStore();
  return {
    get value(): boolean {
      return store.isAdmin;
    },
  };
}

// Export types
export type { AuthStore };
