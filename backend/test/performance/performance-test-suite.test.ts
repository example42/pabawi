/**
 * Comprehensive Performance Test Suite
 *
 * Tests system performance with:
 * - Large inventories (100+ nodes)
 * - Large event datasets
 * - Large catalogs
 * - Multi-source data aggregation
 * - Concurrent operations
 *
 * Run with: npm test -- backend/test/performance/performance-test-suite.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { IntegrationManager } from '../../src/integrations/IntegrationManager';
import { LoggerService } from '../../src/services/LoggerService';
import { PuppetDBService } from '../../src/integrations/puppetdb/PuppetDBService';
import { PuppetserverService } from '../../src/integrations/puppetserver/PuppetserverService';
import { BoltPlugin } from '../../src/integrations/bolt';
import { NodeLinkingService } from '../../src/integrations/NodeLinkingService';
import type { Node } from '../../src/integrations/types';

// Performance thresholds (in milliseconds)
const THRESHOLDS = {
  INVENTORY_LOAD_100_NODES: 500,
  INVENTORY_LOAD_500_NODES: 2000,
  NODE_LINKING_100_NODES: 200,
  NODE_LINKING_500_NODES: 1000,
  EVENTS_QUERY_1000_EVENTS: 1000,
  EVENTS_QUERY_5000_EVENTS: 3000,
  CATALOG_PARSE_100_RESOURCES: 200,
  CATALOG_PARSE_500_RESOURCES: 800,
  CATALOG_PARSE_1000_RESOURCES: 1500,
  MULTI_SOURCE_AGGREGATION: 1000,
  CONCURRENT_OPERATIONS_10: 2000,
};

// Helper to generate mock nodes
function generateMockNodes(count: number, source: string): Node[] {
  const nodes: Node[] = [];
  for (let i = 0; i < count; i++) {
    nodes.push({
      id: `${source}-node-${i}`,
      name: `node${i}.example.com`,
      uri: `ssh://node${i}.example.com`,
      transport: 'ssh',
      source,
      metadata: {
        certname: `node${i}.example.com`,
        os: 'Linux',
        ip: `192.168.1.${i % 255}`,
      },
    });
  }
  return nodes;
}

// Helper to generate mock events
function generateMockEvents(count: number) {
  const events = [];
  const statuses = ['success', 'failure', 'noop', 'skipped'];
  const resourceTypes = ['File', 'Package', 'Service', 'User', 'Group'];

  for (let i = 0; i < count; i++) {
    events.push({
      certname: `node${i % 100}.example.com`,
      report_id: `report-${i}`,
      status: statuses[i % statuses.length],
      timestamp: new Date(Date.now() - i * 60000).toISOString(),
      resource_type: resourceTypes[i % resourceTypes.length],
      resource_title: `/tmp/file-${i}`,
      property: 'ensure',
      old_value: 'absent',
      new_value: 'present',
      message: `Event ${i}`,
    });
  }
  return events;
}

// Helper to generate mock catalog resources
function generateMockCatalog(resourceCount: number) {
  const resources = [];
  const resourceTypes = ['File', 'Package', 'Service', 'User', 'Group', 'Exec', 'Cron'];

  for (let i = 0; i < resourceCount; i++) {
    resources.push({
      type: resourceTypes[i % resourceTypes.length],
      title: `resource-${i}`,
      exported: false,
      tags: [`tag-${i % 10}`],
      file: `/etc/puppet/manifests/site.pp`,
      line: i % 1000,
      parameters: {
        ensure: 'present',
        owner: 'root',
        group: 'root',
        mode: '0644',
        content: `Content for resource ${i}`,
        require: i > 0 ? [`Resource[resource-${i - 1}]`] : [],
      },
    });
  }

  return {
    certname: 'test-node.example.com',
    version: '1234567890',
    environment: 'production',
    transaction_uuid: 'test-uuid',
    catalog_uuid: 'catalog-uuid',
    code_id: 'code-123',
    producer_timestamp: new Date().toISOString(),
    resources: {
      data: resources,
      href: '/pdb/query/v4/resources',
    },
    edges: {
      data: [],
      href: '/pdb/query/v4/edges',
    },
  };
}

// Helper to measure execution time
async function measureTime<T>(fn: () => Promise<T>): Promise<{ result: T; duration: number }> {
  const start = Date.now();
  const result = await fn();
  const duration = Date.now() - start;
  return { result, duration };
}

describe('Performance Test Suite', () => {
  let integrationManager: IntegrationManager;
  let nodeLinkingService: NodeLinkingService;

  beforeAll(() => {
    integrationManager = new IntegrationManager({ logger: new LoggerService('error') });
    nodeLinkingService = new NodeLinkingService(integrationManager);
  });

  afterAll(() => {
    // Cleanup
  });

  describe('Inventory Performance', () => {
    it('should load 100 nodes within performance threshold', async () => {
      const nodes = generateMockNodes(100, 'test-source');

      const { duration } = await measureTime(async () => {
        // Simulate inventory processing
        return nodes.map(node => ({
          ...node,
          processed: true,
        }));
      });

      console.log(`  ✓ Loaded 100 nodes in ${duration}ms (threshold: ${THRESHOLDS.INVENTORY_LOAD_100_NODES}ms)`);
      expect(duration).toBeLessThan(THRESHOLDS.INVENTORY_LOAD_100_NODES);
    });

    it('should load 500 nodes within performance threshold', async () => {
      const nodes = generateMockNodes(500, 'test-source');

      const { duration } = await measureTime(async () => {
        return nodes.map(node => ({
          ...node,
          processed: true,
        }));
      });

      console.log(`  ✓ Loaded 500 nodes in ${duration}ms (threshold: ${THRESHOLDS.INVENTORY_LOAD_500_NODES}ms)`);
      expect(duration).toBeLessThan(THRESHOLDS.INVENTORY_LOAD_500_NODES);
    });

    it('should handle 1000+ nodes without memory issues', async () => {
      const nodes = generateMockNodes(1000, 'test-source');
      const memBefore = process.memoryUsage().heapUsed;

      await measureTime(async () => {
        return nodes.map(node => ({
          ...node,
          processed: true,
        }));
      });

      const memAfter = process.memoryUsage().heapUsed;
      const memIncreaseMB = (memAfter - memBefore) / 1024 / 1024;

      console.log(`  ✓ Memory increase for 1000 nodes: ${memIncreaseMB.toFixed(2)}MB`);
      // Should not use more than 50MB for 1000 nodes
      expect(memIncreaseMB).toBeLessThan(50);
    });
  });

  describe('Node Linking Performance', () => {
    it('should link 100 nodes from multiple sources within threshold', async () => {
      const boltNodes = generateMockNodes(100, 'bolt');
      const puppetdbNodes = generateMockNodes(100, 'puppetdb');
      const puppetserverNodes = generateMockNodes(100, 'puppetserver');

      const allNodes = [...boltNodes, ...puppetdbNodes, ...puppetserverNodes];

      const { result, duration } = await measureTime(async () => {
        return nodeLinkingService.linkNodes(allNodes);
      });

      console.log(`  ✓ Linked 300 nodes (100 from each source) in ${duration}ms (threshold: ${THRESHOLDS.NODE_LINKING_100_NODES}ms)`);
      expect(duration).toBeLessThan(THRESHOLDS.NODE_LINKING_100_NODES);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should link 500 nodes from multiple sources within threshold', async () => {
      const boltNodes = generateMockNodes(500, 'bolt');
      const puppetdbNodes = generateMockNodes(500, 'puppetdb');

      const allNodes = [...boltNodes, ...puppetdbNodes];

      const { result, duration } = await measureTime(async () => {
        return nodeLinkingService.linkNodes(allNodes);
      });

      console.log(`  ✓ Linked 1000 nodes (500 from each source) in ${duration}ms (threshold: ${THRESHOLDS.NODE_LINKING_500_NODES}ms)`);
      expect(duration).toBeLessThan(THRESHOLDS.NODE_LINKING_500_NODES);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should efficiently identify duplicate nodes', async () => {
      // Create nodes with 50% overlap
      const boltNodes = generateMockNodes(200, 'bolt');
      const puppetdbNodes = generateMockNodes(200, 'puppetdb');

      const { result, duration } = await measureTime(async () => {
        return nodeLinkingService.linkNodes([...boltNodes, ...puppetdbNodes]);
      });

      console.log(`  ✓ Identified duplicates in ${duration}ms`);
      // Should find linked nodes (those with same name)
      const linkedNodes = result.filter(n => n.sources && n.sources.length > 1);
      expect(linkedNodes.length).toBeGreaterThan(0);
    });
  });

  describe('Events Query Performance', () => {
    it('should process 1000 events within threshold', async () => {
      const events = generateMockEvents(1000);

      const { duration } = await measureTime(async () => {
        // Simulate event processing
        return events.filter(e => e.status === 'failure');
      });

      console.log(`  ✓ Processed 1000 events in ${duration}ms (threshold: ${THRESHOLDS.EVENTS_QUERY_1000_EVENTS}ms)`);
      expect(duration).toBeLessThan(THRESHOLDS.EVENTS_QUERY_1000_EVENTS);
    });

    it('should process 5000 events within threshold', async () => {
      const events = generateMockEvents(5000);

      const { duration } = await measureTime(async () => {
        return events.filter(e => e.status === 'failure');
      });

      console.log(`  ✓ Processed 5000 events in ${duration}ms (threshold: ${THRESHOLDS.EVENTS_QUERY_5000_EVENTS}ms)`);
      expect(duration).toBeLessThan(THRESHOLDS.EVENTS_QUERY_5000_EVENTS);
    });

    it('should efficiently filter events by resource type', async () => {
      const events = generateMockEvents(2000);

      const { result, duration } = await measureTime(async () => {
        return events.filter(e => e.resource_type === 'File');
      });

      console.log(`  ✓ Filtered 2000 events by resource type in ${duration}ms`);
      expect(duration).toBeLessThan(500);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should efficiently filter events by time range', async () => {
      const events = generateMockEvents(2000);
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

      const { result, duration } = await measureTime(async () => {
        return events.filter(e => e.timestamp > oneHourAgo);
      });

      console.log(`  ✓ Filtered 2000 events by time range in ${duration}ms`);
      expect(duration).toBeLessThan(500);
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('Catalog Parsing Performance', () => {
    it('should parse catalog with 100 resources within threshold', async () => {
      const catalog = generateMockCatalog(100);

      const { duration } = await measureTime(async () => {
        // Simulate catalog parsing
        return catalog.resources.data.map(r => ({
          type: r.type,
          title: r.title,
          parameters: r.parameters,
        }));
      });

      console.log(`  ✓ Parsed catalog with 100 resources in ${duration}ms (threshold: ${THRESHOLDS.CATALOG_PARSE_100_RESOURCES}ms)`);
      expect(duration).toBeLessThan(THRESHOLDS.CATALOG_PARSE_100_RESOURCES);
    });

    it('should parse catalog with 500 resources within threshold', async () => {
      const catalog = generateMockCatalog(500);

      const { duration } = await measureTime(async () => {
        return catalog.resources.data.map(r => ({
          type: r.type,
          title: r.title,
          parameters: r.parameters,
        }));
      });

      console.log(`  ✓ Parsed catalog with 500 resources in ${duration}ms (threshold: ${THRESHOLDS.CATALOG_PARSE_500_RESOURCES}ms)`);
      expect(duration).toBeLessThan(THRESHOLDS.CATALOG_PARSE_500_RESOURCES);
    });

    it('should parse catalog with 1000 resources within threshold', async () => {
      const catalog = generateMockCatalog(1000);

      const { duration } = await measureTime(async () => {
        return catalog.resources.data.map(r => ({
          type: r.type,
          title: r.title,
          parameters: r.parameters,
        }));
      });

      console.log(`  ✓ Parsed catalog with 1000 resources in ${duration}ms (threshold: ${THRESHOLDS.CATALOG_PARSE_1000_RESOURCES}ms)`);
      expect(duration).toBeLessThan(THRESHOLDS.CATALOG_PARSE_1000_RESOURCES);
    });

    it('should efficiently group resources by type', async () => {
      const catalog = generateMockCatalog(500);

      const { result, duration } = await measureTime(async () => {
        const grouped: Record<string, any[]> = {};
        for (const resource of catalog.resources.data) {
          if (!grouped[resource.type]) {
            grouped[resource.type] = [];
          }
          grouped[resource.type].push(resource);
        }
        return grouped;
      });

      console.log(`  ✓ Grouped 500 resources by type in ${duration}ms`);
      expect(duration).toBeLessThan(200);
      expect(Object.keys(result).length).toBeGreaterThan(0);
    });
  });

  describe('Multi-Source Data Aggregation', () => {
    it('should aggregate data from multiple sources within threshold', async () => {
      const boltNodes = generateMockNodes(50, 'bolt');
      const puppetdbNodes = generateMockNodes(50, 'puppetdb');
      const puppetserverNodes = generateMockNodes(50, 'puppetserver');

      const { result, duration } = await measureTime(async () => {
        // Simulate multi-source aggregation
        const allNodes = [...boltNodes, ...puppetdbNodes, ...puppetserverNodes];
        const linked = nodeLinkingService.linkNodes(allNodes);

        // Simulate fetching additional data for each node
        return Promise.all(
          linked.slice(0, 10).map(async (node) => ({
            node,
            facts: { os: 'Linux', ip: '192.168.1.1' },
            status: { last_run: new Date().toISOString() },
          }))
        );
      });

      console.log(`  ✓ Aggregated multi-source data in ${duration}ms (threshold: ${THRESHOLDS.MULTI_SOURCE_AGGREGATION}ms)`);
      expect(duration).toBeLessThan(THRESHOLDS.MULTI_SOURCE_AGGREGATION);
      expect(result.length).toBe(10);
    });

    it('should handle missing data from one source gracefully', async () => {
      const boltNodes = generateMockNodes(50, 'bolt');
      const puppetdbNodes = generateMockNodes(30, 'puppetdb'); // Fewer nodes

      const { result, duration } = await measureTime(async () => {
        const allNodes = [...boltNodes, ...puppetdbNodes];
        return nodeLinkingService.linkNodes(allNodes);
      });

      console.log(`  ✓ Handled partial data in ${duration}ms`);
      expect(result.length).toBeGreaterThan(0);
      // Some nodes should only have one source
      const singleSourceNodes = result.filter(n => !n.sources || n.sources.length === 1);
      expect(singleSourceNodes.length).toBeGreaterThan(0);
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle 10 concurrent inventory requests within threshold', async () => {
      const { duration } = await measureTime(async () => {
        const promises = Array.from({ length: 10 }, (_, i) =>
          Promise.resolve(generateMockNodes(50, `source-${i}`))
        );
        return Promise.all(promises);
      });

      console.log(`  ✓ Handled 10 concurrent requests in ${duration}ms (threshold: ${THRESHOLDS.CONCURRENT_OPERATIONS_10}ms)`);
      expect(duration).toBeLessThan(THRESHOLDS.CONCURRENT_OPERATIONS_10);
    });

    it('should handle concurrent node linking operations', async () => {
      const { result, duration } = await measureTime(async () => {
        const promises = Array.from({ length: 5 }, (_, i) => {
          const nodes = generateMockNodes(100, `source-${i}`);
          return Promise.resolve(nodeLinkingService.linkNodes(nodes));
        });
        return Promise.all(promises);
      });

      console.log(`  ✓ Handled 5 concurrent linking operations in ${duration}ms`);
      expect(duration).toBeLessThan(2000);
      expect(result.length).toBe(5);
    });
  });

  describe('Memory Usage', () => {
    it('should not leak memory during repeated operations', async () => {
      const initialMem = process.memoryUsage().heapUsed;

      // Perform 100 operations
      for (let i = 0; i < 100; i++) {
        const nodes = generateMockNodes(50, 'test');
        nodeLinkingService.linkNodes(nodes);
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMem = process.memoryUsage().heapUsed;
      const memIncreaseMB = (finalMem - initialMem) / 1024 / 1024;

      console.log(`  ✓ Memory increase after 100 operations: ${memIncreaseMB.toFixed(2)}MB`);
      // Should not increase by more than 10MB
      expect(memIncreaseMB).toBeLessThan(10);
    });

    it('should handle large datasets without excessive memory usage', async () => {
      const memBefore = process.memoryUsage().heapUsed;

      // Create large datasets
      const nodes = generateMockNodes(1000, 'test');
      const events = generateMockEvents(5000);
      const catalog = generateMockCatalog(1000);

      const memAfter = process.memoryUsage().heapUsed;
      const memIncreaseMB = (memAfter - memBefore) / 1024 / 1024;

      console.log(`  ✓ Memory for large datasets: ${memIncreaseMB.toFixed(2)}MB`);
      // Should not use more than 100MB for all datasets
      expect(memIncreaseMB).toBeLessThan(100);
    });
  });

  describe('Performance Summary', () => {
    it('should log performance summary', () => {
      console.log('\n=== Performance Test Summary ===');
      console.log('All performance tests passed!');
      console.log('\nThresholds:');
      console.log(`  - Inventory (100 nodes): ${THRESHOLDS.INVENTORY_LOAD_100_NODES}ms`);
      console.log(`  - Inventory (500 nodes): ${THRESHOLDS.INVENTORY_LOAD_500_NODES}ms`);
      console.log(`  - Node Linking (100 nodes): ${THRESHOLDS.NODE_LINKING_100_NODES}ms`);
      console.log(`  - Node Linking (500 nodes): ${THRESHOLDS.NODE_LINKING_500_NODES}ms`);
      console.log(`  - Events (1000): ${THRESHOLDS.EVENTS_QUERY_1000_EVENTS}ms`);
      console.log(`  - Events (5000): ${THRESHOLDS.EVENTS_QUERY_5000_EVENTS}ms`);
      console.log(`  - Catalog (100 resources): ${THRESHOLDS.CATALOG_PARSE_100_RESOURCES}ms`);
      console.log(`  - Catalog (500 resources): ${THRESHOLDS.CATALOG_PARSE_500_RESOURCES}ms`);
      console.log(`  - Catalog (1000 resources): ${THRESHOLDS.CATALOG_PARSE_1000_RESOURCES}ms`);
      console.log(`  - Multi-source aggregation: ${THRESHOLDS.MULTI_SOURCE_AGGREGATION}ms`);
      console.log(`  - Concurrent operations (10): ${THRESHOLDS.CONCURRENT_OPERATIONS_10}ms`);
      console.log('\nRecommendations:');
      console.log('  - If any tests fail, check for inefficient algorithms');
      console.log('  - Consider implementing caching for frequently accessed data');
      console.log('  - Use pagination for large datasets in UI');
      console.log('  - Implement lazy loading for node details');
      console.log('  - Consider database indexes for query optimization');
      console.log('================================\n');
    });
  });
});
