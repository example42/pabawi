/**
 * Graceful Degradation Integration Tests
 *
 * Tests that the system continues to operate normally when Puppetserver
 * is not configured or fails, displaying data from other available sources.
 *
 * Implements requirements:
 * - 1.5: Display error messages and continue showing data from other sources
 * - 4.5: Display error messages while preserving other node detail functionality
 * - 6.5: Display error messages while preserving facts from other sources
 * - 8.5: Operate normally when Puppetserver is not configured
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';
import { createIntegrationsRouter } from '../../src/routes/integrations';
import { IntegrationManager } from '../../src/integrations/IntegrationManager';
import { LoggerService } from '../../src/services/LoggerService';
import { PuppetDBService } from '../../src/integrations/puppetdb/PuppetDBService';
import type { PuppetDBConfig } from '../../src/config/schema';

describe('Graceful Degradation', () => {
  let app: Express;
  let integrationManager: IntegrationManager;
  let puppetDBService: PuppetDBService | undefined;

  beforeAll(async () => {
    // Create Express app
    app = express();
    app.use(express.json());

    // Create integration manager
    integrationManager = new IntegrationManager({ logger: new LoggerService('error') });

    // Initialize PuppetDB if configured (optional for these tests)
    const puppetdbConfig = process.env.PUPPETDB_SERVER_URL
      ? ({
          serverUrl: process.env.PUPPETDB_SERVER_URL,
          port: process.env.PUPPETDB_PORT
            ? parseInt(process.env.PUPPETDB_PORT, 10)
            : undefined,
          token: process.env.PUPPETDB_TOKEN,
          ssl: {
            enabled: process.env.PUPPETDB_SSL_ENABLED === 'true',
            ca: process.env.PUPPETDB_SSL_CA,
            cert: process.env.PUPPETDB_SSL_CERT,
            key: process.env.PUPPETDB_SSL_KEY,
            rejectUnauthorized:
              process.env.PUPPETDB_SSL_REJECT_UNAUTHORIZED !== 'false',
          },
        } as PuppetDBConfig)
      : undefined;

    if (puppetdbConfig) {
      puppetDBService = new PuppetDBService();
      await puppetDBService.initialize({
        name: 'puppetdb',
        type: 'information',
        enabled: true,
        config: puppetdbConfig,
      });
      integrationManager.registerPlugin(puppetDBService);
    }

    // Note: Puppetserver is intentionally NOT configured for these tests
    // to verify graceful degradation

    // Create routes with only PuppetDB (no Puppetserver)
    const router = createIntegrationsRouter(
      integrationManager,
      puppetDBService,
      undefined // No Puppetserver service
    );
    app.use('/api/integrations', router);
  });

  afterAll(async () => {
    // Cleanup
    if (puppetDBService) {
      await puppetDBService.shutdown();
    }
  });

  describe('Integration Status', () => {
    it('should show Puppetserver as not configured', async () => {
      const response = await request(app)
        .get('/api/integrations/status')
        .expect(200);

      expect(response.body).toHaveProperty('integrations');
      expect(Array.isArray(response.body.integrations)).toBe(true);

      // Find Puppetserver in integrations
      const puppetserver = response.body.integrations.find(
        (i: { name: string }) => i.name === 'puppetserver'
      );

      expect(puppetserver).toBeDefined();
      expect(puppetserver.status).toBe('not_configured');
      expect(puppetserver.message).toContain('not configured');
    });

    it('should show PuppetDB status independently', async () => {
      const response = await request(app)
        .get('/api/integrations/status')
        .expect(200);

      // If PuppetDB is configured, it should show its status
      if (puppetDBService) {
        const puppetdb = response.body.integrations.find(
          (i: { name: string }) => i.name === 'puppetdb'
        );

        expect(puppetdb).toBeDefined();
        // Status should be either 'connected' or 'error', not 'not_configured'
        expect(['connected', 'error']).toContain(puppetdb.status);
      }
    });
  });

  describe('Puppetserver Endpoints', () => {
    it('should return 503 for node status when not configured', async () => {
      const response = await request(app)
        .get('/api/integrations/puppetserver/nodes/test-node/status')
        .expect(503);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error.code).toBe('PUPPETSERVER_NOT_CONFIGURED');
    });

    it('should return 503 for node facts when not configured', async () => {
      const response = await request(app)
        .get('/api/integrations/puppetserver/nodes/test-node/facts')
        .expect(503);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error.code).toBe('PUPPETSERVER_NOT_CONFIGURED');
    });

    it('should return 503 for catalog compilation when not configured', async () => {
      const response = await request(app)
        .get('/api/integrations/puppetserver/catalog/test-node/production')
        .expect(503);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error.code).toBe('PUPPETSERVER_NOT_CONFIGURED');
    });
  });

  describe('PuppetDB Endpoints (Graceful Degradation)', () => {
    it('should still work for PuppetDB nodes when Puppetserver is not configured', async () => {
      if (!puppetDBService) {
        console.log('Skipping test: PuppetDB not configured');
        return;
      }

      const response = await request(app)
        .get('/api/integrations/puppetdb/nodes')
        .expect(200);

      expect(response.body).toHaveProperty('nodes');
      expect(response.body.source).toBe('puppetdb');
      expect(Array.isArray(response.body.nodes)).toBe(true);
    });

    it('should still work for PuppetDB facts when Puppetserver is not configured', async () => {
      if (!puppetDBService) {
        console.log('Skipping test: PuppetDB not configured');
        return;
      }

      // First get a node
      const nodesResponse = await request(app)
        .get('/api/integrations/puppetdb/nodes')
        .expect(200);

      if (nodesResponse.body.nodes.length === 0) {
        console.log('Skipping test: No nodes available in PuppetDB');
        return;
      }

      const testNode = nodesResponse.body.nodes[0];

      // Try to get facts for that node
      const factsResponse = await request(app)
        .get(`/api/integrations/puppetdb/nodes/${testNode.id}/facts`)
        .expect((res) => {
          // Should be either 200 (success) or 404 (node not found)
          // Both are acceptable - the important thing is it doesn't fail
          // because Puppetserver is not configured
          expect([200, 404]).toContain(res.status);
        });

      if (factsResponse.status === 200) {
        expect(factsResponse.body).toHaveProperty('facts');
        expect(factsResponse.body.source).toBe('puppetdb');
      }
    });
  });

  describe('Error Messages', () => {
    it('should provide clear error messages for not configured services', async () => {
      const response = await request(app)
        .get('/api/integrations/puppetserver/nodes/test-node/status')
        .expect(503);

      expect(response.body.error.message).toMatch(
        /not configured|not initialized/i
      );
      // Error message should be user-friendly
      expect(response.body.error.message.length).toBeGreaterThan(10);
    });

    it('should include error code for programmatic handling', async () => {
      const response = await request(app)
        .get('/api/integrations/puppetserver/nodes')
        .expect(503);

      expect(response.body.error).toHaveProperty('code');
      expect(response.body.error.code).toBe('PUPPETSERVER_NOT_CONFIGURED');
    });
  });

  describe('System Stability', () => {
    it('should not crash when querying unconfigured Puppetserver', async () => {
      // Make multiple requests to ensure system stability
      const requests = [
        request(app).get('/api/integrations/puppetserver/nodes'),
        request(app).get('/api/integrations/puppetserver/nodes/test/status'),
        request(app).get('/api/integrations/puppetserver/nodes/test/facts'),
      ];

      const responses = await Promise.all(requests);

      // All should return 503, not crash
      responses.forEach((response) => {
        expect(response.status).toBe(503);
        expect(response.body).toHaveProperty('error');
      });
    });

    it('should handle concurrent requests gracefully', async () => {
      // Make many concurrent requests
      const requests = Array.from({ length: 10 }, () =>
        request(app).get('/api/integrations/status')
      );

      const responses = await Promise.all(requests);

      // All should succeed
      responses.forEach((response) => {
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('integrations');
      });
    });
  });
});
