# Frontend Library Documentation

## Error Handling and User Feedback

This directory contains utilities for error handling, API requests, and user feedback in the Pabawi frontend application.

### Toast Notifications (`toast.svelte.ts`)

A reactive toast notification system built with Svelte 5 runes.

#### Features

- Multiple toast types: success, error, info, warning
- Auto-dismiss with configurable duration
- Manual dismissal
- Expandable details
- Reactive state management

#### Usage

```typescript
import { showSuccess, showError, showInfo, showWarning } from '../lib/toast.svelte';

// Show success message
showSuccess('Operation completed successfully');

// Show error with details
showError('Operation failed', 'Detailed error message');

// Show info message
showInfo('Processing your request...');

// Show warning
showWarning('This action cannot be undone');
```

#### API

- `addToast(type, message, options?)` - Add a custom toast
- `removeToast(id)` - Remove a specific toast
- `showSuccess(message, details?)` - Show success toast
- `showError(message, details?)` - Show error toast
- `showInfo(message, details?)` - Show info toast
- `showWarning(message, details?)` - Show warning toast
- `clearAllToasts()` - Remove all toasts
- `getToasts()` - Get reactive toast array

### API Utilities (`api.ts`)

HTTP request utilities with automatic retry logic and error handling.

#### Features

- Automatic retry for transient failures
- Exponential backoff
- Configurable retry options
- Network error detection
- User-friendly error messages with actionable guidance

#### Usage

```typescript
import { get, post, put, del } from '../lib/api';

// GET request with retry
const data = await get('/api/inventory', {
  maxRetries: 2,
  retryDelay: 1000,
  onRetry: (attempt) => console.log(`Retry attempt ${attempt}`)
});

// POST request without retry
const result = await post('/api/nodes/node1/command', 
  { command: 'ls -la' },
  { maxRetries: 0 }
);
```

#### Retry Options

```typescript
interface RetryOptions {
  maxRetries?: number;           // Default: 3
  retryDelay?: number;           // Default: 1000ms
  retryableStatuses?: number[];  // Default: [408, 429, 500, 502, 503, 504]
  onRetry?: (attempt: number, error: Error) => void;
}
```

#### Error Guidance

The `getErrorGuidance()` function provides user-friendly error messages with actionable guidance:

```typescript
import { getErrorGuidance } from '../lib/api';

try {
  await someOperation();
} catch (error) {
  const { message, guidance } = getErrorGuidance(error);
  showError(message, guidance);
}
```

Recognized error patterns:

- Network errors
- Timeout errors
- Authentication errors
- Permission errors
- Not found errors
- Command whitelist errors
- Node unreachable errors
- Bolt execution errors

### Components

#### ToastContainer

Displays toast notifications in a fixed position at the top-right of the screen.

```svelte
<ToastContainer />
```

Add this component once in your root App component.

#### ErrorBoundary

Catches and handles errors gracefully at the component tree level.

```svelte
<ErrorBoundary onError={handleError}>
  <YourApp />
</ErrorBoundary>
```

Features:

- Catches JavaScript errors
- Catches unhandled promise rejections
- Custom fallback UI
- Error recovery
- Error logging callback

#### ErrorAlert

Enhanced error alert component with actionable guidance.

```svelte
<ErrorAlert 
  message="Operation failed"
  details="Detailed error information"
  guidance="Try checking your network connection"
  onRetry={retryOperation}
  onDismiss={dismissError}
/>
```

### Execution Stream (`executionStream.svelte.ts`)

A Svelte 5 reactive utility for subscribing to real-time execution output via Server-Sent Events (SSE).

#### Features

- Real-time streaming of command/task execution output
- Automatic reconnection on connection loss
- Configurable retry logic with exponential backoff
- Reactive state management with Svelte 5 runes
- Expert mode integration
- Proper cleanup on component unmount
- Event history tracking

#### Usage

```typescript
import { useExecutionStream } from '../lib/executionStream.svelte';
import { onMount, onDestroy } from 'svelte';

// Create execution stream
const stream = useExecutionStream(executionId, {
  maxReconnectAttempts: 3,
  reconnectDelay: 1000,
  autoReconnect: true,
  onStatusChange: (status) => console.log('Status:', status),
  onEvent: (event) => console.log('Event:', event),
  onComplete: (result) => console.log('Complete:', result),
  onError: (error) => console.error('Error:', error),
});

// Connect on mount
onMount(() => {
  stream.connect();
});

// Cleanup on unmount
onDestroy(() => {
  stream.disconnect();
});

// Access reactive state in template
{#if stream.isConnected}
  <div>Status: {stream.status}</div>
  <div>Command: {stream.command}</div>
  <pre>{stream.stdout}</pre>
  {#if stream.stderr}
    <pre class="error">{stream.stderr}</pre>
  {/if}
{/if}
```

#### Stream Options

```typescript
interface ExecutionStreamOptions {
  maxReconnectAttempts?: number;  // Default: 3
  reconnectDelay?: number;        // Default: 1000ms
  autoReconnect?: boolean;        // Default: true
  onStatusChange?: (status: ConnectionStatus) => void;
  onEvent?: (event: StreamingEvent) => void;
  onComplete?: (result: unknown) => void;
  onError?: (error: string) => void;
}
```

#### Reactive State

The stream provides reactive state that automatically updates:

- `status` - Connection status (disconnected, connecting, connected, reconnecting, error)
- `command` - Bolt command being executed
- `stdout` - Accumulated standard output
- `stderr` - Accumulated standard error
- `executionStatus` - Execution status (running, success, failed)
- `result` - Final execution result
- `error` - Error message if any
- `events` - Array of all received events
- `isConnected` - Boolean indicating if connected
- `isConnecting` - Boolean indicating if connecting/reconnecting
- `hasError` - Boolean indicating if there's an error

#### Control Methods

- `connect()` - Establish SSE connection
- `disconnect()` - Close SSE connection
- `reconnect()` - Disconnect and reconnect
- `clearOutput()` - Clear stdout, stderr, and events
- `reset()` - Reset all state to initial values

#### Event Types

The stream handles the following SSE event types:

- `start` - Connection established
- `command` - Bolt command being executed
- `stdout` - Standard output chunk
- `stderr` - Standard error chunk
- `status` - Execution status update
- `complete` - Execution completed successfully
- `error` - Execution failed with error

#### Expert Mode Integration

When expert mode is enabled, the stream automatically includes the `expertMode` query parameter in the SSE URL, allowing the backend to provide additional diagnostic information.

## Best Practices

### 1. Use Toast Notifications for User Feedback

```typescript
// Good: Inform users of success
showSuccess('Node facts gathered successfully');

// Good: Show errors with context
showError('Failed to execute command', error.message);

// Good: Provide progress updates
showInfo('Executing command...');
```

### 2. Configure Retry Logic Appropriately

```typescript
// Good: Retry read operations
const data = await get('/api/inventory', { maxRetries: 2 });

// Good: Don't retry write operations
const result = await post('/api/command', body, { maxRetries: 0 });
```

### 3. Provide Actionable Error Messages

```typescript
// Good: Use error guidance
const { message, guidance } = getErrorGuidance(error);
showError(message, guidance);

// Bad: Generic error message
showError('An error occurred');
```

### 4. Handle Errors at Appropriate Levels

```typescript
// Component-level: Show user feedback
try {
  await fetchData();
} catch (error) {
  showError('Failed to load data');
}

// App-level: Use ErrorBoundary for unexpected errors
<ErrorBoundary onError={logToService}>
  <App />
</ErrorBoundary>
```

### 5. Clean Up Resources

```typescript
// Good: Clear toasts when navigating away
onDestroy(() => {
  clearAllToasts();
});

// Good: Disconnect streams on unmount
onDestroy(() => {
  stream.disconnect();
});
```

### 6. Use Execution Streams for Real-Time Output

```typescript
// Good: Stream output in expert mode
const stream = useExecutionStream(executionId, {
  onComplete: (result) => {
    showSuccess('Execution completed');
  },
  onError: (error) => {
    showError('Execution failed', error);
  },
});

// Good: Connect when needed
if (expertMode.enabled) {
  stream.connect();
}

// Good: Provide user feedback on connection status
{#if stream.isConnecting}
  <LoadingSpinner message="Connecting to stream..." />
{/if}
```

## Testing

### Testing Toast Notifications

```typescript
import { addToast, getToasts, removeToast } from '../lib/toast.svelte';

test('should add and remove toasts', () => {
  const id = addToast('success', 'Test message');
  expect(getToasts()).toHaveLength(1);
  
  removeToast(id);
  expect(getToasts()).toHaveLength(0);
});
```

### Testing API Utilities

```typescript
import { fetchWithRetry } from '../lib/api';

test('should retry on network error', async () => {
  let attempts = 0;
  
  await fetchWithRetry('/api/test', undefined, {
    maxRetries: 2,
    onRetry: () => attempts++
  });
  
  expect(attempts).toBeGreaterThan(0);
});
```

## Migration Guide

### From Direct Fetch to API Utilities

Before:

```typescript
const response = await fetch('/api/inventory');
const data = await response.json();
```

After:

```typescript
const data = await get('/api/inventory', { maxRetries: 2 });
```

### Adding Toast Notifications

1. Import toast functions:

```typescript
import { showSuccess, showError } from '../lib/toast.svelte';
```

2. Replace console.log with toasts:

```typescript
// Before
console.log('Operation successful');

// After
showSuccess('Operation successful');
```

3. Add ToastContainer to App.svelte:

```svelte
<ToastContainer />
```

### Adding Error Boundary

Wrap your app in ErrorBoundary:

```svelte
<ErrorBoundary onError={handleError}>
  <YourApp />
</ErrorBoundary>
```
