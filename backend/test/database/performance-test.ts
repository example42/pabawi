/**
 * Performance test for database queries with large datasets
 *
 * This test creates 1000+ execution records and measures query performance
 * to ensure indexes are working correctly.
 */

import sqlite3 from 'sqlite3';
import { ExecutionRepository, type ExecutionRecord } from '../../src/database/ExecutionRepository';
import { readFileSync } from 'fs';
import { join } from 'path';

// Helper to promisify database operations
function runAsync(db: sqlite3.Database, sql: string): Promise<void> {
  return new Promise((resolve, reject) => {
    db.run(sql, (err) => {
      if (err) reject(err);
      else resolve();
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

async function generateTestData(repo: ExecutionRepository, count: number): Promise<void> {
  const statuses: Array<'running' | 'success' | 'failed' | 'partial'> = ['running', 'success', 'failed', 'partial'];
  const types: Array<'command' | 'task' | 'facts'> = ['command', 'task', 'facts'];
  const nodes = ['node1', 'node2', 'node3', 'node4', 'node5'];

  console.log(`Generating ${count} test execution records...`);
  const startTime = Date.now();

  for (let i = 0; i < count; i++) {
    const execution: Omit<ExecutionRecord, 'id'> = {
      type: types[Math.floor(Math.random() * types.length)],
      targetNodes: [nodes[Math.floor(Math.random() * nodes.length)]],
      action: `test-action-${i}`,
      status: statuses[Math.floor(Math.random() * statuses.length)],
      startedAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
      completedAt: new Date(Date.now() - Math.random() * 29 * 24 * 60 * 60 * 1000).toISOString(),
      results: [{
        nodeId: nodes[0],
        status: 'success',
        duration: Math.floor(Math.random() * 5000),
      }],
    };

    await repo.create(execution);
  }

  const duration = Date.now() - startTime;
  console.log(`Generated ${count} records in ${duration}ms (${(duration / count).toFixed(2)}ms per record)`);
}

async function testQueryPerformance(repo: ExecutionRepository): Promise<void> {
  console.log('\n=== Query Performance Tests ===\n');

  // Test 1: List recent executions (uses idx_executions_started)
  let startTime = Date.now();
  const recentExecutions = await repo.findAll({}, { page: 1, pageSize: 50 });
  let duration = Date.now() - startTime;
  console.log(`✓ List recent executions (50 items): ${duration}ms`);
  console.log(`  Found ${recentExecutions.length} executions`);

  // Test 2: Filter by status (uses idx_executions_status_started composite index)
  startTime = Date.now();
  const failedExecutions = await repo.findAll({ status: 'failed' }, { page: 1, pageSize: 50 });
  duration = Date.now() - startTime;
  console.log(`✓ Filter by status='failed': ${duration}ms`);
  console.log(`  Found ${failedExecutions.length} executions`);

  // Test 3: Filter by type (uses idx_executions_type_started composite index)
  startTime = Date.now();
  const commandExecutions = await repo.findAll({ type: 'command' }, { page: 1, pageSize: 50 });
  duration = Date.now() - startTime;
  console.log(`✓ Filter by type='command': ${duration}ms`);
  console.log(`  Found ${commandExecutions.length} executions`);

  // Test 4: Filter by date range (uses idx_executions_started)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();
  startTime = Date.now();
  const dateRangeExecutions = await repo.findAll(
    { startDate: thirtyDaysAgo, endDate: fifteenDaysAgo },
    { page: 1, pageSize: 50 }
  );
  duration = Date.now() - startTime;
  console.log(`✓ Filter by date range: ${duration}ms`);
  console.log(`  Found ${dateRangeExecutions.length} executions`);

  // Test 5: Combined filters (uses idx_executions_status_started)
  startTime = Date.now();
  const combinedFilter = await repo.findAll(
    { status: 'success', startDate: thirtyDaysAgo },
    { page: 1, pageSize: 50 }
  );
  duration = Date.now() - startTime;
  console.log(`✓ Combined filter (status + date): ${duration}ms`);
  console.log(`  Found ${combinedFilter.length} executions`);

  // Test 6: Count by status (uses idx_executions_status)
  startTime = Date.now();
  const statusCounts = await repo.countByStatus();
  duration = Date.now() - startTime;
  console.log(`✓ Count by status: ${duration}ms`);
  console.log(`  Total: ${statusCounts.total}, Success: ${statusCounts.success}, Failed: ${statusCounts.failed}`);

  // Test 7: Filter by target node (LIKE query - not indexed, expected to be slower)
  startTime = Date.now();
  const nodeExecutions = await repo.findAll({ targetNode: 'node1' }, { page: 1, pageSize: 50 });
  duration = Date.now() - startTime;
  console.log(`✓ Filter by target node (LIKE query): ${duration}ms`);
  console.log(`  Found ${nodeExecutions.length} executions`);
  console.log(`  Note: This query uses LIKE on JSON field and cannot be efficiently indexed`);
}

async function runPerformanceTest(): Promise<void> {
  console.log('Database Performance Test\n');

  const db = await setupDatabase();
  const repo = new ExecutionRepository(db);

  // Generate test data
  await generateTestData(repo, 1000);

  // Run performance tests
  await testQueryPerformance(repo);

  // Close database
  db.close();

  console.log('\n=== Performance Test Complete ===');
  console.log('All queries completed successfully.');
  console.log('Indexed queries should complete in <10ms for 1000 records.');
  console.log('If queries are slower, verify indexes are created correctly.');
}

// Run the test
runPerformanceTest().catch((error) => {
  console.error('Performance test failed:', error);
  process.exit(1);
});
