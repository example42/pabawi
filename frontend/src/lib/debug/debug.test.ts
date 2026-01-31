/**
 * Tests for Debug Mode Module
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock localStorage
const localStorageMock = ((): Storage => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string): string | null => store[key] ?? null),
    setItem: vi.fn((key: string, value: string): void => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string): void => {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete store[key];
    }),
    clear: vi.fn((): void => {
      store = {};
    }),
    get length(): number {
      return Object.keys(store).length;
    },
    key: vi.fn((index: number): string | null => {
      const keys = Object.keys(store);
      return keys[index] ?? null;
    }),
  };
})();

Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
});

// Import after mocking localStorage
import {
  debugMode,
  createDebugContext,
} from './index';

describe('debugMode', () => {
  beforeEach(() => {
    localStorageMock.clear();
    debugMode.setEnabled(false);
    debugMode.clearRequests();
  });

  describe('enabled state', () => {
    it('should start with disabled state', () => {
      expect(debugMode.enabled).toBe(false);
    });

    it('should toggle enabled state', () => {
      debugMode.toggle();
      expect(debugMode.enabled).toBe(true);
      debugMode.toggle();
      expect(debugMode.enabled).toBe(false);
    });

    it('should set enabled state', () => {
      debugMode.setEnabled(true);
      expect(debugMode.enabled).toBe(true);
      debugMode.setEnabled(false);
      expect(debugMode.enabled).toBe(false);
    });
  });

  describe('configuration', () => {
    it('should have default configuration', () => {
      expect(debugMode.config.logApiRequests).toBe(true);
      expect(debugMode.config.includePerformance).toBe(true);
      expect(debugMode.config.maxTrackedRequests).toBe(100);
    });

    it('should update configuration', () => {
      debugMode.updateConfig({ logApiRequests: false });
      expect(debugMode.config.logApiRequests).toBe(false);
    });

    it('should reset configuration to defaults', () => {
      debugMode.updateConfig({ logApiRequests: false });
      debugMode.resetConfig();
      expect(debugMode.config.logApiRequests).toBe(true);
    });
  });

  describe('correlation ID generation', () => {
    it('should generate unique correlation IDs', () => {
      const id1 = debugMode.generateCorrelationId();
      const id2 = debugMode.generateCorrelationId();
      expect(id1).not.toBe(id2);
    });

    it('should include prefix in correlation ID', () => {
      const id = debugMode.generateCorrelationId('test');
      expect(id).toMatch(/^test_/);
    });
  });

  describe('request tracking', () => {
    it('should track request start', () => {
      const correlationId = debugMode.generateCorrelationId();
      const requestId = debugMode.trackRequestStart(
        '/api/test',
        'GET',
        correlationId
      );

      expect(requestId).toBeTruthy();
      expect(debugMode.requests.length).toBe(1);
      expect(debugMode.requests[0].url).toBe('/api/test');
      expect(debugMode.requests[0].pending).toBe(true);
    });

    it('should track request completion', () => {
      const correlationId = debugMode.generateCorrelationId();
      const requestId = debugMode.trackRequestStart(
        '/api/test',
        'GET',
        correlationId
      );

      debugMode.trackRequestEnd(requestId, 200, 1024, null);

      expect(debugMode.requests[0].pending).toBe(false);
      expect(debugMode.requests[0].status).toBe(200);
      expect(debugMode.requests[0].responseSize).toBe(1024);
    });

    it('should track request failure', () => {
      const correlationId = debugMode.generateCorrelationId();
      const requestId = debugMode.trackRequestStart(
        '/api/test',
        'GET',
        correlationId
      );

      debugMode.trackRequestEnd(requestId, 500, null, 'Server error');

      expect(debugMode.requests[0].pending).toBe(false);
      expect(debugMode.requests[0].status).toBe(500);
      expect(debugMode.requests[0].error).toBe('Server error');
    });

    it('should get requests by correlation ID', () => {
      const correlationId1 = debugMode.generateCorrelationId();
      const correlationId2 = debugMode.generateCorrelationId();

      debugMode.trackRequestStart('/api/test1', 'GET', correlationId1);
      debugMode.trackRequestStart('/api/test2', 'GET', correlationId2);

      const requests = debugMode.getRequestsByCorrelationId(correlationId1);
      expect(requests.length).toBe(1);
      expect(requests[0].url).toBe('/api/test1');
    });

    it('should clear requests', () => {
      const correlationId = debugMode.generateCorrelationId();
      debugMode.trackRequestStart('/api/test', 'GET', correlationId);
      debugMode.clearRequests();
      expect(debugMode.requests.length).toBe(0);
    });
  });

  describe('request statistics', () => {
    it('should calculate request statistics', () => {
      const correlationId = debugMode.generateCorrelationId();

      // Successful request
      const req1 = debugMode.trackRequestStart('/api/test1', 'GET', correlationId);
      debugMode.trackRequestEnd(req1, 200, 100, null);

      // Failed request
      const req2 = debugMode.trackRequestStart('/api/test2', 'GET', correlationId);
      debugMode.trackRequestEnd(req2, 500, null, 'Error');

      // Pending request
      debugMode.trackRequestStart('/api/test3', 'GET', correlationId);

      const stats = debugMode.getRequestStats();
      expect(stats.total).toBe(3);
      expect(stats.successful).toBe(1);
      expect(stats.failed).toBe(1);
      expect(stats.pending).toBe(1);
    });
  });

  describe('debug contexts', () => {
    it('should create debug context', () => {
      const context = debugMode.createContext('TestWidget');
      expect(context.id).toBe('TestWidget');
      expect(context.correlationId).toBeTruthy();
    });

    it('should get context by correlation ID', () => {
      const context = debugMode.createContext('TestWidget');
      const retrieved = debugMode.getContext(context.correlationId);
      expect(retrieved).toBe(context);
    });

    it('should destroy context', () => {
      const context = debugMode.createContext('TestWidget');
      debugMode.destroyContext(context.correlationId);
      const retrieved = debugMode.getContext(context.correlationId);
      expect(retrieved).toBeUndefined();
    });

    it('should link parent and child contexts', () => {
      const parent = debugMode.createContext('ParentWidget');
      const child = debugMode.createContext('ChildWidget', parent.correlationId);

      expect(child.parentId).toBe(parent.correlationId);
      expect(parent.children.has(child.correlationId)).toBe(true);
    });
  });
});

describe('createDebugContext', () => {
  beforeEach(() => {
    debugMode.clearRequests();
  });

  it('should create widget debug context', () => {
    const context = createDebugContext('TestWidget');
    expect(context.correlationId).toBeTruthy();
    expect(context.enabled).toBe(debugMode.enabled);
  });

  it('should track requests in context', () => {
    const context = createDebugContext('TestWidget');
    const requestId = context.trackRequest('/api/test', 'GET');

    expect(requestId).toBeTruthy();
    expect(context.requests.length).toBe(1);
  });

  it('should complete requests', () => {
    const context = createDebugContext('TestWidget');
    const requestId = context.trackRequest('/api/test', 'GET');
    context.completeRequest(requestId, 200, 1024);

    expect(context.requests[0].pending).toBe(false);
    expect(context.requests[0].status).toBe(200);
  });

  it('should fail requests', () => {
    const context = createDebugContext('TestWidget');
    const requestId = context.trackRequest('/api/test', 'GET');
    context.failRequest(requestId, 'Network error', 0);

    expect(context.requests[0].pending).toBe(false);
    expect(context.requests[0].error).toBe('Network error');
  });

  it('should store and retrieve custom data', () => {
    const context = createDebugContext('TestWidget');
    context.setData('testKey', 'testValue');
    expect(context.getData('testKey')).toBe('testValue');
  });

  it('should generate headers', () => {
    const context = createDebugContext('TestWidget');
    const headers = context.getHeaders();

    expect(headers['X-Correlation-ID']).toBe(context.correlationId);
  });

  it('should include debug mode header when enabled', () => {
    debugMode.setEnabled(true);
    const context = createDebugContext('TestWidget');
    const headers = context.getHeaders();

    expect(headers['X-Debug-Mode']).toBe('true');
  });

  it('should create child contexts', () => {
    const parent = createDebugContext('ParentWidget');
    const child = parent.createChild('ChildWidget');

    expect(child.correlationId).not.toBe(parent.correlationId);
  });

  it('should clean up on destroy', () => {
    const context = createDebugContext('TestWidget');
    const correlationId = context.correlationId;

    context.destroy();

    expect(debugMode.getContext(correlationId)).toBeUndefined();
  });
});
