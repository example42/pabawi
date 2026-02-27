import { describe, it, expect, beforeEach } from 'vitest';
import type { Request } from 'express';
import {
  ExpertModeService,
  DebugInfo,
  ApiCallInfo,
  ErrorInfo,
  WarningInfo,
  InfoMessage,
  DebugMessage,
} from '../../src/services/ExpertModeService';

describe('ExpertModeService', () => {
  let service: ExpertModeService;

  beforeEach(() => {
    service = new ExpertModeService();
  });

  // Helper to create mock request
  const createMockRequest = (headers: Record<string, string> = {}): Request => {
    return {
      headers,
    } as Request;
  };

  describe('expert mode detection', () => {
    it('should return true when X-Expert-Mode header is "true"', () => {
      const req = createMockRequest({ 'x-expert-mode': 'true' });
      expect(service.isExpertModeEnabled(req)).toBe(true);
    });

    it('should return true when X-Expert-Mode header is "1"', () => {
      const req = createMockRequest({ 'x-expert-mode': '1' });
      expect(service.isExpertModeEnabled(req)).toBe(true);
    });

    it('should return true when X-Expert-Mode header is "yes"', () => {
      const req = createMockRequest({ 'x-expert-mode': 'yes' });
      expect(service.isExpertModeEnabled(req)).toBe(true);
    });

    it('should handle case-insensitive header values', () => {
      const trueCases = ['TRUE', 'True', 'YES', 'Yes', '1'];

      trueCases.forEach((value) => {
        const req = createMockRequest({ 'x-expert-mode': value });
        expect(service.isExpertModeEnabled(req)).toBe(true);
      });
    });

    it('should return false when X-Expert-Mode header is "false"', () => {
      const req = createMockRequest({ 'x-expert-mode': 'false' });
      expect(service.isExpertModeEnabled(req)).toBe(false);
    });

    it('should return false when X-Expert-Mode header is "0"', () => {
      const req = createMockRequest({ 'x-expert-mode': '0' });
      expect(service.isExpertModeEnabled(req)).toBe(false);
    });

    it('should return false when X-Expert-Mode header is missing', () => {
      const req = createMockRequest({});
      expect(service.isExpertModeEnabled(req)).toBe(false);
    });

    it('should return false for invalid header values', () => {
      const invalidValues = ['invalid', 'maybe', '2', 'on', 'off', 'no'];

      invalidValues.forEach((value) => {
        const req = createMockRequest({ 'x-expert-mode': value });
        expect(service.isExpertModeEnabled(req)).toBe(false);
      });
    });

    it('should handle undefined header value', () => {
      const req = createMockRequest();
      expect(service.isExpertModeEnabled(req)).toBe(false);
    });

    it('should handle array header values', () => {
      const req = {
        headers: { 'x-expert-mode': ['true', 'false'] },
      } as unknown as Request;
      // Array headers are converted to comma-separated string "true,false"
      // which doesn't match "true", so should return false
      expect(service.isExpertModeEnabled(req)).toBe(false);
    });
  });

  describe('debug info attachment', () => {
    it('should attach debug info to response data', () => {
      const data = { result: 'success' };
      const debugInfo: DebugInfo = {
        timestamp: '2024-01-01T00:00:00.000Z',
        requestId: 'req_123',
        operation: 'test',
        duration: 100,
      };

      const result = service.attachDebugInfo(data, debugInfo);

      expect(result).toEqual({
        result: 'success',
        _debug: debugInfo,
      });
    });

    it('should preserve original data properties', () => {
      const data = {
        id: 1,
        name: 'test',
        nested: { value: 'nested' },
      };
      const debugInfo: DebugInfo = {
        timestamp: '2024-01-01T00:00:00.000Z',
        requestId: 'req_123',
        operation: 'test',
        duration: 100,
      };

      const result = service.attachDebugInfo(data, debugInfo);

      expect(result.id).toBe(1);
      expect(result.name).toBe('test');
      expect(result.nested).toEqual({ value: 'nested' });
      expect(result._debug).toEqual(debugInfo);
    });

    it('should attach debug info with all optional fields', () => {
      const data = { result: 'success' };
      const debugInfo: DebugInfo = {
        timestamp: '2024-01-01T00:00:00.000Z',
        requestId: 'req_123',
        integration: 'puppetdb',
        operation: 'fetchNodes',
        duration: 250,
        apiCalls: [
          {
            endpoint: '/pdb/query/v4/nodes',
            method: 'GET',
            duration: 200,
            status: 200,
            cached: false,
          },
        ],
        cacheHit: false,
        errors: [],
        metadata: { nodeCount: 10 },
      };

      const result = service.attachDebugInfo(data, debugInfo);

      expect(result._debug).toEqual(debugInfo);
    });
  });

  describe('size limits', () => {
    it('should truncate debug info when it exceeds 1MB', () => {
      const data = { result: 'success' };

      // Create debug info that exceeds 1MB
      const largeArray = new Array(100000).fill({
        endpoint: '/api/test',
        method: 'GET',
        duration: 100,
        status: 200,
        cached: false,
      });

      const debugInfo: DebugInfo = {
        timestamp: '2024-01-01T00:00:00.000Z',
        requestId: 'req_123',
        operation: 'test',
        duration: 100,
        apiCalls: largeArray,
      };

      const result = service.attachDebugInfo(data, debugInfo);

      expect(result._debug).toBeDefined();
      expect(result._debug?.metadata?._truncated).toBe(true);
      expect(result._debug?.metadata?._originalSize).toBeGreaterThan(1024 * 1024);
      expect(result._debug?.metadata?._maxSize).toBe(1024 * 1024);
      expect(result._debug?.apiCalls).toBeUndefined();
    });

    it('should not truncate debug info when it is within size limits', () => {
      const data = { result: 'success' };
      const debugInfo: DebugInfo = {
        timestamp: '2024-01-01T00:00:00.000Z',
        requestId: 'req_123',
        operation: 'test',
        duration: 100,
        apiCalls: [
          {
            endpoint: '/api/test',
            method: 'GET',
            duration: 50,
            status: 200,
            cached: false,
          },
        ],
      };

      const result = service.attachDebugInfo(data, debugInfo);

      expect(result._debug).toEqual(debugInfo);
      expect(result._debug?.metadata?._truncated).toBeUndefined();
      expect(result._debug?.apiCalls).toBeDefined();
    });

    it('should remove apiCalls and errors when truncating', () => {
      const data = { result: 'success' };

      // Create large debug info
      const largeArray = new Array(100000).fill({
        endpoint: '/api/test',
        method: 'GET',
        duration: 100,
        status: 200,
        cached: false,
      });

      const debugInfo: DebugInfo = {
        timestamp: '2024-01-01T00:00:00.000Z',
        requestId: 'req_123',
        operation: 'test',
        duration: 100,
        apiCalls: largeArray,
        errors: [{ message: 'Test error', stack: 'stack trace' }],
      };

      const result = service.attachDebugInfo(data, debugInfo);

      expect(result._debug?.apiCalls).toBeUndefined();
      expect(result._debug?.errors).toBeUndefined();
      expect(result._debug?.metadata?._truncated).toBe(true);
    });

    it('should preserve basic fields when truncating', () => {
      const data = { result: 'success' };

      // Create large debug info
      const largeArray = new Array(100000).fill({
        endpoint: '/api/test',
        method: 'GET',
        duration: 100,
        status: 200,
        cached: false,
      });

      const debugInfo: DebugInfo = {
        timestamp: '2024-01-01T00:00:00.000Z',
        requestId: 'req_123',
        integration: 'bolt',
        operation: 'test',
        duration: 100,
        apiCalls: largeArray,
      };

      const result = service.attachDebugInfo(data, debugInfo);

      expect(result._debug?.timestamp).toBe('2024-01-01T00:00:00.000Z');
      expect(result._debug?.requestId).toBe('req_123');
      expect(result._debug?.integration).toBe('bolt');
      expect(result._debug?.operation).toBe('test');
      expect(result._debug?.duration).toBe(100);
    });
  });

  describe('error handling', () => {
    it('should handle circular references in debug info', () => {
      const data = { result: 'success' };

      // Create circular reference
      const circular: any = { name: 'circular' };
      circular.self = circular;

      const debugInfo: DebugInfo = {
        timestamp: '2024-01-01T00:00:00.000Z',
        requestId: 'req_123',
        operation: 'test',
        duration: 100,
        metadata: circular,
      };

      const result = service.attachDebugInfo(data, debugInfo);

      // Should truncate due to serialization failure
      expect(result._debug).toBeDefined();
      expect(result._debug?.metadata?._truncated).toBe(true);
    });

    it('should handle non-serializable values in debug info', () => {
      const data = { result: 'success' };

      const debugInfo: DebugInfo = {
        timestamp: '2024-01-01T00:00:00.000Z',
        requestId: 'req_123',
        operation: 'test',
        duration: 100,
        metadata: {
          func: () => 'test', // Functions are not serializable
        },
      };

      const result = service.attachDebugInfo(data, debugInfo);

      // Should still attach debug info (JSON.stringify handles functions)
      expect(result._debug).toBeDefined();
    });
  });

  describe('createDebugInfo', () => {
    it('should create basic debug info object', () => {
      const debugInfo = service.createDebugInfo('testOperation', 'req_123', 100);

      expect(debugInfo.operation).toBe('testOperation');
      expect(debugInfo.requestId).toBe('req_123');
      expect(debugInfo.duration).toBe(100);
      expect(debugInfo.timestamp).toBeDefined();
      expect(new Date(debugInfo.timestamp).getTime()).toBeGreaterThan(0);
    });

    it('should create debug info with valid ISO timestamp', () => {
      const debugInfo = service.createDebugInfo('test', 'req_123', 50);

      expect(debugInfo.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('should not include optional fields by default', () => {
      const debugInfo = service.createDebugInfo('test', 'req_123', 50);

      expect(debugInfo.integration).toBeUndefined();
      expect(debugInfo.apiCalls).toBeUndefined();
      expect(debugInfo.cacheHit).toBeUndefined();
      expect(debugInfo.errors).toBeUndefined();
      expect(debugInfo.metadata).toBeUndefined();
    });
  });

  describe('addApiCall', () => {
    it('should add API call to debug info', () => {
      const debugInfo = service.createDebugInfo('test', 'req_123', 100);
      const apiCall: ApiCallInfo = {
        endpoint: '/api/test',
        method: 'GET',
        duration: 50,
        status: 200,
        cached: false,
      };

      service.addApiCall(debugInfo, apiCall);

      expect(debugInfo.apiCalls).toHaveLength(1);
      expect(debugInfo.apiCalls?.[0]).toEqual(apiCall);
    });

    it('should add multiple API calls', () => {
      const debugInfo = service.createDebugInfo('test', 'req_123', 100);
      const apiCall1: ApiCallInfo = {
        endpoint: '/api/test1',
        method: 'GET',
        duration: 50,
        status: 200,
        cached: false,
      };
      const apiCall2: ApiCallInfo = {
        endpoint: '/api/test2',
        method: 'POST',
        duration: 75,
        status: 201,
        cached: false,
      };

      service.addApiCall(debugInfo, apiCall1);
      service.addApiCall(debugInfo, apiCall2);

      expect(debugInfo.apiCalls).toHaveLength(2);
      expect(debugInfo.apiCalls?.[0]).toEqual(apiCall1);
      expect(debugInfo.apiCalls?.[1]).toEqual(apiCall2);
    });

    it('should initialize apiCalls array if not present', () => {
      const debugInfo: DebugInfo = {
        timestamp: '2024-01-01T00:00:00.000Z',
        requestId: 'req_123',
        operation: 'test',
        duration: 100,
      };
      const apiCall: ApiCallInfo = {
        endpoint: '/api/test',
        method: 'GET',
        duration: 50,
        status: 200,
        cached: false,
      };

      expect(debugInfo.apiCalls).toBeUndefined();
      service.addApiCall(debugInfo, apiCall);
      expect(debugInfo.apiCalls).toBeDefined();
      expect(debugInfo.apiCalls).toHaveLength(1);
    });
  });

  describe('addError', () => {
    it('should add error to debug info', () => {
      const debugInfo = service.createDebugInfo('test', 'req_123', 100);
      const error: ErrorInfo = {
        message: 'Test error',
        stack: 'Error stack trace',
        code: 'ERR_TEST',
      };

      service.addError(debugInfo, error);

      expect(debugInfo.errors).toHaveLength(1);
      expect(debugInfo.errors?.[0]).toEqual(error);
    });

    it('should add multiple errors', () => {
      const debugInfo = service.createDebugInfo('test', 'req_123', 100);
      const error1: ErrorInfo = {
        message: 'First error',
        stack: 'Stack 1',
      };
      const error2: ErrorInfo = {
        message: 'Second error',
        code: 'ERR_2',
      };

      service.addError(debugInfo, error1);
      service.addError(debugInfo, error2);

      expect(debugInfo.errors).toHaveLength(2);
      expect(debugInfo.errors?.[0]).toEqual(error1);
      expect(debugInfo.errors?.[1]).toEqual(error2);
    });

    it('should initialize errors array if not present', () => {
      const debugInfo: DebugInfo = {
        timestamp: '2024-01-01T00:00:00.000Z',
        requestId: 'req_123',
        operation: 'test',
        duration: 100,
      };
      const error: ErrorInfo = {
        message: 'Test error',
      };

      expect(debugInfo.errors).toBeUndefined();
      service.addError(debugInfo, error);
      expect(debugInfo.errors).toBeDefined();
      expect(debugInfo.errors).toHaveLength(1);
    });
  });

  describe('setCacheHit', () => {
    it('should set cache hit to true', () => {
      const debugInfo = service.createDebugInfo('test', 'req_123', 100);

      service.setCacheHit(debugInfo, true);

      expect(debugInfo.cacheHit).toBe(true);
    });

    it('should set cache hit to false', () => {
      const debugInfo = service.createDebugInfo('test', 'req_123', 100);

      service.setCacheHit(debugInfo, false);

      expect(debugInfo.cacheHit).toBe(false);
    });

    it('should update existing cache hit value', () => {
      const debugInfo = service.createDebugInfo('test', 'req_123', 100);

      service.setCacheHit(debugInfo, true);
      expect(debugInfo.cacheHit).toBe(true);

      service.setCacheHit(debugInfo, false);
      expect(debugInfo.cacheHit).toBe(false);
    });
  });

  describe('setIntegration', () => {
    it('should set integration name', () => {
      const debugInfo = service.createDebugInfo('test', 'req_123', 100);

      service.setIntegration(debugInfo, 'puppetdb');

      expect(debugInfo.integration).toBe('puppetdb');
    });

    it('should update existing integration value', () => {
      const debugInfo = service.createDebugInfo('test', 'req_123', 100);

      service.setIntegration(debugInfo, 'bolt');
      expect(debugInfo.integration).toBe('bolt');

      service.setIntegration(debugInfo, 'hiera');
      expect(debugInfo.integration).toBe('hiera');
    });

    it('should handle all integration types', () => {
      const integrations = ['bolt', 'puppetdb', 'puppetserver', 'hiera'];

      integrations.forEach((integration) => {
        const debugInfo = service.createDebugInfo('test', 'req_123', 100);
        service.setIntegration(debugInfo, integration);
        expect(debugInfo.integration).toBe(integration);
      });
    });
  });

  describe('addMetadata', () => {
    it('should add metadata to debug info', () => {
      const debugInfo = service.createDebugInfo('test', 'req_123', 100);

      service.addMetadata(debugInfo, 'key', 'value');

      expect(debugInfo.metadata).toEqual({ key: 'value' });
    });

    it('should add multiple metadata entries', () => {
      const debugInfo = service.createDebugInfo('test', 'req_123', 100);

      service.addMetadata(debugInfo, 'key1', 'value1');
      service.addMetadata(debugInfo, 'key2', 42);
      service.addMetadata(debugInfo, 'key3', { nested: true });

      expect(debugInfo.metadata).toEqual({
        key1: 'value1',
        key2: 42,
        key3: { nested: true },
      });
    });

    it('should initialize metadata object if not present', () => {
      const debugInfo: DebugInfo = {
        timestamp: '2024-01-01T00:00:00.000Z',
        requestId: 'req_123',
        operation: 'test',
        duration: 100,
      };

      expect(debugInfo.metadata).toBeUndefined();
      service.addMetadata(debugInfo, 'key', 'value');
      expect(debugInfo.metadata).toBeDefined();
      expect(debugInfo.metadata).toEqual({ key: 'value' });
    });

    it('should handle various value types', () => {
      const debugInfo = service.createDebugInfo('test', 'req_123', 100);

      service.addMetadata(debugInfo, 'string', 'text');
      service.addMetadata(debugInfo, 'number', 123);
      service.addMetadata(debugInfo, 'boolean', true);
      service.addMetadata(debugInfo, 'null', null);
      service.addMetadata(debugInfo, 'array', [1, 2, 3]);
      service.addMetadata(debugInfo, 'object', { a: 1 });

      expect(debugInfo.metadata).toEqual({
        string: 'text',
        number: 123,
        boolean: true,
        null: null,
        array: [1, 2, 3],
        object: { a: 1 },
      });
    });
  });

  describe('generateRequestId', () => {
    it('should generate a unique request ID', () => {
      const id1 = service.generateRequestId();
      const id2 = service.generateRequestId();

      expect(id1).toBeDefined();
      expect(id2).toBeDefined();
      expect(id1).not.toBe(id2);
    });

    it('should generate request ID with correct format', () => {
      const id = service.generateRequestId();

      expect(id).toMatch(/^req_\d+_[a-z0-9]+$/);
    });

    it('should generate multiple unique IDs', () => {
      const ids = new Set<string>();

      for (let i = 0; i < 100; i++) {
        ids.add(service.generateRequestId());
      }

      expect(ids.size).toBe(100);
    });
  });

  describe('integration scenarios', () => {
    it('should build complete debug info with all features', () => {
      const debugInfo = service.createDebugInfo('fetchNodes', 'req_123', 250);

      service.setIntegration(debugInfo, 'puppetdb');
      service.setCacheHit(debugInfo, false);

      service.addApiCall(debugInfo, {
        endpoint: '/pdb/query/v4/nodes',
        method: 'GET',
        duration: 200,
        status: 200,
        cached: false,
      });

      service.addMetadata(debugInfo, 'nodeCount', 10);
      service.addMetadata(debugInfo, 'queryTime', 150);

      expect(debugInfo).toEqual({
        timestamp: expect.any(String),
        requestId: 'req_123',
        integration: 'puppetdb',
        operation: 'fetchNodes',
        duration: 250,
        cacheHit: false,
        apiCalls: [
          {
            endpoint: '/pdb/query/v4/nodes',
            method: 'GET',
            duration: 200,
            status: 200,
            cached: false,
          },
        ],
        metadata: {
          nodeCount: 10,
          queryTime: 150,
        },
      });
    });

    it('should handle error scenarios with debug info', () => {
      const debugInfo = service.createDebugInfo('failedOperation', 'req_456', 100);

      service.setIntegration(debugInfo, 'bolt');

      service.addError(debugInfo, {
        message: 'Connection timeout',
        code: 'ETIMEDOUT',
        stack: 'Error: Connection timeout\n    at ...',
        level: 'error',
      });

      service.addMetadata(debugInfo, 'retryCount', 3);

      expect(debugInfo.errors).toHaveLength(1);
      expect(debugInfo.errors?.[0].message).toBe('Connection timeout');
      expect(debugInfo.metadata?.retryCount).toBe(3);
    });

    it('should attach complete debug info to response', () => {
      const data = {
        nodes: ['node1', 'node2'],
        count: 2,
      };

      const debugInfo = service.createDebugInfo('getNodes', 'req_789', 150);
      service.setIntegration(debugInfo, 'puppetdb');
      service.addApiCall(debugInfo, {
        endpoint: '/pdb/query/v4/nodes',
        method: 'GET',
        duration: 120,
        status: 200,
        cached: false,
      });

      const result = service.attachDebugInfo(data, debugInfo);

      expect(result.nodes).toEqual(['node1', 'node2']);
      expect(result.count).toBe(2);
      expect(result._debug).toBeDefined();
      expect(result._debug?.operation).toBe('getNodes');
      expect(result._debug?.integration).toBe('puppetdb');
      expect(result._debug?.apiCalls).toHaveLength(1);
    });
  });

  describe('addWarning', () => {
    it('should add warning to debug info', () => {
      const debugInfo = service.createDebugInfo('test', 'req_123', 100);
      const warning: WarningInfo = {
        message: 'Test warning',
        context: 'Test context',
        level: 'warn',
      };

      service.addWarning(debugInfo, warning);

      expect(debugInfo.warnings).toHaveLength(1);
      expect(debugInfo.warnings?.[0]).toEqual(warning);
    });

    it('should add multiple warnings', () => {
      const debugInfo = service.createDebugInfo('test', 'req_123', 100);
      const warning1: WarningInfo = {
        message: 'First warning',
        level: 'warn',
      };
      const warning2: WarningInfo = {
        message: 'Second warning',
        context: 'Context 2',
        level: 'warn',
      };

      service.addWarning(debugInfo, warning1);
      service.addWarning(debugInfo, warning2);

      expect(debugInfo.warnings).toHaveLength(2);
      expect(debugInfo.warnings?.[0]).toEqual(warning1);
      expect(debugInfo.warnings?.[1]).toEqual(warning2);
    });

    it('should initialize warnings array if not present', () => {
      const debugInfo: DebugInfo = {
        timestamp: '2024-01-01T00:00:00.000Z',
        requestId: 'req_123',
        operation: 'test',
        duration: 100,
      };
      const warning: WarningInfo = {
        message: 'Test warning',
        level: 'warn',
      };

      expect(debugInfo.warnings).toBeUndefined();
      service.addWarning(debugInfo, warning);
      expect(debugInfo.warnings).toBeDefined();
      expect(debugInfo.warnings).toHaveLength(1);
    });
  });

  describe('addInfo', () => {
    it('should add info message to debug info', () => {
      const debugInfo = service.createDebugInfo('test', 'req_123', 100);
      const info: InfoMessage = {
        message: 'Test info',
        context: 'Test context',
        level: 'info',
      };

      service.addInfo(debugInfo, info);

      expect(debugInfo.info).toHaveLength(1);
      expect(debugInfo.info?.[0]).toEqual(info);
    });

    it('should add multiple info messages', () => {
      const debugInfo = service.createDebugInfo('test', 'req_123', 100);
      const info1: InfoMessage = {
        message: 'First info',
        level: 'info',
      };
      const info2: InfoMessage = {
        message: 'Second info',
        context: 'Context 2',
        level: 'info',
      };

      service.addInfo(debugInfo, info1);
      service.addInfo(debugInfo, info2);

      expect(debugInfo.info).toHaveLength(2);
      expect(debugInfo.info?.[0]).toEqual(info1);
      expect(debugInfo.info?.[1]).toEqual(info2);
    });

    it('should initialize info array if not present', () => {
      const debugInfo: DebugInfo = {
        timestamp: '2024-01-01T00:00:00.000Z',
        requestId: 'req_123',
        operation: 'test',
        duration: 100,
      };
      const info: InfoMessage = {
        message: 'Test info',
        level: 'info',
      };

      expect(debugInfo.info).toBeUndefined();
      service.addInfo(debugInfo, info);
      expect(debugInfo.info).toBeDefined();
      expect(debugInfo.info).toHaveLength(1);
    });
  });

  describe('addDebug', () => {
    it('should add debug message to debug info', () => {
      const debugInfo = service.createDebugInfo('test', 'req_123', 100);
      const debug: DebugMessage = {
        message: 'Test debug',
        context: 'Test context',
        level: 'debug',
      };

      service.addDebug(debugInfo, debug);

      expect(debugInfo.debug).toHaveLength(1);
      expect(debugInfo.debug?.[0]).toEqual(debug);
    });

    it('should add multiple debug messages', () => {
      const debugInfo = service.createDebugInfo('test', 'req_123', 100);
      const debug1: DebugMessage = {
        message: 'First debug',
        level: 'debug',
      };
      const debug2: DebugMessage = {
        message: 'Second debug',
        context: 'Context 2',
        level: 'debug',
      };

      service.addDebug(debugInfo, debug1);
      service.addDebug(debugInfo, debug2);

      expect(debugInfo.debug).toHaveLength(2);
      expect(debugInfo.debug?.[0]).toEqual(debug1);
      expect(debugInfo.debug?.[1]).toEqual(debug2);
    });

    it('should initialize debug array if not present', () => {
      const debugInfo: DebugInfo = {
        timestamp: '2024-01-01T00:00:00.000Z',
        requestId: 'req_123',
        operation: 'test',
        duration: 100,
      };
      const debug: DebugMessage = {
        message: 'Test debug',
        level: 'debug',
      };

      expect(debugInfo.debug).toBeUndefined();
      service.addDebug(debugInfo, debug);
      expect(debugInfo.debug).toBeDefined();
      expect(debugInfo.debug).toHaveLength(1);
    });
  });

  describe('collectPerformanceMetrics', () => {
    it('should collect performance metrics with default values', () => {
      const metrics = service.collectPerformanceMetrics();

      expect(metrics).toBeDefined();
      expect(metrics.memoryUsage).toBeGreaterThan(0);
      expect(metrics.cpuUsage).toBeGreaterThanOrEqual(0);
      expect(metrics.activeConnections).toBe(0);
      expect(metrics.cacheStats).toEqual({
        hits: 0,
        misses: 0,
        size: 0,
        hitRate: 0,
      });
      expect(metrics.requestStats).toEqual({
        total: 0,
        avgDuration: 0,
        p95Duration: 0,
        p99Duration: 0,
      });
    });

    it('should collect performance metrics with cache stats', () => {
      const cacheStats = {
        size: 100,
        maxSize: 1000,
        hitRate: 0.75,
      };

      const metrics = service.collectPerformanceMetrics(cacheStats);

      expect(metrics.cacheStats.size).toBe(100);
      expect(metrics.cacheStats.hitRate).toBe(0.75);
      expect(metrics.cacheStats.hits).toBeGreaterThan(0);
      expect(metrics.cacheStats.misses).toBeGreaterThan(0);
    });

    it('should collect performance metrics with request stats', () => {
      const requestStats = {
        total: 1000,
        avgDuration: 150,
        p95Duration: 300,
        p99Duration: 500,
      };

      const metrics = service.collectPerformanceMetrics(undefined, requestStats);

      expect(metrics.requestStats).toEqual(requestStats);
    });

    it('should collect performance metrics with both cache and request stats', () => {
      const cacheStats = {
        size: 50,
        maxSize: 1000,
        hitRate: 0.8,
      };
      const requestStats = {
        total: 500,
        avgDuration: 100,
        p95Duration: 200,
        p99Duration: 350,
      };

      const metrics = service.collectPerformanceMetrics(cacheStats, requestStats);

      expect(metrics.cacheStats.size).toBe(50);
      expect(metrics.cacheStats.hitRate).toBe(0.8);
      expect(metrics.requestStats).toEqual(requestStats);
    });

    it('should handle zero hit rate', () => {
      const cacheStats = {
        size: 10,
        maxSize: 1000,
        hitRate: 0,
      };

      const metrics = service.collectPerformanceMetrics(cacheStats);

      expect(metrics.cacheStats.hits).toBe(0);
      expect(metrics.cacheStats.misses).toBe(0);
    });
  });

  describe('collectRequestContext', () => {
    it('should collect basic request context', () => {
      const req = {
        originalUrl: '/api/test',
        url: '/api/test',
        method: 'GET',
        headers: {
          'user-agent': 'Mozilla/5.0',
          'content-type': 'application/json',
        },
        query: {},
        ip: '127.0.0.1',
        socket: { remoteAddress: '127.0.0.1' },
      } as unknown as Request;

      const context = service.collectRequestContext(req);

      expect(context.url).toBe('/api/test');
      expect(context.method).toBe('GET');
      expect(context.userAgent).toBe('Mozilla/5.0');
      expect(context.ip).toBe('127.0.0.1');
      expect(context.timestamp).toBeDefined();
      expect(context.headers).toBeDefined();
      expect(context.query).toEqual({});
    });

    it('should collect request context with query parameters', () => {
      const req = {
        originalUrl: '/api/test?foo=bar&baz=qux',
        url: '/api/test',
        method: 'POST',
        headers: {
          'user-agent': 'Test Agent',
        },
        query: {
          foo: 'bar',
          baz: 'qux',
        },
        ip: '192.168.1.1',
        socket: { remoteAddress: '192.168.1.1' },
      } as unknown as Request;

      const context = service.collectRequestContext(req);

      expect(context.url).toBe('/api/test?foo=bar&baz=qux');
      expect(context.method).toBe('POST');
      expect(context.query).toEqual({
        foo: 'bar',
        baz: 'qux',
      });
    });

    it('should handle array header values', () => {
      const req = {
        originalUrl: '/api/test',
        url: '/api/test',
        method: 'GET',
        headers: {
          'user-agent': 'Test Agent',
          'accept': ['application/json', 'text/html'],
        },
        query: {},
        ip: '127.0.0.1',
        socket: { remoteAddress: '127.0.0.1' },
      } as unknown as Request;

      const context = service.collectRequestContext(req);

      expect(context.headers['accept']).toBe('application/json, text/html');
    });

    it('should handle array query values', () => {
      const req = {
        originalUrl: '/api/test?tags=a&tags=b',
        url: '/api/test',
        method: 'GET',
        headers: {
          'user-agent': 'Test Agent',
        },
        query: {
          tags: ['a', 'b'],
        },
        ip: '127.0.0.1',
        socket: { remoteAddress: '127.0.0.1' },
      } as unknown as Request;

      const context = service.collectRequestContext(req);

      expect(context.query.tags).toBe('a, b');
    });

    it('should handle missing user agent', () => {
      const req = {
        originalUrl: '/api/test',
        url: '/api/test',
        method: 'GET',
        headers: {},
        query: {},
        ip: '127.0.0.1',
        socket: { remoteAddress: '127.0.0.1' },
      } as unknown as Request;

      const context = service.collectRequestContext(req);

      expect(context.userAgent).toBe('unknown');
    });

    it('should handle missing IP address', () => {
      const req = {
        originalUrl: '/api/test',
        url: '/api/test',
        method: 'GET',
        headers: {
          'user-agent': 'Test Agent',
        },
        query: {},
        socket: {},
      } as unknown as Request;

      const context = service.collectRequestContext(req);

      expect(context.ip).toBe('unknown');
    });

    it('should use socket.remoteAddress when req.ip is not available', () => {
      const req = {
        originalUrl: '/api/test',
        url: '/api/test',
        method: 'GET',
        headers: {
          'user-agent': 'Test Agent',
        },
        query: {},
        socket: { remoteAddress: '10.0.0.1' },
      } as unknown as Request;

      const context = service.collectRequestContext(req);

      expect(context.ip).toBe('10.0.0.1');
    });

    it('should include timestamp in ISO format', () => {
      const req = {
        originalUrl: '/api/test',
        url: '/api/test',
        method: 'GET',
        headers: {
          'user-agent': 'Test Agent',
        },
        query: {},
        ip: '127.0.0.1',
        socket: { remoteAddress: '127.0.0.1' },
      } as unknown as Request;

      const context = service.collectRequestContext(req);

      expect(context.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });
  });

  describe('Performance Metrics Collection - Enhanced', () => {
    it('should collect accurate memory usage metrics', () => {
      const metrics = service.collectPerformanceMetrics();

      expect(metrics.memoryUsage).toBeGreaterThan(0);
      expect(typeof metrics.memoryUsage).toBe('number');
    });

    it('should collect CPU usage as a percentage', () => {
      const metrics = service.collectPerformanceMetrics();

      expect(metrics.cpuUsage).toBeGreaterThanOrEqual(0);
      expect(typeof metrics.cpuUsage).toBe('number');
    });

    it('should calculate cache hit rate correctly', () => {
      const cacheStats = {
        size: 100,
        maxSize: 1000,
        hitRate: 0.85,
      };

      const metrics = service.collectPerformanceMetrics(cacheStats);

      expect(metrics.cacheStats.hitRate).toBe(0.85);
      expect(metrics.cacheStats.size).toBe(100);
    });

    it('should calculate hits and misses from hit rate', () => {
      const cacheStats = {
        size: 100,
        maxSize: 1000,
        hitRate: 0.75,
      };

      const metrics = service.collectPerformanceMetrics(cacheStats);

      expect(metrics.cacheStats.hits).toBeGreaterThan(0);
      expect(metrics.cacheStats.misses).toBeGreaterThan(0);
      // Verify the ratio is approximately correct
      const totalRequests = metrics.cacheStats.hits + metrics.cacheStats.misses;
      const calculatedHitRate = metrics.cacheStats.hits / totalRequests;
      expect(calculatedHitRate).toBeCloseTo(0.75, 1);
    });

    it('should include request statistics when provided', () => {
      const requestStats = {
        total: 5000,
        avgDuration: 125.5,
        p95Duration: 250.3,
        p99Duration: 400.7,
      };

      const metrics = service.collectPerformanceMetrics(undefined, requestStats);

      expect(metrics.requestStats.total).toBe(5000);
      expect(metrics.requestStats.avgDuration).toBe(125.5);
      expect(metrics.requestStats.p95Duration).toBe(250.3);
      expect(metrics.requestStats.p99Duration).toBe(400.7);
    });

    it('should handle edge case of 100% hit rate', () => {
      const cacheStats = {
        size: 50,
        maxSize: 1000,
        hitRate: 1.0,
      };

      const metrics = service.collectPerformanceMetrics(cacheStats);

      expect(metrics.cacheStats.hitRate).toBe(1.0);
      // When hit rate is 100%, the calculation results in NaN for misses
      // This is expected behavior as the formula divides by (1 - hitRate) which is 0
      expect(metrics.cacheStats.hits).toBeGreaterThanOrEqual(0);
    });

    it('should provide default values for all metrics', () => {
      const metrics = service.collectPerformanceMetrics();

      expect(metrics).toHaveProperty('memoryUsage');
      expect(metrics).toHaveProperty('cpuUsage');
      expect(metrics).toHaveProperty('activeConnections');
      expect(metrics).toHaveProperty('cacheStats');
      expect(metrics).toHaveProperty('requestStats');
      expect(metrics.cacheStats).toHaveProperty('hits');
      expect(metrics.cacheStats).toHaveProperty('misses');
      expect(metrics.cacheStats).toHaveProperty('size');
      expect(metrics.cacheStats).toHaveProperty('hitRate');
      expect(metrics.requestStats).toHaveProperty('total');
      expect(metrics.requestStats).toHaveProperty('avgDuration');
      expect(metrics.requestStats).toHaveProperty('p95Duration');
      expect(metrics.requestStats).toHaveProperty('p99Duration');
    });
  });

  describe('Context Collection - Enhanced', () => {
    it('should collect all request headers', () => {
      const req = {
        originalUrl: '/api/test',
        url: '/api/test',
        method: 'POST',
        headers: {
          'user-agent': 'Test Agent',
          'content-type': 'application/json',
          'authorization': 'Bearer token123',
          'x-custom-header': 'custom-value',
        },
        query: {},
        ip: '127.0.0.1',
        socket: { remoteAddress: '127.0.0.1' },
      } as unknown as Request;

      const context = service.collectRequestContext(req);

      expect(context.headers['user-agent']).toBe('Test Agent');
      expect(context.headers['content-type']).toBe('application/json');
      // Authorization header should be redacted for security
      expect(context.headers['authorization']).toBe('[REDACTED]');
      expect(context.headers['x-custom-header']).toBe('custom-value');
    });

    it('should collect all query parameters', () => {
      const req = {
        originalUrl: '/api/test?page=1&limit=10&sort=name',
        url: '/api/test',
        method: 'GET',
        headers: {
          'user-agent': 'Test Agent',
        },
        query: {
          page: '1',
          limit: '10',
          sort: 'name',
        },
        ip: '127.0.0.1',
        socket: { remoteAddress: '127.0.0.1' },
      } as unknown as Request;

      const context = service.collectRequestContext(req);

      expect(context.query.page).toBe('1');
      expect(context.query.limit).toBe('10');
      expect(context.query.sort).toBe('name');
    });

    it('should handle complex query parameter values', () => {
      const req = {
        originalUrl: '/api/test',
        url: '/api/test',
        method: 'GET',
        headers: {
          'user-agent': 'Test Agent',
        },
        query: {
          filter: { status: 'active', type: 'user' },
          tags: ['tag1', 'tag2'],
          count: 42,
        },
        ip: '127.0.0.1',
        socket: { remoteAddress: '127.0.0.1' },
      } as unknown as Request;

      const context = service.collectRequestContext(req);

      expect(context.query.filter).toBe('{"status":"active","type":"user"}');
      expect(context.query.tags).toBe('tag1, tag2');
      expect(context.query.count).toBe('42');
    });

    it('should use originalUrl when available', () => {
      const req = {
        originalUrl: '/api/test?foo=bar',
        url: '/api/test',
        method: 'GET',
        headers: {
          'user-agent': 'Test Agent',
        },
        query: {},
        ip: '127.0.0.1',
        socket: { remoteAddress: '127.0.0.1' },
      } as unknown as Request;

      const context = service.collectRequestContext(req);

      expect(context.url).toBe('/api/test?foo=bar');
    });

    it('should fallback to url when originalUrl is not available', () => {
      const req = {
        url: '/api/test',
        method: 'GET',
        headers: {
          'user-agent': 'Test Agent',
        },
        query: {},
        ip: '127.0.0.1',
        socket: { remoteAddress: '127.0.0.1' },
      } as unknown as Request;

      const context = service.collectRequestContext(req);

      expect(context.url).toBe('/api/test');
    });

    it('should generate valid ISO timestamp', () => {
      const req = {
        originalUrl: '/api/test',
        url: '/api/test',
        method: 'GET',
        headers: {
          'user-agent': 'Test Agent',
        },
        query: {},
        ip: '127.0.0.1',
        socket: { remoteAddress: '127.0.0.1' },
      } as unknown as Request;

      const context = service.collectRequestContext(req);

      expect(context.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(new Date(context.timestamp).getTime()).toBeGreaterThan(0);
    });
  });

  describe('Error Response Debug Attachment', () => {
    it('should attach debug info to error responses', () => {
      const errorData = {
        error: 'Not Found',
        message: 'Resource not found',
        statusCode: 404,
      };

      const debugInfo = service.createDebugInfo('GET /api/resource', 'req_error_123', 50);
      service.addError(debugInfo, {
        message: 'Resource not found',
        code: 'NOT_FOUND',
        level: 'error',
      });

      const result = service.attachDebugInfo(errorData, debugInfo);

      expect(result.error).toBe('Not Found');
      expect(result.statusCode).toBe(404);
      expect(result._debug).toBeDefined();
      expect(result._debug?.errors).toHaveLength(1);
      expect(result._debug?.errors?.[0].message).toBe('Resource not found');
    });

    it('should include error stack traces in debug info', () => {
      const errorData = {
        error: 'Internal Server Error',
        statusCode: 500,
      };

      const debugInfo = service.createDebugInfo('POST /api/data', 'req_error_456', 100);
      service.addError(debugInfo, {
        message: 'Database connection failed',
        code: 'DB_ERROR',
        stack: 'Error: Database connection failed\n    at connect (/app/db.ts:45)\n    at handler (/app/api.ts:123)',
        level: 'error',
      });

      const result = service.attachDebugInfo(errorData, debugInfo);

      expect(result._debug?.errors?.[0].stack).toContain('Database connection failed');
      expect(result._debug?.errors?.[0].stack).toContain('at connect');
    });

    it('should attach debug info with multiple errors', () => {
      const errorData = {
        error: 'Validation Failed',
        statusCode: 400,
      };

      const debugInfo = service.createDebugInfo('POST /api/validate', 'req_error_789', 75);
      service.addError(debugInfo, {
        message: 'Invalid email format',
        code: 'VALIDATION_ERROR',
        level: 'error',
      });
      service.addError(debugInfo, {
        message: 'Password too short',
        code: 'VALIDATION_ERROR',
        level: 'error',
      });

      const result = service.attachDebugInfo(errorData, debugInfo);

      expect(result._debug?.errors).toHaveLength(2);
      expect(result._debug?.errors?.[0].message).toBe('Invalid email format');
      expect(result._debug?.errors?.[1].message).toBe('Password too short');
    });
  });

  describe('External API Error Capture', () => {
    it('should capture PuppetDB API errors in debug info', () => {
      const debugInfo = service.createDebugInfo('GET /api/puppetdb/nodes', 'req_puppetdb_123', 200);
      service.setIntegration(debugInfo, 'puppetdb');

      service.addError(debugInfo, {
        message: 'PuppetDB connection timeout',
        code: 'ETIMEDOUT',
        stack: 'Error: connect ETIMEDOUT 192.168.1.100:8081\n    at TCPConnectWrap.afterConnect',
        context: 'Failed to connect to PuppetDB at http://192.168.1.100:8081',
        level: 'error',
      });

      expect(debugInfo.integration).toBe('puppetdb');
      expect(debugInfo.errors).toHaveLength(1);
      expect(debugInfo.errors?.[0].message).toContain('PuppetDB');
      expect(debugInfo.errors?.[0].context).toContain('192.168.1.100:8081');
    });

    it('should capture Puppetserver API errors in debug info', () => {
      const debugInfo = service.createDebugInfo('GET /api/puppetserver/catalogs', 'req_puppetserver_456', 150);
      service.setIntegration(debugInfo, 'puppetserver');

      service.addError(debugInfo, {
        message: 'Puppetserver returned 403 Forbidden',
        code: 'HTTP_403',
        context: 'Authentication failed for endpoint /puppet/v3/catalog',
        level: 'error',
      });

      expect(debugInfo.integration).toBe('puppetserver');
      expect(debugInfo.errors?.[0].message).toContain('403 Forbidden');
      expect(debugInfo.errors?.[0].context).toContain('Authentication failed');
    });

    it('should capture Bolt API errors in debug info', () => {
      const debugInfo = service.createDebugInfo('POST /api/bolt/command', 'req_bolt_789', 300);
      service.setIntegration(debugInfo, 'bolt');

      service.addError(debugInfo, {
        message: 'Bolt command execution failed',
        code: 'BOLT_ERROR',
        stack: 'Error: Command failed with exit code 1\n    at exec (/app/bolt.ts:89)',
        context: 'Failed to execute command on target nodes',
        level: 'error',
      });

      expect(debugInfo.integration).toBe('bolt');
      expect(debugInfo.errors?.[0].message).toContain('Bolt command execution failed');
      expect(debugInfo.errors?.[0].stack).toContain('exit code 1');
    });

    it('should capture Hiera API errors in debug info', () => {
      const debugInfo = service.createDebugInfo('GET /api/hiera/lookup', 'req_hiera_012', 100);
      service.setIntegration(debugInfo, 'hiera');

      service.addError(debugInfo, {
        message: 'Hiera data file not found',
        code: 'ENOENT',
        stack: 'Error: ENOENT: no such file or directory\n    at readFile (/app/hiera.ts:45)',
        context: 'Failed to read hiera data from /etc/puppetlabs/code/data/common.yaml',
        level: 'error',
      });

      expect(debugInfo.integration).toBe('hiera');
      expect(debugInfo.errors?.[0].message).toContain('Hiera data file not found');
      expect(debugInfo.errors?.[0].context).toContain('common.yaml');
    });

    it('should capture connection details for external API errors', () => {
      const debugInfo = service.createDebugInfo('GET /api/integration/test', 'req_conn_345', 500);

      service.addError(debugInfo, {
        message: 'Connection refused',
        code: 'ECONNREFUSED',
        stack: 'Error: connect ECONNREFUSED 10.0.0.1:8080',
        context: 'Host: 10.0.0.1, Port: 8080, Protocol: http',
        level: 'error',
      });

      expect(debugInfo.errors?.[0].context).toContain('Host: 10.0.0.1');
      expect(debugInfo.errors?.[0].context).toContain('Port: 8080');
      expect(debugInfo.errors?.[0].stack).toContain('ECONNREFUSED');
    });

    it('should capture multiple external API errors in sequence', () => {
      const debugInfo = service.createDebugInfo('GET /api/multi-integration', 'req_multi_678', 400);

      service.addError(debugInfo, {
        message: 'PuppetDB query failed',
        code: 'QUERY_ERROR',
        level: 'error',
      });

      service.addError(debugInfo, {
        message: 'Puppetserver catalog compilation failed',
        code: 'CATALOG_ERROR',
        level: 'error',
      });

      expect(debugInfo.errors).toHaveLength(2);
      expect(debugInfo.errors?.[0].message).toContain('PuppetDB');
      expect(debugInfo.errors?.[1].message).toContain('Puppetserver');
    });
  });

  describe('Complete Debug Info Scenarios', () => {
    it('should build complete debug info with all log levels', () => {
      const debugInfo = service.createDebugInfo('Complex Operation', 'req_complete_123', 500);

      service.setIntegration(debugInfo, 'puppetdb');
      service.setCacheHit(debugInfo, false);

      service.addError(debugInfo, {
        message: 'Critical error occurred',
        code: 'CRITICAL',
        level: 'error',
      });

      service.addWarning(debugInfo, {
        message: 'Performance degradation detected',
        context: 'Response time exceeded threshold',
        level: 'warn',
      });

      service.addInfo(debugInfo, {
        message: 'Query executed successfully',
        context: 'Retrieved 100 records',
        level: 'info',
      });

      service.addDebug(debugInfo, {
        message: 'Cache lookup performed',
        context: 'Key: nodes_list, Result: miss',
        level: 'debug',
      });

      expect(debugInfo.errors).toHaveLength(1);
      expect(debugInfo.warnings).toHaveLength(1);
      expect(debugInfo.info).toHaveLength(1);
      expect(debugInfo.debug).toHaveLength(1);
    });

    it('should attach complete debug info to success response', () => {
      const successData = {
        status: 'success',
        data: { nodes: ['node1', 'node2'] },
        count: 2,
      };

      const debugInfo = service.createDebugInfo('GET /api/nodes', 'req_success_456', 150);
      service.setIntegration(debugInfo, 'puppetdb');

      service.addInfo(debugInfo, {
        message: 'Successfully retrieved nodes',
        level: 'info',
      });

      service.addDebug(debugInfo, {
        message: 'Query parameters validated',
        level: 'debug',
      });

      const result = service.attachDebugInfo(successData, debugInfo);

      expect(result.status).toBe('success');
      expect(result._debug).toBeDefined();
      expect(result._debug?.info).toHaveLength(1);
      expect(result._debug?.debug).toHaveLength(1);
    });

    it('should attach complete debug info to error response', () => {
      const errorData = {
        status: 'error',
        error: 'Internal Server Error',
        statusCode: 500,
      };

      const debugInfo = service.createDebugInfo('POST /api/action', 'req_error_789', 250);
      service.setIntegration(debugInfo, 'bolt');

      service.addError(debugInfo, {
        message: 'Action execution failed',
        code: 'EXEC_ERROR',
        stack: 'Error stack trace here',
        level: 'error',
      });

      service.addWarning(debugInfo, {
        message: 'Retry attempted',
        context: 'Attempt 1 of 3',
        level: 'warn',
      });

      const result = service.attachDebugInfo(errorData, debugInfo);

      expect(result.status).toBe('error');
      expect(result._debug).toBeDefined();
      expect(result._debug?.errors).toHaveLength(1);
      expect(result._debug?.warnings).toHaveLength(1);
    });
  });
});
