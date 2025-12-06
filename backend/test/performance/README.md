# Performance Testing Suite

This directory contains comprehensive performance tests for the Pabawi system. The tests measure system performance with large datasets and identify potential bottlenecks.

## Test Files

### 1. `performance-test-suite.test.ts`

Comprehensive performance tests covering:

- Large inventory loading (100-1000+ nodes)
- Node linking across multiple sources
- Event query processing (1000-5000 events)
- Catalog parsing (100-1000 resources)
- Multi-source data aggregation
- Concurrent operations
- Memory usage monitoring

### 2. `api-performance.test.ts`

API endpoint performance tests:

- Inventory endpoint response times
- Node detail endpoint performance
- Events query performance with filters
- Catalog and resources endpoints
- Certificates endpoint
- Reports endpoint
- Error handling performance
- Concurrent request handling

### 3. `database-performance.test.ts`

Database operation performance tests:

- Insert performance (100-1000 records)
- Query performance with and without indexes
- Complex multi-filter queries
- Pagination efficiency
- Update and delete operations
- Concurrent read/write operations
- Index effectiveness verification

### 4. `bottleneck-analysis.ts`

Performance profiling and bottleneck identification tool:

- Profiles critical code paths
- Measures memory usage
- Identifies slow operations
- Generates optimization recommendations
- Exports metrics for analysis

## Running the Tests

### Run All Performance Tests

```bash
npm test -- backend/test/performance/
```

### Run Specific Test Suite

```bash
# Performance test suite
npm test -- backend/test/performance/performance-test-suite.test.ts

# API performance tests
npm test -- backend/test/performance/api-performance.test.ts

# Database performance tests
npm test -- backend/test/performance/database-performance.test.ts
```

### Run Bottleneck Analysis

```bash
npx tsx backend/test/performance/bottleneck-analysis.ts
```

### Run with Silent Mode (Recommended)

```bash
npm test -- backend/test/performance/ --silent
```

## Performance Thresholds

The tests use the following performance thresholds:

### Inventory Operations

- Load 100 nodes: < 500ms
- Load 500 nodes: < 2000ms
- Load 1000+ nodes: < 50MB memory increase

### Node Linking

- Link 100 nodes (multi-source): < 200ms
- Link 500 nodes (multi-source): < 1000ms

### Events Processing

- Process 1000 events: < 1000ms
- Process 5000 events: < 3000ms

### Catalog Operations

- Parse 100 resources: < 200ms
- Parse 500 resources: < 800ms
- Parse 1000 resources: < 1500ms

### API Endpoints

- Inventory endpoint: < 1000ms
- Node detail endpoint: < 500ms
- Events endpoint: < 2000ms
- Catalog endpoint: < 1500ms
- Certificates endpoint: < 800ms
- Reports endpoint: < 1000ms

### Database Operations

- Insert 100 records: < 1000ms
- Insert 1000 records: < 5000ms
- Query with index: < 50ms
- Query without index: < 500ms
- Complex query: < 200ms
- Bulk update (50 records): < 1000ms
- Bulk delete (50 records): < 500ms

## Interpreting Results

### Test Output

Each test logs its execution time and compares it to the threshold:

```
✓ Loaded 100 nodes in 245ms (threshold: 500ms)
✓ Linked 300 nodes (100 from each source) in 156ms (threshold: 200ms)
```

### Performance Summary

At the end of each test suite, a summary is printed with:

- All thresholds
- Recommendations for optimization
- Areas for improvement

### Bottleneck Analysis Report

The bottleneck analysis tool provides:

- Overall statistics (total operations, duration, memory)
- Top 10 slowest operations
- Top 10 highest memory operations
- Identified bottlenecks
- Specific recommendations

## Common Performance Issues

### 1. Slow Inventory Loading

**Symptoms:** Inventory takes > 2 seconds to load
**Possible Causes:**

- Too many nodes from multiple sources
- Inefficient node transformation
- Network latency to external services

**Solutions:**

- Implement pagination
- Add caching layer
- Optimize node transformation logic
- Use lazy loading for node details

### 2. Slow Node Linking

**Symptoms:** Node linking takes > 1 second
**Possible Causes:**

- Inefficient matching algorithm
- Too many nodes to compare
- Repeated comparisons

**Solutions:**

- Optimize matching algorithm (use hash maps)
- Cache linked node mappings
- Implement incremental linking

### 3. Slow Events Query

**Symptoms:** Events page hangs or takes > 3 seconds
**Possible Causes:**

- Too many events returned
- No pagination
- Inefficient filtering

**Solutions:**

- Implement pagination (limit to 100-500 events)
- Add server-side filtering
- Use lazy loading/infinite scroll
- Add timeout handling

### 4. Slow Catalog Parsing

**Symptoms:** Catalog takes > 2 seconds to display
**Possible Causes:**

- Large catalogs (1000+ resources)
- Inefficient parsing
- Complex resource relationships

**Solutions:**

- Implement virtual scrolling
- Parse resources incrementally
- Cache parsed catalogs
- Group resources by type

### 5. High Memory Usage

**Symptoms:** Memory increases by > 100MB
**Possible Causes:**

- Loading too much data at once
- Memory leaks
- Large objects in memory

**Solutions:**

- Implement pagination
- Use streaming for large datasets
- Clear unused data
- Profile memory usage

### 6. Slow Database Queries

**Symptoms:** Queries take > 100ms
**Possible Causes:**

- Missing indexes
- Complex queries
- Large result sets

**Solutions:**

- Add indexes for frequently queried fields
- Optimize query structure
- Use pagination
- Consider query caching

## Optimization Strategies

### 1. Caching

- Cache frequently accessed data (inventory, certificates)
- Use appropriate TTL for each data type
- Implement cache invalidation strategy
- Consider Redis for distributed caching

### 2. Pagination

- Limit result sets to 50-100 items per page
- Implement cursor-based pagination for large datasets
- Use lazy loading for infinite scroll
- Add "Load More" functionality

### 3. Lazy Loading

- Load node details on demand
- Defer loading of non-critical data
- Use skeleton loaders for better UX
- Implement progressive enhancement

### 4. Parallel Processing

- Fetch data from multiple sources in parallel
- Use Promise.all() for concurrent operations
- Implement connection pooling
- Consider worker threads for CPU-intensive tasks

### 5. Database Optimization

- Add indexes for frequently queried fields
- Use composite indexes for multi-field queries
- Optimize query structure
- Consider database sharding for very large datasets

### 6. Code Optimization

- Use efficient algorithms (O(n) vs O(n²))
- Avoid unnecessary data transformations
- Use Map/Set for lookups instead of arrays
- Minimize object creation in loops

## Monitoring in Production

### Metrics to Track

- API response times (p50, p95, p99)
- Database query times
- Memory usage
- CPU usage
- Cache hit rates
- Error rates

### Tools

- Application Performance Monitoring (APM)
- Database query profiling
- Memory profiling
- Load testing tools

### Alerts

- API response time > 2 seconds
- Database query time > 500ms
- Memory usage > 80%
- Error rate > 5%

## Continuous Performance Testing

### CI/CD Integration

Add performance tests to CI/CD pipeline:

```yaml
# .github/workflows/performance.yml
name: Performance Tests
on: [push, pull_request]
jobs:
  performance:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Run performance tests
        run: npm test -- backend/test/performance/ --silent
      - name: Check thresholds
        run: |
          # Fail if any test exceeds threshold
          # Parse test output and check results
```

### Regular Performance Audits

- Run performance tests weekly
- Compare results over time
- Identify performance regressions
- Update thresholds as needed

## Contributing

When adding new features:

1. Add performance tests for new functionality
2. Ensure tests pass with current thresholds
3. Update thresholds if necessary (with justification)
4. Document any performance considerations
5. Run bottleneck analysis to identify issues

## Resources

- [Node.js Performance Best Practices](https://nodejs.org/en/docs/guides/simple-profiling/)
- [Database Indexing Strategies](https://use-the-index-luke.com/)
- [Web Performance Optimization](https://web.dev/performance/)
- [Memory Profiling in Node.js](https://nodejs.org/en/docs/guides/diagnostics/memory/)
