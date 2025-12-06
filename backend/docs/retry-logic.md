# Retry Logic Implementation

## Overview

The application implements comprehensive retry logic with exponential backoff for handling transient errors across all integrations (PuppetDB, Puppetserver, Bolt).

## Features

### 1. Exponential Backoff

Retry delays increase exponentially with each attempt:

- Initial delay: configurable (default 1000ms)
- Backoff multiplier: 2x
- Maximum delay: 30000ms (30 seconds)
- Jitter: Random variation added to prevent thundering herd

### 2. Configurable Per Integration

Each integration can configure retry behavior independently:

```typescript
// In backend/.env or config
PUPPETDB_RETRY_ATTEMPTS=3
PUPPETDB_RETRY_DELAY=1000

PUPPETSERVER_RETRY_ATTEMPTS=3
PUPPETSERVER_RETRY_DELAY=1000
```

### 3. Comprehensive Logging

All retry attempts are logged with:

- Attempt number (e.g., "Retry attempt 2/3")
- Delay duration
- Error category (connection, timeout, authentication, etc.)
- Error message

Example log output:

```
[Puppetserver] Retry attempt 1/3 after 1000ms due to connection error: ECONNREFUSED
[Puppetserver] Retry attempt 2/3 after 2000ms due to connection error: ECONNREFUSED
```

### 4. UI Retry Notifications

The frontend displays retry status to users via toast notifications:

- Warning toast shown for each retry attempt
- Shows current attempt number and total attempts
- Shows retry delay
- Can be disabled per request with `showRetryNotifications: false`

## Backend Implementation

### Core Retry Logic

Located in `backend/src/integrations/puppetdb/RetryLogic.ts`:

```typescript
import { withRetry, createPuppetserverRetryConfig } from '../puppetdb/RetryLogic';

// Create retry config
const retryConfig = createPuppetserverRetryConfig(3, 1000);

// Wrap operation with retry
const result = await withRetry(async () => {
  return await someOperation();
}, retryConfig);
```

### Retryable Errors

The following errors trigger automatic retry:

- Network errors (ECONNREFUSED, ECONNRESET, ETIMEDOUT)
- HTTP 5xx errors (500, 502, 503, 504)
- HTTP 429 (rate limit)
- Timeout errors

### Non-Retryable Errors

These errors fail immediately without retry:

- HTTP 4xx errors (except 408, 429)
- Authentication errors (401, 403)
- Validation errors (400)
- Not found errors (404)

## Frontend Implementation

### API Client with Retry

Located in `frontend/src/lib/api.ts`:

```typescript
import { get, post } from './api';

// GET request with default retry
const data = await get('/api/endpoint');

// POST request with custom retry options
const result = await post('/api/endpoint', body, {
  maxRetries: 5,
  retryDelay: 2000,
  showRetryNotifications: true
});

// Disable retry notifications for background requests
const silent = await get('/api/status', {
  showRetryNotifications: false
});
```

### Retry Options

```typescript
interface RetryOptions {
  maxRetries?: number;              // Default: 3
  retryDelay?: number;              // Default: 1000ms
  retryableStatuses?: number[];     // Default: [408, 429, 500, 502, 503, 504]
  onRetry?: (attempt, error) => void;
  timeout?: number;
  signal?: AbortSignal;
  showRetryNotifications?: boolean; // Default: true
}
```

## Configuration

### Backend Configuration

In `backend/.env`:

```bash
# PuppetDB retry configuration
PUPPETDB_RETRY_ATTEMPTS=3
PUPPETDB_RETRY_DELAY=1000

# Puppetserver retry configuration
PUPPETSERVER_RETRY_ATTEMPTS=3
PUPPETSERVER_RETRY_DELAY=1000
```

### Integration-Specific Configuration

Each integration service reads retry configuration from its config:

```typescript
// PuppetserverService
this.client = new PuppetserverClient({
  serverUrl: config.serverUrl,
  retryAttempts: config.retryAttempts ?? 3,
  retryDelay: config.retryDelay ?? 1000,
});
```

## Circuit Breaker Integration

Retry logic works in conjunction with circuit breaker pattern:

1. **Closed State**: Requests execute normally with retry
2. **Open State**: Requests fail immediately without retry
3. **Half-Open State**: Limited requests allowed to test recovery

This prevents overwhelming a failing service with retry attempts.

## Best Practices

### When to Use Retry

✅ **Use retry for:**

- Network connectivity issues
- Temporary service unavailability
- Rate limiting
- Timeout errors
- Server errors (5xx)

❌ **Don't retry for:**

- Authentication failures
- Validation errors
- Not found errors
- Permission errors
- Client errors (4xx except 408, 429)

### Configuring Retry Attempts

- **Low latency operations**: 2-3 attempts
- **High latency operations**: 3-5 attempts
- **Background jobs**: 5-10 attempts
- **Critical operations**: Consider exponential backoff with longer delays

### UI Considerations

- Show retry notifications for user-initiated actions
- Hide retry notifications for background polling
- Provide cancel option for long-running retries
- Show progress indicator during retries

## Testing

### Unit Tests

Test retry logic with mock failures:

```typescript
it('should retry on network error', async () => {
  let attempts = 0;
  const operation = async () => {
    attempts++;
    if (attempts < 3) {
      throw new Error('ECONNREFUSED');
    }
    return 'success';
  };

  const result = await withRetry(operation, {
    maxAttempts: 3,
    initialDelay: 100,
  });

  expect(result).toBe('success');
  expect(attempts).toBe(3);
});
```

### Integration Tests

Test retry behavior with real services:

```typescript
it('should retry and succeed on transient failure', async () => {
  // Simulate transient failure
  mockServer.failOnce();
  
  const result = await client.getCertificates();
  
  expect(result).toBeDefined();
  expect(mockServer.requestCount).toBe(2); // Initial + 1 retry
});
```

## Monitoring

### Metrics to Track

- Retry attempt count per integration
- Retry success rate
- Average retry delay
- Operations requiring retry
- Circuit breaker state changes

### Logging

All retry attempts are logged with structured data:

```json
{
  "level": "warn",
  "integration": "puppetserver",
  "attempt": 2,
  "maxAttempts": 3,
  "delay": 2000,
  "errorCategory": "connection",
  "errorMessage": "ECONNREFUSED",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

## Troubleshooting

### High Retry Rates

If you see many retry attempts:

1. Check network connectivity
2. Verify service health
3. Review timeout configuration
4. Check for rate limiting
5. Consider increasing circuit breaker threshold

### Retry Exhaustion

If operations fail after all retries:

1. Check service availability
2. Verify authentication credentials
3. Review firewall/network rules
4. Check service logs for errors
5. Increase retry attempts or delays

### Performance Impact

If retries impact performance:

1. Reduce retry attempts
2. Decrease retry delay
3. Implement circuit breaker
4. Add request timeout
5. Consider async/background processing

## Future Enhancements

Potential improvements to retry logic:

1. **Adaptive retry delays**: Adjust based on error type
2. **Retry budgets**: Limit total retry time across requests
3. **Priority queues**: Retry critical operations first
4. **Distributed retry**: Coordinate retries across instances
5. **Retry metrics dashboard**: Visualize retry patterns
6. **Smart retry**: Learn from past failures to optimize retry strategy
