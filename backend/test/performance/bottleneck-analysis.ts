/**
 * Performance Bottleneck Analysis Tool
 *
 * Identifies performance bottlenecks in the system by:
 * - Profiling critical code paths
 * - Measuring memory usage
 * - Analyzing query patterns
 * - Identifying slow operations
 *
 * Run with: npx tsx backend/test/performance/bottleneck-analysis.ts
 */

import { performance } from 'perf_hooks';
import { IntegrationManager } from '../../src/integrations/IntegrationManager';
import { NodeLinkingService } from '../../src/integrations/NodeLinkingService';
import { LoggerService } from '../../src/services/LoggerService';
import type { Node } from '../../src/integrations/types';

interface PerformanceMetric {
  operation: string;
  duration: number;
  memoryBefore: number;
  memoryAfter: number;
  memoryDelta: number;
  timestamp: string;
}

class PerformanceProfiler {
  private metrics: PerformanceMetric[] = [];

  async profile<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    const memBefore = process.memoryUsage().heapUsed;
    const start = performance.now();

    const result = await fn();

    const end = performance.now();
    const memAfter = process.memoryUsage().heapUsed;

    this.metrics.push({
      operation,
      duration: end - start,
      memoryBefore: memBefore / 1024 / 1024, // MB
      memoryAfter: memAfter / 1024 / 1024, // MB
      memoryDelta: (memAfter - memBefore) / 1024 / 1024, // MB
      timestamp: new Date().toISOString(),
    });

    return result;
  }

  getMetrics(): PerformanceMetric[] {
    return this.metrics;
  }

  getSlowestOperations(count: number = 10): PerformanceMetric[] {
    return [...this.metrics].sort((a, b) => b.duration - a.duration).slice(0, count);
  }

  getHighestMemoryOperations(count: number = 10): PerformanceMetric[] {
    return [...this.metrics].sort((a, b) => b.memoryDelta - a.memoryDelta).slice(0, count);
  }

  printReport(): void {
    console.log('\n=== Performance Bottleneck Analysis Report ===\n');

    // Overall statistics
    const totalDuration = this.metrics.reduce((sum, m) => sum + m.duration, 0);
    const avgDuration = totalDuration / this.metrics.length;
    const totalMemory = this.metrics.reduce((sum, m) => sum + m.memoryDelta, 0);

    console.log('Overall Statistics:');
    console.log(`  Total operations: ${this.metrics.length}`);
    console.log(`  Total duration: ${totalDuration.toFixed(2)}ms`);
    console.log(`  Average duration: ${avgDuration.toFixed(2)}ms`);
    console.log(`  Total memory delta: ${totalMemory.toFixed(2)}MB`);

    // Slowest operations
    console.log('\nTop 10 Slowest Operations:');
    const slowest = this.getSlowestOperations(10);
    slowest.forEach((metric, index) => {
      console.log(
        `  ${index + 1}. ${metric.operation}: ${metric.duration.toFixed(2)}ms (mem: ${metric.memoryDelta.toFixed(2)}MB)`
      );
    });

    // Highest memory operations
    console.log('\nTop 10 Highest Memory Operations:');
    const highestMem = this.getHighestMemoryOperations(10);
    highestMem.forEach((metric, index) => {
      console.log(
        `  ${index + 1}. ${metric.operation}: ${metric.memoryDelta.toFixed(2)}MB (time: ${metric.duration.toFixed(2)}ms)`
      );
    });

    // Bottleneck identification
    console.log('\nBottleneck Analysis:');
    const bottlenecks = this.identifyBottlenecks();
    if (bottlenecks.length === 0) {
      console.log('  ✓ No significant bottlenecks detected');
    } else {
      bottlenecks.forEach((bottleneck) => {
        console.log(`  ⚠ ${bottleneck}`);
      });
    }

    // Recommendations
    console.log('\nRecommendations:');
    const recommendations = this.generateRecommendations();
    recommendations.forEach((rec) => {
      console.log(`  • ${rec}`);
    });

    console.log('\n===========================================\n');
  }

  private identifyBottlenecks(): string[] {
    const bottlenecks: string[] = [];

    // Check for operations taking > 1 second
    const slowOps = this.metrics.filter((m) => m.duration > 1000);
    if (slowOps.length > 0) {
      bottlenecks.push(
        `${slowOps.length} operations took longer than 1 second: ${slowOps.map((o) => o.operation).join(', ')}`
      );
    }

    // Check for operations using > 50MB memory
    const memoryIntensiveOps = this.metrics.filter((m) => m.memoryDelta > 50);
    if (memoryIntensiveOps.length > 0) {
      bottlenecks.push(
        `${memoryIntensiveOps.length} operations used more than 50MB: ${memoryIntensiveOps.map((o) => o.operation).join(', ')}`
      );
    }

    // Check for repeated slow operations
    const operationCounts = new Map<string, number>();
    this.metrics.forEach((m) => {
      operationCounts.set(m.operation, (operationCounts.get(m.operation) || 0) + 1);
    });

    operationCounts.forEach((count, operation) => {
      if (count > 10) {
        const avgDuration =
          this.metrics.filter((m) => m.operation === operation).reduce((sum, m) => sum + m.duration, 0) / count;
        if (avgDuration > 100) {
          bottlenecks.push(`Operation "${operation}" called ${count} times with avg duration ${avgDuration.toFixed(2)}ms`);
        }
      }
    });

    return bottlenecks;
  }

  private generateRecommendations(): string[] {
    const recommendations: string[] = [];

    // Check for caching opportunities
    const operationCounts = new Map<string, number>();
    this.metrics.forEach((m) => {
      operationCounts.set(m.operation, (operationCounts.get(m.operation) || 0) + 1);
    });

    operationCounts.forEach((count, operation) => {
      if (count > 5 && operation.includes('fetch') || operation.includes('load')) {
        recommendations.push(`Consider caching results for "${operation}" (called ${count} times)`);
      }
    });

    // Check for batch processing opportunities
    const slowOps = this.getSlowestOperations(5);
    slowOps.forEach((metric) => {
      if (metric.operation.includes('single') || metric.operation.includes('one')) {
        recommendations.push(`Consider batch processing for "${metric.operation}"`);
      }
    });

    // Check for memory optimization opportunities
    const highMemOps = this.getHighestMemoryOperations(5);
    highMemOps.forEach((metric) => {
      if (metric.memoryDelta > 20) {
        recommendations.push(`Optimize memory usage for "${metric.operation}" (uses ${metric.memoryDelta.toFixed(2)}MB)`);
      }
    });

    // Check for pagination opportunities
    if (this.metrics.some((m) => m.operation.includes('all') || m.operation.includes('list'))) {
      recommendations.push('Implement pagination for list operations to reduce memory usage');
    }

    // Check for parallel processing opportunities
    const sequentialOps = this.metrics.filter((m) => m.operation.includes('sequential'));
    if (sequentialOps.length > 0) {
      recommendations.push('Consider parallel processing for sequential operations');
    }

    if (recommendations.length === 0) {
      recommendations.push('System is performing well, no immediate optimizations needed');
    }

    return recommendations;
  }
}

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

async function runBottleneckAnalysis(): Promise<void> {
  console.log('Starting Performance Bottleneck Analysis...\n');

  const profiler = new PerformanceProfiler();
  const integrationManager = new IntegrationManager({ logger: new LoggerService('error') });
  const nodeLinkingService = new NodeLinkingService(integrationManager);

  // Test 1: Node generation
  await profiler.profile('Generate 100 nodes', async () => {
    return generateMockNodes(100, 'test');
  });

  await profiler.profile('Generate 500 nodes', async () => {
    return generateMockNodes(500, 'test');
  });

  await profiler.profile('Generate 1000 nodes', async () => {
    return generateMockNodes(1000, 'test');
  });

  // Test 2: Node linking
  const nodes100 = generateMockNodes(100, 'bolt');
  await profiler.profile('Link 100 nodes (single source)', async () => {
    return nodeLinkingService.linkNodes(nodes100);
  });

  const multiSource100 = [
    ...generateMockNodes(100, 'bolt'),
    ...generateMockNodes(100, 'puppetdb'),
  ];
  await profiler.profile('Link 200 nodes (two sources)', async () => {
    return nodeLinkingService.linkNodes(multiSource100);
  });

  const multiSource500 = [
    ...generateMockNodes(500, 'bolt'),
    ...generateMockNodes(500, 'puppetdb'),
    ...generateMockNodes(500, 'puppetserver'),
  ];
  await profiler.profile('Link 1500 nodes (three sources)', async () => {
    return nodeLinkingService.linkNodes(multiSource500);
  });

  // Test 3: Sequential vs parallel operations
  await profiler.profile('Sequential node processing (100 nodes)', async () => {
    const nodes = generateMockNodes(100, 'test');
    const results = [];
    for (const node of nodes) {
      results.push({ ...node, processed: true });
    }
    return results;
  });

  await profiler.profile('Parallel node processing (100 nodes)', async () => {
    const nodes = generateMockNodes(100, 'test');
    return Promise.all(
      nodes.map(async (node) => ({ ...node, processed: true }))
    );
  });

  // Test 4: Data filtering
  const largeDataset = generateMockNodes(1000, 'test');
  await profiler.profile('Filter 1000 nodes by name', async () => {
    return largeDataset.filter((n) => n.name.includes('node1'));
  });

  await profiler.profile('Filter 1000 nodes by metadata', async () => {
    return largeDataset.filter((n) => n.metadata?.os === 'Linux');
  });

  // Test 5: Data transformation
  await profiler.profile('Transform 1000 nodes', async () => {
    return largeDataset.map((n) => ({
      id: n.id,
      name: n.name,
      displayName: n.name.toUpperCase(),
      source: n.source,
    }));
  });

  // Test 6: Repeated operations (simulating cache misses)
  for (let i = 0; i < 10; i++) {
    await profiler.profile(`Repeated fetch operation ${i + 1}`, async () => {
      return generateMockNodes(50, 'test');
    });
  }

  // Test 7: Memory-intensive operations
  await profiler.profile('Create large object array', async () => {
    return Array.from({ length: 10000 }, (_, i) => ({
      id: i,
      data: `data-${i}`,
      metadata: {
        timestamp: new Date().toISOString(),
        index: i,
        tags: [`tag-${i % 10}`, `category-${i % 5}`],
      },
    }));
  });

  // Test 8: Nested data processing
  await profiler.profile('Process nested data structures', async () => {
    const nodes = generateMockNodes(100, 'test');
    return nodes.map((node) => ({
      ...node,
      children: generateMockNodes(10, `${node.source}-child`),
    }));
  });

  // Print the report
  profiler.printReport();

  // Export metrics to JSON for further analysis
  const metrics = profiler.getMetrics();
  console.log(`\nExported ${metrics.length} metrics for analysis`);
  console.log('Metrics can be imported into analysis tools for visualization\n');
}

// Run the analysis
runBottleneckAnalysis().catch((error) => {
  console.error('Bottleneck analysis failed:', error);
  process.exit(1);
});
