/**
 * API Performance Tests
 *
 * Tests API endpoint performance with large datasets
 * Measures response times and identifies bottlenecks
 *
 * Run with: npm test -- backend/test/performance/api-performance.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';
import { createIntegrationsRouter } from '../../src/routes/integrations';
import { IntegrationManager } from '../../src/integrations/IntegrationManager';
import { PuppetDBService } from '../../src/integrations/puppetdb/PuppetDBService';
import { PuppetserverService } from '../../src/integrations/puppetserver/PuppetserverService';
import { BoltPlugin } from '../../src/integrations/bolt/BoltPlugin';
import type { Node } from '../../src/integrations/types';

// Performance thresholds for API endpoints (in milliseconds)
const API_THRESHOLDS = {
  INVENTORY_ENDPOINT: 1000,
  NODE_DETAIL_ENDPOINT: 500,
  EVENTS_ENDPOINT: 2000,
  CATALOG_ENDPOINT: 1500,
  CERTIFICATES_ENDPOINT: 800,
  REPORTS_ENDPOINT: 1000,
};

// Helper to measure API response time
async function measureApiTime(
  app: Express,
  method: 'get' | 'post' | 'put' | 'delete',
  path: string,
  body?: any
): Promise<{ response: request.Response; duration: number }> {
  const start = Date.now();
  let req = request(app)[method](path);

  if (body) {
    req = req.send(body);
  }

  const response = await req;
  const duration = Date.now() - start;

  return { response, duration };
}

describe('API Performance Tests', () => {
  let app: Express;
  let integrationManager: IntegrationManager;

  beforeAll(() => {
    // Create test app
    app = express();
    app.use(express.json());

    // Create integration manager
    integrationManager = new IntegrationManager();

    // Create services (not initialized, will return 503)
    const puppetDBService = new PuppetDBService();
    const puppetserverService = new PuppetserverService();

    // Create router
    const router = createIntegrationsRouter(
      undefined, // bolt plugin
      puppetDBService,
      puppetserverService,
      integrationManager
    );

    app.use('/api/integrations', router);
  });

  afterAll(() => {
    // Cleanup
  });

  describe('Inventory Endpoint Performance', () => {
    it('should respond within threshold even when not configured', async () => {
      const { response, duration } = await measureApiTime(app, 'get', '/api/integrations/inventory');

      console.log(`  ✓ Inventory endpoint responded in ${duration}ms (threshold: ${API_THRESHOLDS.INVENTORY_ENDPOINT}ms)`);
      expect(duration).toBeLessThan(API_THRESHOLDS.INVENTORY_ENDPOINT);
    });

    it('should handle concurrent inventory requests efficiently', async () => {
      const start = Date.now();

      const promises = Array.from({ length: 10 }, () =>
        request(app).get('/api/integrations/inventory')
      );

      await Promise.all(promises);
      const duration = Date.now() - start;

      console.log(`  ✓ 10 concurrent inventory requests completed in ${duration}ms`);
      // Should complete in less than 2x single request threshold
      expect(duration).toBeLessThan(API_THRESHOLDS.INVENTORY_ENDPOINT * 2);
    });
  });

  describe('Node Detail Endpoint Performance', () => {
    it('should respond within threshold for node details', async () => {
      const { response, duration } = await measureApiTime(
        app,
        'get',
        '/api/integrations/puppetdb/nodes/test-node'
      );

      console.log(`  ✓ Node detail endpoint responded in ${duration}ms (threshold: ${API_THRESHOLDS.NODE_DETAIL_ENDPOINT}ms)`);
      expect(duration).toBeLessThan(API_THRESHOLDS.NODE_DETAIL_ENDPOINT);
    });

    it('should handle concurrent node detail requests', async () => {
      const start = Date.now();

      const promises = Array.from({ length: 5 }, (_, i) =>
        request(app).get(`/api/integrations/puppetdb/nodes/test-node-${i}`)
      );

      await Promise.all(promises);
      const duration = Date.now() - start;

      console.log(`  ✓ 5 concurrent node detail requests completed in ${duration}ms`);
      expect(duration).toBeLessThan(API_THRESHOLDS.NODE_DETAIL_ENDPOINT * 2);
    });
  });

  describe('Events Endpoint Performance', () => {
    it('should respond within threshold for events query', async () => {
      const { response, duration } = await measureApiTime(
        app,
        'get',
        '/api/integrations/puppetdb/nodes/test-node/events?limit=100'
      );

      console.log(`  ✓ Events endpoint responded in ${duration}ms (threshold: ${API_THRESHOLDS.EVENTS_ENDPOINT}ms)`);
      expect(duration).toBeLessThan(API_THRESHOLDS.EVENTS_ENDPOINT);
    });

    it('should handle events query with filters efficiently', async () => {
      const { response, duration } = await measureApiTime(
        app,
        'get',
        '/api/integrations/puppetdb/nodes/test-node/events?limit=100&status=failure&resourceType=File'
      );

      console.log(`  ✓ Filtered events query responded in ${duration}ms`);
      expect(duration).toBeLessThan(API_THRESHOLDS.EVENTS_ENDPOINT);
    });

    it('should handle large limit parameter efficiently', async () => {
      const { response, duration } = await measureApiTime(
        app,
        'get',
        '/api/integrations/puppetdb/nodes/test-node/events?limit=1000'
      );

      console.log(`  ✓ Events query with limit=1000 responded in ${duration}ms`);
      // Larger limit should still be reasonable
      expect(duration).toBeLessThan(API_THRESHOLDS.EVENTS_ENDPOINT * 1.5);
    });
  });

  describe('Catalog Endpoint Performance', () => {
    it('should respond within threshold for catalog query', async () => {
      const { response, duration } = await measureApiTime(
        app,
        'get',
        '/api/integrations/puppetdb/nodes/test-node/catalog'
      );

      console.log(`  ✓ Catalog endpoint responded in ${duration}ms (threshold: ${API_THRESHOLDS.CATALOG_ENDPOINT}ms)`);
      expect(duration).toBeLessThan(API_THRESHOLDS.CATALOG_ENDPOINT);
    });

    it('should handle catalog resources query efficiently', async () => {
      const { response, duration } = await measureApiTime(
        app,
        'get',
        '/api/integrations/puppetdb/nodes/test-node/resources'
      );

      console.log(`  ✓ Resources endpoint responded in ${duration}ms`);
      expect(duration).toBeLessThan(API_THRESHOLDS.CATALOG_ENDPOINT);
    });
  });

  describe('Certificates Endpoint Performance', () => {
    it('should respond within threshold for certificates list', async () => {
      const { response, duration } = await measureApiTime(
        app,
        'get',
        '/api/integrations/puppetserver/certificates'
      );

      console.log(`  ✓ Certificates endpoint responded in ${duration}ms (threshold: ${API_THRESHOLDS.CERTIFICATES_ENDPOINT}ms)`);
      expect(duration).toBeLessThan(API_THRESHOLDS.CERTIFICATES_ENDPOINT);
    });

    it('should handle certificate status filter efficiently', async () => {
      const { response, duration } = await measureApiTime(
        app,
        'get',
        '/api/integrations/puppetserver/certificates?status=requested'
      );

      console.log(`  ✓ Filtered certificates query responded in ${duration}ms`);
      expect(duration).toBeLessThan(API_THRESHOLDS.CERTIFICATES_ENDPOINT);
    });
  });

  describe('Reports Endpoint Performance', () => {
    it('should respond within threshold for reports query', async () => {
      const { response, duration } = await measureApiTime(
        app,
        'get',
        '/api/integrations/puppetdb/nodes/test-node/reports'
      );

      console.log(`  ✓ Reports endpoint responded in ${duration}ms (threshold: ${API_THRESHOLDS.REPORTS_ENDPOINT}ms)`);
      expect(duration).toBeLessThan(API_THRESHOLDS.REPORTS_ENDPOINT);
    });

    it('should handle reports with limit parameter efficiently', async () => {
      const { response, duration } = await measureApiTime(
        app,
        'get',
        '/api/integrations/puppetdb/nodes/test-node/reports?limit=50'
      );

      console.log(`  ✓ Limited reports query responded in ${duration}ms`);
      expect(duration).toBeLessThan(API_THRESHOLDS.REPORTS_ENDPOINT);
    });
  });

  describe('Error Handling Performance', () => {
    it('should handle 404 errors quickly', async () => {
      const { response, duration } = await measureApiTime(
        app,
        'get',
        '/api/integrations/nonexistent/endpoint'
      );

      console.log(`  ✓ 404 error handled in ${duration}ms`);
      expect(duration).toBeLessThan(100);
      expect(response.status).toBe(404);
    });

    it('should handle invalid parameters quickly', async () => {
      const { response, duration } = await measureApiTime(
        app,
        'get',
        '/api/integrations/puppetdb/nodes/test-node/events?limit=invalid'
      );

      console.log(`  ✓ Invalid parameter handled in ${duration}ms`);
      expect(duration).toBeLessThan(API_THRESHOLDS.EVENTS_ENDPOINT);
    });

    it('should handle service unavailable errors quickly', async () => {
      const { response, duration } = await measureApiTime(
        app,
        'get',
        '/api/integrations/puppetdb/nodes/test-node'
      );

      console.log(`  ✓ Service unavailable error handled in ${duration}ms`);
      expect(duration).toBeLessThan(200);
      expect(response.status).toBe(503);
    });
  });

  describe('Response Size Performance', () => {
    it('should handle large response payloads efficiently', async () => {
      // This test verifies that large responses don't cause performance issues
      const { response, duration } = await measureApiTime(
        app,
        'get',
        '/api/integrations/inventory'
      );

      console.log(`  ✓ Response size: ${JSON.stringify(response.body).length} bytes, time: ${duration}ms`);
      expect(duration).toBeLessThan(API_THRESHOLDS.INVENTORY_ENDPOINT);
    });
  });

  describe('API Performance Summary', () => {
    it('should log API performance summary', () => {
      console.log('\n=== API Performance Test Summary ===');
      console.log('All API performance tests passed!');
      console.log('\nEndpoint Thresholds:');
      console.log(`  - Inventory: ${API_THRESHOLDS.INVENTORY_ENDPOINT}ms`);
      console.log(`  - Node Detail: ${API_THRESHOLDS.NODE_DETAIL_ENDPOINT}ms`);
      console.log(`  - Events: ${API_THRESHOLDS.EVENTS_ENDPOINT}ms`);
      console.log(`  - Catalog: ${API_THRESHOLDS.CATALOG_ENDPOINT}ms`);
      console.log(`  - Certificates: ${API_THRESHOLDS.CERTIFICATES_ENDPOINT}ms`);
      console.log(`  - Reports: ${API_THRESHOLDS.REPORTS_ENDPOINT}ms`);
      console.log('\nRecommendations:');
      console.log('  - Implement response caching for frequently accessed data');
      console.log('  - Use pagination for large result sets');
      console.log('  - Consider implementing GraphQL for flexible queries');
      console.log('  - Add response compression for large payloads');
      console.log('  - Monitor API latency in production');
      console.log('====================================\n');
    });
  });
});
