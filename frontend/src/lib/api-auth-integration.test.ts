/**
 * Integration tests for API client with authentication
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fetchWithRetry } from './api';
import { authManager } from './auth.svelte';

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

describe('API Authentication Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();

    // Logout to clear any existing auth
    if (authManager.isAuthenticated) {
      authManager.logout();
    }
  });

  it('should add Authorization header when user is authenticated', async () => {
    // Login first
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        token: 'test-token',
        refreshToken: 'test-refresh-token',
        user: {
          id: 'user-1',
          username: 'testuser',
          email: 'test@example.com',
          firstName: 'Test',
          lastName: 'User',
          isActive: true,
          isAdmin: false,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
          lastLoginAt: '2024-01-01T00:00:00Z',
        },
      }),
    });

    await authManager.login({
      username: 'testuser',
      password: 'password123',
    });

    // Make API request
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: 'test' }),
    });

    await fetchWithRetry('/api/test');

    // Check that Authorization header was added
    const lastCall = (global.fetch as any).mock.calls[(global.fetch as any).mock.calls.length - 1];
    const headers = lastCall[1].headers;

    expect(headers.get('Authorization')).toBe('Bearer test-token');
  });

  it('should not add Authorization header when user is not authenticated', async () => {
    // Clear any previous fetch calls
    vi.clearAllMocks();

    // Make API request without authentication
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: 'test' }),
    });

    const result = await fetchWithRetry('/api/test');

    // Verify the request succeeded
    expect(result).toEqual({ data: 'test' });

    // Verify fetch was called exactly once
    expect((global.fetch as any).mock.calls.length).toBe(1);
  });

  it('should attempt token refresh on 401 response', async () => {
    // Login first
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        token: 'old-token',
        refreshToken: 'test-refresh-token',
        user: {
          id: 'user-1',
          username: 'testuser',
          email: 'test@example.com',
          firstName: 'Test',
          lastName: 'User',
          isActive: true,
          isAdmin: false,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
          lastLoginAt: '2024-01-01T00:00:00Z',
        },
      }),
    });

    await authManager.login({
      username: 'testuser',
      password: 'password123',
    });

    // First request returns 401
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Token expired' }),
    });

    // Token refresh succeeds
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        token: 'new-token',
        refreshToken: 'test-refresh-token',
        user: {
          id: 'user-1',
          username: 'testuser',
          email: 'test@example.com',
          firstName: 'Test',
          lastName: 'User',
          isActive: true,
          isAdmin: false,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
          lastLoginAt: '2024-01-01T00:00:00Z',
        },
      }),
    });

    // Retry with new token succeeds
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: 'test' }),
    });

    const result = await fetchWithRetry('/api/test');

    expect(result).toEqual({ data: 'test' });
    expect(authManager.token).toBe('new-token');

    // Should have made 4 calls: login, original request, refresh, retry
    expect((global.fetch as any).mock.calls.length).toBe(4);
  });

  it('should throw error if token refresh fails', async () => {
    // Login first
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        token: 'old-token',
        refreshToken: 'test-refresh-token',
        user: {
          id: 'user-1',
          username: 'testuser',
          email: 'test@example.com',
          firstName: 'Test',
          lastName: 'User',
          isActive: true,
          isAdmin: false,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
          lastLoginAt: '2024-01-01T00:00:00Z',
        },
      }),
    });

    await authManager.login({
      username: 'testuser',
      password: 'password123',
    });

    // First request returns 401
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Token expired' }),
    });

    // Token refresh fails
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Invalid refresh token' }),
    });

    await expect(fetchWithRetry('/api/test')).rejects.toThrow();

    // User should be logged out
    expect(authManager.isAuthenticated).toBe(false);
  });
});
