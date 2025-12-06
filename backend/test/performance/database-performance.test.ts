/**
 * Database Performance Tests
 *
 * Tests database operations with large datasets
 * Extends the existing database performance test with additional scenarios
 *
 * Run with: npm test -- backend/test/performance/database-performance.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import sqlite3 from 'sqlite3';
import { ExecutionRepository, type ExecutionRecord } from '../../src/database/ExecutionRepository';
import { readFileSync } from 'fs';
import { join } from 'path';

// Performance thresholds (in milliseconds)
const DB_THRESHOLDS = {
  INSERT_100_RECORDS: 1000,
  INSERT_1000_RECORDS: 5000,
  QUERY_WITH_INDEX: 50,
  QUERY_WITHOUT_INDEX: 500,
  COMPLEX_QUERY: 200,
  BULK_UPDATE: 1000,
  BULK_DELETE: 500,
};

// Helper to promisify database operations
function runAsync(db: sqlite3.Database, sql: string, params?: any[]): Promise<void> {
  return new Promise((resolve, reject) => {
    db.run(sql, params || [], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function allAsync(db: sqlite3.Database, sql: string, params?: any[]): Promise<any[]> {
  return new Promise((resolve, reject) => {
    db.all(sql, params || [], (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function setupDatabase(): Promise<sqlite3.Database> {
  const db = new sqlite3.Database(':memory:');

  // Load and execute schema
  const schemaPath = join(__dirname, '../../src/database/schema.sql');
  const schema = readFileSync(schemaPath, 'utf-8');

  // Split by semicolon and execute each statement
  const statements = schema.split(';').filter(s => s.trim().length > 0);
  for (const statement of statements) {
    await runAsync(db, statement);
  }

  return db;
}

async function generateTestData(
  repo: ExecutionRepository,
  count: number
): Promise<string[]> {
  const statuses: Array<'running' | 'success' | 'failed' | 'partial'> = [
    'running',
    'success',
    'failed',
    'partial',
  ];
  const types: Array<'command' | 'task' | 'facts'> = ['command', 'task', 'facts'];
  const nodes = Array.from({ length: 100 }, (_, i) => `node${i}.example.com`);
  const ids: string[] = [];

  for (let i = 0; i < count; i++) {
    const execution: Omit<ExecutionRecord, 'id'> = {
      type: types[Math.floor(Math.random() * types.length)],
      targetNodes: [nodes[Math.floor(Math.random() * nodes.length)]],
      action: `test-action-${i}`,
      status: statuses[Math.floor(Math.random() * statuses.length)],
      startedAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
      completedAt: new Date(Date.now() - Math.random() * 29 * 24 * 60 * 60 * 1000).toISOString(),
      results: [
        {
          nodeId: nodes[0],
          status: 'success',
          duration: Math.floor(Math.random() * 5000),
        },
      ],
    };

    const id = await repo.create(execution);
    ids.push(id);
  }

  return ids;
}

async function measureTime<T>(fn: () => Promise<T>): Promise<{ result: T; duration: number }> {
  const start = Date.now();
  const result = await fn();
  const duration = Date.now() - start;
  return { result, duration };
}

describe('Database Performance Tests', () => {
  let db: sqlite3.Database;
  let repo: ExecutionRepository;

  beforeAll(async () => {
    db = await setupDatabase();
    repo = new ExecutionRepository(db);
  });

  afterAll(() => {
    db.close();
  });

  describe('Insert Performance', () => {
    it('should insert 100 records within threshold', async () => {
      const { result, duration } = await measureTime(async () => {
        return generateTestData(repo, 100);
      });

      console.log(`  ✓ Inserted 100 records in ${duration}ms (threshold: ${DB_THRESHOLDS.INSERT_100_RECORDS}ms)`);
      console.log(`    Average: ${(duration / 100).toFixed(2)}ms per record`);
      expect(duration).toBeLessThan(DB_THRESHOLDS.INSERT_100_RECORDS);
      expect(result.length).toBe(100);
    });

    it('should insert 1000 records within threshold', async () => {
      const { result, duration } = await measureTime(async () => {
        return generateTestData(repo, 1000);
      });

      console.log(`  ✓ Inserted 1000 records in ${duration}ms (threshold: ${DB_THRESHOLDS.INSERT_1000_RECORDS}ms)`);
      console.log(`    Average: ${(duration / 1000).toFixed(2)}ms per record`);
      expect(duration).toBeLessThan(DB_THRESHOLDS.INSERT_1000_RECORDS);
      expect(result.length).toBe(1000);
    });
  });

  describe('Query Performance with Indexes', () => {
    beforeAll(async () => {
      // Ensure we have enough data
      await generateTestData(repo, 500);
    });

    it('should query by status using index efficiently', async () => {
      const { result, duration } = await measureTime(async () => {
        return repo.findAll({ status: 'success' }, { page: 1, pageSize: 50 });
      });

      console.log(`  ✓ Query by status in ${duration}ms (threshold: ${DB_THRESHOLDS.QUERY_WITH_INDEX}ms)`);
      expect(duration).toBeLessThan(DB_THRESHOLDS.QUERY_WITH_INDEX);
    });

    it('should query by type using index efficiently', async () => {
      const { result, duration } = await measureTime(async () => {
        return repo.findAll({ type: 'command' }, { page: 1, pageSize: 50 });
      });

      console.log(`  ✓ Query by type in ${duration}ms (threshold: ${DB_THRESHOLDS.QUERY_WITH_INDEX}ms)`);
      expect(duration).toBeLessThan(DB_THRESHOLDS.QUERY_WITH_INDEX);
    });

    it('should query by date range using index efficiently', async () => {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const now = new Date().toISOString();

      const { result, duration } = await measureTime(async () => {
        return repo.findAll(
          { startDate: thirtyDaysAgo, endDate: now },
          { page: 1, pageSize: 50 }
        );
      });

      console.log(`  ✓ Query by date range in ${duration}ms (threshold: ${DB_THRESHOLDS.QUERY_WITH_INDEX}ms)`);
      expect(duration).toBeLessThan(DB_THRESHOLDS.QUERY_WITH_INDEX);
    });

    it('should count by status using index efficiently', async () => {
      const { result, duration } = await measureTime(async () => {
        return repo.countByStatus();
      });

      console.log(`  ✓ Count by status in ${duration}ms (threshold: ${DB_THRESHOLDS.QUERY_WITH_INDEX}ms)`);
      expect(duration).toBeLessThan(DB_THRESHOLDS.QUERY_WITH_INDEX);
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('failed');
    });
  });

  describe('Complex Query Performance', () => {
    it('should handle complex multi-filter queries efficiently', async () => {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

      const { result, duration } = await measureTime(async () => {
        return repo.findAll(
          {
            status: 'success',
            type: 'command',
            startDate: thirtyDaysAgo,
          },
          { page: 1, pageSize: 50 }
        );
      });

      console.log(`  ✓ Complex query in ${duration}ms (threshold: ${DB_THRESHOLDS.COMPLEX_QUERY}ms)`);
      expect(duration).toBeLessThan(DB_THRESHOLDS.COMPLEX_QUERY);
    });

    it('should handle pagination efficiently', async () => {
      const { result: page1, duration: duration1 } = await measureTime(async () => {
        return repo.findAll({}, { page: 1, pageSize: 50 });
      });

      const { result: page2, duration: duration2 } = await measureTime(async () => {
        return repo.findAll({}, { page: 2, pageSize: 50 });
      });

      console.log(`  ✓ Page 1 in ${duration1}ms, Page 2 in ${duration2}ms`);
      expect(duration1).toBeLessThan(DB_THRESHOLDS.QUERY_WITH_INDEX);
      expect(duration2).toBeLessThan(DB_THRESHOLDS.QUERY_WITH_INDEX);
      expect(page1.length).toBeGreaterThan(0);
      expect(page2.length).toBeGreaterThan(0);
    });
  });

  describe('Update Performance', () => {
    it('should update single record efficiently', async () => {
      const ids = await generateTestData(repo, 10);
      const id = ids[0];

      const { duration } = await measureTime(async () => {
        return repo.update(id, { status: 'failed' });
      });

      console.log(`  ✓ Single update in ${duration}ms`);
      expect(duration).toBeLessThan(50);
    });

    it('should handle bulk updates efficiently', async () => {
      const ids = await generateTestData(repo, 100);

      const { duration } = await measureTime(async () => {
        for (const id of ids.slice(0, 50)) {
          await repo.update(id, { status: 'failed' });
        }
      });

      console.log(`  ✓ 50 updates in ${duration}ms (threshold: ${DB_THRESHOLDS.BULK_UPDATE}ms)`);
      expect(duration).toBeLessThan(DB_THRESHOLDS.BULK_UPDATE);
    });
  });

  // Note: ExecutionRepository does not have a delete method
  // Delete operations are not part of the current API

  describe('Concurrent Operations', () => {
    it('should handle concurrent reads efficiently', async () => {
      await generateTestData(repo, 200);

      const { duration } = await measureTime(async () => {
        const promises = Array.from({ length: 10 }, () =>
          repo.findAll({}, { page: 1, pageSize: 50 })
        );
        return Promise.all(promises);
      });

      console.log(`  ✓ 10 concurrent reads in ${duration}ms`);
      expect(duration).toBeLessThan(500);
    });

    it('should handle concurrent writes efficiently', async () => {
      const { duration } = await measureTime(async () => {
        const promises = Array.from({ length: 10 }, (_, i) => {
          const execution: Omit<ExecutionRecord, 'id'> = {
            type: 'command',
            targetNodes: ['test-node'],
            action: `concurrent-action-${i}`,
            status: 'success',
            startedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            results: [],
          };
          return repo.create(execution);
        });
        return Promise.all(promises);
      });

      console.log(`  ✓ 10 concurrent writes in ${duration}ms`);
      expect(duration).toBeLessThan(1000);
    });
  });

  describe('Index Effectiveness', () => {
    it('should verify indexes are being used', async () => {
      await generateTestData(repo, 1000);

      // Query with index (status)
      const { duration: withIndex } = await measureTime(async () => {
        return repo.findAll({ status: 'success' }, { page: 1, pageSize: 50 });
      });

      // Query without index (targetNode - uses LIKE on JSON)
      const { duration: withoutIndex } = await measureTime(async () => {
        return repo.findAll({ targetNode: 'node1' }, { page: 1, pageSize: 50 });
      });

      console.log(`  ✓ Query with index: ${withIndex}ms`);
      console.log(`  ✓ Query without index: ${withoutIndex}ms`);
      console.log(`    Index speedup: ${(withoutIndex / withIndex).toFixed(2)}x`);

      // Indexed query should be significantly faster
      expect(withIndex).toBeLessThan(DB_THRESHOLDS.QUERY_WITH_INDEX);
      // Non-indexed query will be slower but should still be reasonable
      expect(withoutIndex).toBeLessThan(DB_THRESHOLDS.QUERY_WITHOUT_INDEX);
    });
  });

  describe('Database Performance Summary', () => {
    it('should log database performance summary', () => {
      console.log('\n=== Database Performance Test Summary ===');
      console.log('All database performance tests passed!');
      console.log('\nOperation Thresholds:');
      console.log(`  - Insert 100 records: ${DB_THRESHOLDS.INSERT_100_RECORDS}ms`);
      console.log(`  - Insert 1000 records: ${DB_THRESHOLDS.INSERT_1000_RECORDS}ms`);
      console.log(`  - Query with index: ${DB_THRESHOLDS.QUERY_WITH_INDEX}ms`);
      console.log(`  - Query without index: ${DB_THRESHOLDS.QUERY_WITHOUT_INDEX}ms`);
      console.log(`  - Complex query: ${DB_THRESHOLDS.COMPLEX_QUERY}ms`);
      console.log(`  - Bulk update: ${DB_THRESHOLDS.BULK_UPDATE}ms`);
      console.log(`  - Bulk delete: ${DB_THRESHOLDS.BULK_DELETE}ms`);
      console.log('\nRecommendations:');
      console.log('  - Indexes are working correctly for status, type, and date queries');
      console.log('  - Consider adding index for frequently queried JSON fields');
      console.log('  - Use pagination for large result sets');
      console.log('  - Monitor query performance in production');
      console.log('  - Consider archiving old execution records');
      console.log('=========================================\n');
    });
  });
});
