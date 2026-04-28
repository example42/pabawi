/**
 * Property test for fetchWithRetry JSON round-trip
 *
 * Feature: rbac-and-mcp-server, Property 1: JSON round-trip for successful API responses
 *
 * **Validates: Requirements 6.1, 6.2**
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';

// Mock all dependencies before importing the module under test
vi.mock('./expertMode.svelte', () => ({
  expertMode: { enabled: false },
}));

vi.mock('./toast.svelte', () => ({
  showWarning: vi.fn(),
}));

vi.mock('./logger.svelte', () => ({
  logger: {
    generateCorrelationId: (): string => 'test-correlation-id',
    setCorrelationId: vi.fn(),
    clearCorrelationId: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('./auth.svelte', () => ({
  authManager: {
    getAuthHeader: (): null => null,
    isAuthenticated: false,
    refreshAccessToken: vi.fn(),
  },
}));

import { fetchWithRetry } from './api';

describe('Property 1: JSON round-trip for successful API responses', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  it('should round-trip any JSON object through fetchWithRetry for 200 responses', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.jsonValue(),
        async (jsonValue) => {
          globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => jsonValue,
          });

          const result = await fetchWithRetry('/api/test', { method: 'GET' }, { maxRetries: 0 });
          expect(result).toEqual(jsonValue);
        }
      ),
      { numRuns: 20 }
    );
  });

  it('should return undefined for 204 No Content responses without parsing JSON', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constant(204),
        async () => {
          const jsonMock = vi.fn();
          globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 204,
            json: jsonMock,
          });

          const result = await fetchWithRetry('/api/test', { method: 'POST' }, { maxRetries: 0 });
          expect(result).toBeUndefined();
          expect(jsonMock).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 20 }
    );
  });

  it('should round-trip any JSON object through fetchWithRetry for 201 responses', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.jsonValue(),
        async (jsonValue) => {
          globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 201,
            json: async () => jsonValue,
          });

          const result = await fetchWithRetry('/api/test', { method: 'POST' }, { maxRetries: 0 });
          expect(result).toEqual(jsonValue);
        }
      ),
      { numRuns: 20 }
    );
  });
});
