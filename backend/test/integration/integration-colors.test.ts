/**
 * Integration tests for the integration colors API endpoint
 */
import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createHttpHarness, type HttpHarness } from '../helpers/httpHarness';
import express, { type Express } from 'express';
import { createIntegrationsRouter } from '../../src/routes/integrations';
import { IntegrationManager } from '../../src/integrations/IntegrationManager';
import { LoggerService } from '../../src/services/LoggerService';

// One loopback-bound HTTP server for the whole file. See
// test/helpers/httpHarness.ts: supertest's default request(app) opens a
// fresh wildcard-bound socket per request, which on macOS can be shadowed
// by an unrelated process holding the same port on 127.0.0.1.
let harness: HttpHarness;

beforeAll(async () => {
  harness = await createHttpHarness();
});

afterAll(async () => {
  await harness.close();
});

describe('Integration Colors API', () => {
  let app: Express;

  beforeEach(() => {
    // Create Express app
    app = express();
    app.use(express.json());

    // Create integration manager (colors endpoint doesn't need any plugins)
    const integrationManager = new IntegrationManager({ logger: new LoggerService('error') });

    // Mount integrations router
    app.use('/api/integrations', createIntegrationsRouter(integrationManager));
  });

  describe('GET /api/integrations/colors', () => {
    it('should return color configuration for all integrations', async () => {
      const response = await request(harness.use(app))
        .get('/api/integrations/colors')
        .expect(200);

      expect(response.body).toHaveProperty('colors');
      expect(response.body).toHaveProperty('integrations');

      // Verify all five integrations are present
      const { colors, integrations } = response.body;
      expect(integrations).toEqual(['proxmox', 'aws', 'azure', 'bolt', 'ansible', 'ssh', 'puppetdb', 'puppetserver', 'hiera', 'checkmk']);

      // Verify each integration has color configuration
      for (const integration of integrations) {
        expect(colors).toHaveProperty(integration);
        expect(colors[integration]).toHaveProperty('primary');
        expect(colors[integration]).toHaveProperty('light');
        expect(colors[integration]).toHaveProperty('dark');

        // Verify colors are in hex format
        expect(colors[integration].primary).toMatch(/^#[0-9A-F]{6}$/i);
        expect(colors[integration].light).toMatch(/^#[0-9A-F]{6}$/i);
        expect(colors[integration].dark).toMatch(/^#[0-9A-F]{6}$/i);
      }
    });

    it('should return consistent colors across multiple requests', async () => {
      const response1 = await request(harness.use(app))
        .get('/api/integrations/colors')
        .expect(200);

      const response2 = await request(harness.use(app))
        .get('/api/integrations/colors')
        .expect(200);

      // Colors should be identical across requests
      expect(response1.body.colors).toEqual(response2.body.colors);
    });

    it('should return distinct colors for each integration', async () => {
      const response = await request(harness.use(app))
        .get('/api/integrations/colors')
        .expect(200);

      const { colors } = response.body;
      const primaryColors = new Set([
        colors.bolt.primary,
        colors.puppetdb.primary,
        colors.puppetserver.primary,
        colors.hiera.primary,
      ]);

      // All primary colors should be unique
      expect(primaryColors.size).toBe(4);
    });
  });
});
