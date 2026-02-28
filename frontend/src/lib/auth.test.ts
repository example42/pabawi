/**
 * Tests for authentication state management
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { authManager, type AuthResponse, type UserDTO } from './auth.svelte';

// Mock fetch
global.fetch = vi.fn();

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

describe('AuthManager', () => {
  const mockUser: UserDTO = {
    id: 'user-123',
    username: 'testuser',
    email: 'test@example.com',
    firstName: 'Test',
    lastName: 'User',
    isActive: true,
    isAdmin: false,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    lastLoginAt: '2024-01-01T00:00:00Z',
  };

  const mockAuthResponse: AuthResponse = {
    token: 'mock-access-token',
    refreshToken: 'mock-refresh-token',
    user: mockUser,
  };

  beforeEach(() => {
    // Clear localStorage before each test
    localStorageMock.clear();

    // Reset fetch mock
    vi.clearAllMocks();

    // Clear any existing auth data
    if (authManager.isAuthenticated) {
      authManager.logout();
    }
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe('login', () => {
    it('should successfully login with valid credentials', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockAuthResponse,
      });

      const result = await authManager.login({
        username: 'testuser',
        password: 'password123',
      });

      expect(result).toBe(true);
      expect(authManager.isAuthenticated).toBe(true);
      expect(authManager.user).toEqual(mockUser);
      expect(authManager.token).toBe('mock-access-token');
      expect(authManager.refreshToken).toBe('mock-refresh-token');
    });

    it('should store tokens in localStorage on successful login', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockAuthResponse,
      });

      await authManager.login({
        username: 'testuser',
        password: 'password123',
      });

      expect(localStorage.getItem('authToken')).toBe('mock-access-token');
      expect(localStorage.getItem('refreshToken')).toBe('mock-refresh-token');
      expect(localStorage.getItem('authUser')).toBe(JSON.stringify(mockUser));
    });

    it('should handle login failure with invalid credentials', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: 'Invalid credentials' }),
      });

      const result = await authManager.login({
        username: 'testuser',
        password: 'wrongpassword',
      });

      expect(result).toBe(false);
      expect(authManager.isAuthenticated).toBe(false);
      expect(authManager.error).toEqual({
        message: 'Invalid credentials',
        code: 'HTTP_401',
      });
    });

    it('should handle network errors during login', async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

      const result = await authManager.login({
        username: 'testuser',
        password: 'password123',
      });

      expect(result).toBe(false);
      expect(authManager.isAuthenticated).toBe(false);
      expect(authManager.error).toEqual({
        message: 'Network error',
        code: 'NETWORK_ERROR',
      });
    });

    it('should set loading state during login', async () => {
      let resolveLogin: (value: any) => void;
      const loginPromise = new Promise((resolve) => {
        resolveLogin = resolve;
      });

      (global.fetch as any).mockReturnValueOnce(loginPromise);

      const loginCall = authManager.login({
        username: 'testuser',
        password: 'password123',
      });

      // Should be loading
      expect(authManager.isLoading).toBe(true);

      // Resolve the login
      resolveLogin!({
        ok: true,
        json: async () => mockAuthResponse,
      });

      await loginCall;

      // Should no longer be loading
      expect(authManager.isLoading).toBe(false);
    });
  });

  describe('logout', () => {
    beforeEach(async () => {
      // Login first
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockAuthResponse,
      });

      await authManager.login({
        username: 'testuser',
        password: 'password123',
      });
    });

    it('should clear auth data on logout', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
      });

      await authManager.logout();

      expect(authManager.isAuthenticated).toBe(false);
      expect(authManager.user).toBeNull();
      expect(authManager.token).toBeNull();
      expect(authManager.refreshToken).toBeNull();
    });

    it('should clear localStorage on logout', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
      });

      await authManager.logout();

      expect(localStorage.getItem('authToken')).toBeNull();
      expect(localStorage.getItem('refreshToken')).toBeNull();
      expect(localStorage.getItem('authUser')).toBeNull();
    });

    it('should call logout API endpoint', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
      });

      await authManager.logout();

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/auth/logout',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer mock-access-token',
          }),
        })
      );
    });

    it('should clear auth data even if logout API fails', async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

      await authManager.logout();

      expect(authManager.isAuthenticated).toBe(false);
      expect(authManager.token).toBeNull();
    });
  });

  describe('refreshAccessToken', () => {
    beforeEach(async () => {
      // Login first
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockAuthResponse,
      });

      await authManager.login({
        username: 'testuser',
        password: 'password123',
      });
    });

    it('should successfully refresh access token', async () => {
      const newAuthResponse: AuthResponse = {
        ...mockAuthResponse,
        token: 'new-access-token',
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => newAuthResponse,
      });

      const result = await authManager.refreshAccessToken();

      expect(result).toBe(true);
      expect(authManager.token).toBe('new-access-token');
      expect(authManager.isAuthenticated).toBe(true);
    });

    it('should update localStorage with new token', async () => {
      const newAuthResponse: AuthResponse = {
        ...mockAuthResponse,
        token: 'new-access-token',
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => newAuthResponse,
      });

      await authManager.refreshAccessToken();

      expect(localStorage.getItem('authToken')).toBe('new-access-token');
    });

    it('should clear auth data if refresh fails', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 401,
      });

      const result = await authManager.refreshAccessToken();

      expect(result).toBe(false);
      expect(authManager.isAuthenticated).toBe(false);
      expect(authManager.token).toBeNull();
    });

    it('should return false if no refresh token available', async () => {
      // Clear refresh token
      await authManager.logout();

      const result = await authManager.refreshAccessToken();

      expect(result).toBe(false);
    });
  });

  describe('getAuthHeader', () => {
    it('should return Bearer token when authenticated', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockAuthResponse,
      });

      await authManager.login({
        username: 'testuser',
        password: 'password123',
      });

      expect(authManager.getAuthHeader()).toBe('Bearer mock-access-token');
    });

    it('should return null when not authenticated', () => {
      expect(authManager.getAuthHeader()).toBeNull();
    });
  });

  describe('isAdmin', () => {
    it('should return true for admin users', async () => {
      const adminResponse: AuthResponse = {
        ...mockAuthResponse,
        user: { ...mockUser, isAdmin: true },
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => adminResponse,
      });

      await authManager.login({
        username: 'admin',
        password: 'password123',
      });

      expect(authManager.isAdmin).toBe(true);
    });

    it('should return false for non-admin users', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockAuthResponse,
      });

      await authManager.login({
        username: 'testuser',
        password: 'password123',
      });

      expect(authManager.isAdmin).toBe(false);
    });

    it('should return false when not authenticated', () => {
      expect(authManager.isAdmin).toBe(false);
    });
  });

  describe('clearError', () => {
    it('should clear error state', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: 'Invalid credentials' }),
      });

      await authManager.login({
        username: 'testuser',
        password: 'wrongpassword',
      });

      expect(authManager.error).not.toBeNull();

      authManager.clearError();

      expect(authManager.error).toBeNull();
    });
  });
});
