/**
 * Integration Test: External API Errors in Expert Mode
 *
 * This test verifies that external API errors from PuppetDB, Puppetserver, and Bolt
 * are properly captured and included in debug info when expert mode is enabled.
 *
 * Validates: Requirements 3.14
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';
import { createPuppetDBRouter } from '../../src/routes/integrations/puppetdb';
import { createPuppetserverRouter } from '../../src/routes/integrations/puppetserver';
import { createTasksRouter } from '../../src/routes/tasks';
import { expertModeMiddleware } from '../../src/middleware/expertMode';
import { PuppetDBService } from '../../src/integrations/puppetdb/PuppetDBService';
import { PuppetserverService } from '../../src/integrations/puppetserver/PuppetserverService';
import { BoltService } from '../../src/bolt/BoltService';
import {
  PuppetDBConnectionError,
  PuppetDBAuthenticationError,
  PuppetDBQueryError,
} from '../../src/integrations/puppetdb/PuppetDBClient';
import {
  PuppetserverConnectionError,
  PuppetserverAuthenticationError,
  PuppetserverError,
} from '../../src/integrations/puppetserver/errors';
import {
  BoltExecutionError,
  BoltNodeUnreachableError,
  BoltTimeoutError,
} from '../../src/bolt/types';

describe('External API Errors in Expert Mode', () => {
  let app: Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use(expertModeMiddleware);
  });

  describe('PuppetDB API Errors', () => {
    it('should capture PuppetDB connection errors in debug info', async () => {
      // Create a mock PuppetDB service that throws connection error
      const mockPuppetDBService = {
        isInitialized: () => true,
        getInventory: async () => {
          throw new PuppetDBConnectionError(
            'Cannot connect to PuppetDB at https://puppetdb:8081. Is PuppetDB running?',
            {
              host: 'puppetdb',
              port: 8081,
              protocol: 'https',
            }
          );
        },
      } as unknown as PuppetDBService;

      const router = createPuppetDBRouter(mockPuppetDBService);
      app.use('/api/integrations/puppetdb', router);

      const response = await request(app)
        .get('/api/integrations/puppetdb/nodes')
        .set('X-Expert-Mode', 'true')
        .expect(503);

      // Verify response has debug info
      expect(response.body).toHaveProperty('_debug');
      expect(response.body._debug).toHaveProperty('errors');
      expect(response.body._debug.errors).toBeInstanceOf(Array);
      expect(response.body._debug.errors.length).toBeGreaterThan(0);

      // Verify error details are captured
      const error = response.body._debug.errors[0];
      expect(error.message).toContain('PuppetDB connection error');
      expect(error.message).toContain('Cannot connect to PuppetDB');
      expect(error.level).toBe('error');
      expect(error.stack).toBeDefined();

      // Verify integration is set
      expect(response.body._debug.integration).toBe('puppetdb');
    });

    it('should capture PuppetDB authentication errors in debug info', async () => {
      const mockPuppetDBService = {
        isInitialized: () => true,
        getInventory: async () => {
          throw new PuppetDBAuthenticationError(
            'Authentication failed. Check your PuppetDB token.',
            {
              status: 401,
              statusText: 'Unauthorized',
            }
          );
        },
      } as unknown as PuppetDBService;

      const router = createPuppetDBRouter(mockPuppetDBService);
      app.use('/api/integrations/puppetdb-auth', router);

      const response = await request(app)
        .get('/api/integrations/puppetdb-auth/nodes')
        .set('X-Expert-Mode', 'true')
        .expect(401);

      expect(response.body._debug).toBeDefined();
      expect(response.body._debug.errors).toBeInstanceOf(Array);
      expect(response.body._debug.errors.length).toBeGreaterThan(0);

      const error = response.body._debug.errors[0];
      expect(error.message).toContain('PuppetDB authentication error');
      expect(error.message).toContain('Authentication failed');
      expect(error.level).toBe('error');
    });

    it('should capture PuppetDB query errors in debug info', async () => {
      const mockPuppetDBService = {
        isInitialized: () => true,
        getInventory: async () => {
          throw new PuppetDBQueryError(
            'Invalid PQL query syntax',
            'nodes { invalid syntax }',
            {
              status: 400,
              body: 'Query parsing failed',
            }
          );
        },
      } as unknown as PuppetDBService;

      const router = createPuppetDBRouter(mockPuppetDBService);
      app.use('/api/integrations/puppetdb-query', router);

      const response = await request(app)
        .get('/api/integrations/puppetdb-query/nodes')
        .set('X-Expert-Mode', 'true')
        .expect(400);

      expect(response.body._debug).toBeDefined();
      expect(response.body._debug.errors).toBeInstanceOf(Array);
      expect(response.body._debug.errors.length).toBeGreaterThan(0);

      const error = response.body._debug.errors[0];
      expect(error.message).toContain('PuppetDB query error');
      expect(error.message).toContain('Invalid PQL query syntax');
      expect(error.level).toBe('error');
    });
  });

  describe('Puppetserver API Errors', () => {
    it('should capture Puppetserver connection errors in debug info', async () => {
      const mockPuppetserverService = {
        isInitialized: () => true,
        listEnvironments: async () => {
          throw new PuppetserverConnectionError(
            'Cannot connect to Puppetserver at https://puppetserver:8140. Is Puppetserver running?',
            {
              host: 'puppetserver',
              port: 8140,
              protocol: 'https',
            }
          );
        },
      } as unknown as PuppetserverService;

      const router = createPuppetserverRouter(mockPuppetserverService);
      app.use('/api/integrations/puppetserver', router);

      const response = await request(app)
        .get('/api/integrations/puppetserver/environments')
        .set('X-Expert-Mode', 'true')
        .expect(503);

      expect(response.body._debug).toBeDefined();
      expect(response.body._debug.errors).toBeInstanceOf(Array);
      expect(response.body._debug.errors.length).toBeGreaterThan(0);

      const error = response.body._debug.errors[0];
      expect(error.message).toContain('Cannot connect to Puppetserver');
      expect(error.level).toBe('error');
      expect(error.stack).toBeDefined();

      expect(response.body._debug.integration).toBe('puppetserver');
    });

    it('should capture Puppetserver authentication errors in debug info', async () => {
      const mockPuppetserverService = {
        isInitialized: () => true,
        listEnvironments: async () => {
          throw new PuppetserverAuthenticationError(
            'Authentication failed. Check your Puppetserver token or certificate configuration.',
            {
              status: 403,
              statusText: 'Forbidden',
            }
          );
        },
      } as unknown as PuppetserverService;

      const router = createPuppetserverRouter(mockPuppetserverService);
      app.use('/api/integrations/puppetserver-auth', router);

      const response = await request(app)
        .get('/api/integrations/puppetserver-auth/environments')
        .set('X-Expert-Mode', 'true')
        .expect(500);

      expect(response.body._debug).toBeDefined();
      expect(response.body._debug.errors).toBeInstanceOf(Array);
      expect(response.body._debug.errors.length).toBeGreaterThan(0);

      const error = response.body._debug.errors[0];
      expect(error.message).toContain('Authentication failed');
      expect(error.level).toBe('error');
    });

    it('should capture Puppetserver API errors with status codes in debug info', async () => {
      const mockPuppetserverService = {
        isInitialized: () => true,
        listEnvironments: async () => {
          throw new PuppetserverError(
            'Puppetserver API error: Internal Server Error',
            'HTTP_500',
            {
              status: 500,
              statusText: 'Internal Server Error',
              body: 'Server encountered an error',
            }
          );
        },
      } as unknown as PuppetserverService;

      const router = createPuppetserverRouter(mockPuppetserverService);
      app.use('/api/integrations/puppetserver-error', router);

      const response = await request(app)
        .get('/api/integrations/puppetserver-error/environments')
        .set('X-Expert-Mode', 'true')
        .expect(500);

      expect(response.body._debug).toBeDefined();
      expect(response.body._debug.errors).toBeInstanceOf(Array);
      expect(response.body._debug.errors.length).toBeGreaterThan(0);

      const error = response.body._debug.errors[0];
      expect(error.message).toContain('Puppetserver API error');
      expect(error.level).toBe('error');
    });
  });

  describe('Bolt API Errors', () => {
    it('should capture Bolt execution errors in debug info', async () => {
      const mockBoltService = {
        listTasks: async () => {
          throw new BoltExecutionError(
            'Bolt command failed with exit code 1',
            1,
            'Error: Task execution failed',
            ''
          );
        },
      } as unknown as BoltService;

      const mockIntegrationManager = {
        getExecutionTool: () => ({
          getBoltService: () => mockBoltService,
        }),
      } as any;

      const mockExecutionRepository = {} as any;

      const router = createTasksRouter(mockIntegrationManager, mockExecutionRepository);
      app.use('/api/tasks', router);

      const response = await request(app)
        .get('/api/tasks')
        .set('X-Expert-Mode', 'true')
        .expect(500);

      expect(response.body._debug).toBeDefined();
      expect(response.body._debug.errors).toBeInstanceOf(Array);
      expect(response.body._debug.errors.length).toBeGreaterThan(0);

      const error = response.body._debug.errors[0];
      expect(error.message).toContain('Bolt execution failed');
      expect(error.level).toBe('error');
      expect(error.stack).toBeDefined();

      expect(response.body._debug.integration).toBe('bolt');
    });

    it('should capture Bolt node unreachable errors in debug info', async () => {
      const mockBoltService = {
        listTasks: async () => {
          throw new BoltNodeUnreachableError(
            'Node node1.example.com is unreachable',
            'node1.example.com',
            'Connection refused'
          );
        },
      } as unknown as BoltService;

      const mockIntegrationManager = {
        getExecutionTool: () => ({
          getBoltService: () => mockBoltService,
        }),
      } as any;

      const mockExecutionRepository = {} as any;

      const router = createTasksRouter(mockIntegrationManager, mockExecutionRepository);
      app.use('/api/tasks-unreachable', router);

      const response = await request(app)
        .get('/api/tasks-unreachable')
        .set('X-Expert-Mode', 'true')
        .expect(500);

      expect(response.body._debug).toBeDefined();
      expect(response.body._debug.errors).toBeInstanceOf(Array);
      expect(response.body._debug.errors.length).toBeGreaterThan(0);

      const error = response.body._debug.errors[0];
      expect(
        error.message.includes('unreachable') || error.message.includes('Bolt')
      ).toBe(true);
      expect(error.level).toBe('error');
    });

    it('should capture Bolt timeout errors in debug info', async () => {
      const mockBoltService = {
        listTasks: async () => {
          throw new BoltTimeoutError(
            'Bolt command execution exceeded timeout of 30000ms',
            30000
          );
        },
      } as unknown as BoltService;

      const mockIntegrationManager = {
        getExecutionTool: () => ({
          getBoltService: () => mockBoltService,
        }),
      } as any;

      const mockExecutionRepository = {} as any;

      const router = createTasksRouter(mockIntegrationManager, mockExecutionRepository);
      app.use('/api/tasks-timeout', router);

      const response = await request(app)
        .get('/api/tasks-timeout')
        .set('X-Expert-Mode', 'true')
        .expect(500);

      expect(response.body._debug).toBeDefined();
      expect(response.body._debug.errors).toBeInstanceOf(Array);
      expect(response.body._debug.errors.length).toBeGreaterThan(0);

      const error = response.body._debug.errors[0];
      expect(
        error.message.includes('timeout') || error.message.includes('Bolt')
      ).toBe(true);
      expect(error.level).toBe('error');
    });
  });

  describe('Expert Mode Disabled', () => {
    it('should NOT include debug info when expert mode is disabled', async () => {
      const mockPuppetDBService = {
        isInitialized: () => true,
        getInventory: async () => {
          throw new PuppetDBConnectionError(
            'Cannot connect to PuppetDB',
            {}
          );
        },
      } as unknown as PuppetDBService;

      const router = createPuppetDBRouter(mockPuppetDBService);
      app.use('/api/integrations/puppetdb-no-expert', router);

      const response = await request(app)
        .get('/api/integrations/puppetdb-no-expert/nodes')
        // No X-Expert-Mode header
        .expect(503);

      // Debug info should NOT be present
      expect(response.body._debug).toBeUndefined();
      expect(response.body.error).toBeDefined();
    });
  });

  describe('Error Details Completeness', () => {
    it('should include stack trace in error debug info', async () => {
      const mockPuppetDBService = {
        isInitialized: () => true,
        getInventory: async () => {
          const error = new PuppetDBConnectionError(
            'Connection failed',
            {}
          );
          // Ensure stack trace is present
          Error.captureStackTrace(error, mockPuppetDBService.getInventory);
          throw error;
        },
      } as unknown as PuppetDBService;

      const router = createPuppetDBRouter(mockPuppetDBService);
      app.use('/api/integrations/puppetdb-stack', router);

      const response = await request(app)
        .get('/api/integrations/puppetdb-stack/nodes')
        .set('X-Expert-Mode', 'true')
        .expect(503);

      expect(response.body._debug).toBeDefined();
      expect(response.body._debug.errors).toBeInstanceOf(Array);
      expect(response.body._debug.errors.length).toBeGreaterThan(0);

      const error = response.body._debug.errors[0];
      expect(error.stack).toBeDefined();
      expect(typeof error.stack).toBe('string');
      expect(error.stack.length).toBeGreaterThan(0);
    });

    it('should include error code when available', async () => {
      const mockPuppetDBService = {
        isInitialized: () => true,
        getInventory: async () => {
          throw new PuppetDBAuthenticationError(
            'Auth failed',
            {
              status: 401,
              statusText: 'Unauthorized',
            }
          );
        },
      } as unknown as PuppetDBService;

      const router = createPuppetDBRouter(mockPuppetDBService);
      app.use('/api/integrations/puppetdb-code', router);

      const response = await request(app)
        .get('/api/integrations/puppetdb-code/nodes')
        .set('X-Expert-Mode', 'true')
        .expect(401);

      expect(response.body._debug).toBeDefined();
      expect(response.body._debug.errors).toBeInstanceOf(Array);
      expect(response.body._debug.errors.length).toBeGreaterThan(0);

      const error = response.body._debug.errors[0];
      // Error code might be in the error object or in the response
      expect(response.body.error.code).toBeDefined();
    });

    it('should include performance metrics in debug info', async () => {
      const mockPuppetDBService = {
        isInitialized: () => true,
        getInventory: async () => {
          throw new PuppetDBConnectionError(
            'Connection failed',
            {}
          );
        },
      } as unknown as PuppetDBService;

      const router = createPuppetDBRouter(mockPuppetDBService);
      app.use('/api/integrations/puppetdb-perf', router);

      const response = await request(app)
        .get('/api/integrations/puppetdb-perf/nodes')
        .set('X-Expert-Mode', 'true')
        .expect(503);

      expect(response.body._debug).toBeDefined();
      expect(response.body._debug.performance).toBeDefined();
      expect(response.body._debug.performance.memoryUsage).toBeDefined();
      expect(response.body._debug.performance.cpuUsage).toBeDefined();
    });

    it('should include request context in debug info', async () => {
      const mockPuppetDBService = {
        isInitialized: () => true,
        getInventory: async () => {
          throw new PuppetDBConnectionError(
            'Connection failed',
            {}
          );
        },
      } as unknown as PuppetDBService;

      const router = createPuppetDBRouter(mockPuppetDBService);
      app.use('/api/integrations/puppetdb-context', router);

      const response = await request(app)
        .get('/api/integrations/puppetdb-context/nodes')
        .set('X-Expert-Mode', 'true')
        .expect(503);

      expect(response.body._debug).toBeDefined();
      expect(response.body._debug.context).toBeDefined();
      expect(response.body._debug.context.url).toBeDefined();
      expect(response.body._debug.context.method).toBe('GET');
      expect(response.body._debug.context.userAgent).toBeDefined();
    });
  });
});
