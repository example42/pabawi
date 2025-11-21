# Realtime Streaming Implementation Summary

## Overview

Implemented Server-Sent Events (SSE) based realtime streaming of Bolt command/task output when expert mode is
active. This allows users to see stdout/stderr output as it happens during long-running operations.

## Backend Changes

### 1. New Services

#### StreamingExecutionManager (`backend/src/services/StreamingExecutionManager.ts`)

- Manages SSE connections for execution streaming
- Maintains registry of active subscribers per execution ID
- Provides methods to emit events: `stdout`, `stderr`, `status`, `command`, `complete`, `error`
- Implements heartbeat mechanism to keep connections alive
- Handles connection cleanup on client disconnect
- Thread-safe subscriber management

### 2. BoltService Modifications (`backend/src/bolt/BoltService.ts`)

#### New StreamingCallback Interface

```typescript
export interface StreamingCallback {
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
  onCommand?: (command: string) => void;
}
```

#### Updated Methods

- `executeCommand()` - Now accepts optional `streamingCallback` parameter
- `executeCommandWithJsonOutput()` - Passes through streaming callback
- `runCommand()` - Accepts streaming callback, emits command string and output chunks
- `runTask()` - Accepts streaming callback for task execution
- `runPuppetAgent()` - Accepts streaming callback for Puppet runs
- `installPackage()` - Accepts streaming callback for package installations

**Key Feature**: Stdout/stderr chunks are emitted in real-time as they arrive from the child process, while still
accumulating the full output for the final result.

### 3. New Streaming Route (`backend/src/routes/streaming.ts`)

#### Endpoints

- `GET /api/executions/:id/stream` - Subscribe to SSE stream for an execution
- `GET /api/streaming/stats` - Get streaming statistics (active executions count)

**Features**:

- Validates execution exists before subscribing
- Sends immediate completion event if execution already finished
- Handles client disconnection gracefully

### 4. Updated Execution Routes

All execution routes now support streaming when expert mode is enabled:

#### Commands Route (`backend/src/routes/commands.ts`)

- Accepts `expertMode` in request body
- Creates streaming callback when expert mode is enabled
- Emits command, stdout, stderr, and completion/error events

#### Tasks Route (`backend/src/routes/tasks.ts`)

- Accepts `expertMode` in request body
- Streams task execution output in real-time
- Emits completion/error events

#### Puppet Route (`backend/src/routes/puppet.ts`)

- Accepts `expertMode` in request body
- Streams Puppet run output
- Emits all streaming events

#### Packages Route (`backend/src/routes/packages.ts`)

- Accepts `expertMode` in request body
- Streams package installation output
- Emits all streaming events

### 5. Server Integration (`backend/src/server.ts`)

- Instantiates `StreamingExecutionManager` on startup
- Passes streaming manager to all execution routes
- Registers streaming routes
- Cleans up streaming connections on graceful shutdown

## Event Types

The streaming system emits the following SSE event types:

1. **start** - Connection established, streaming begins
2. **command** - The full Bolt CLI command being executed
3. **stdout** - Stdout output chunk from Bolt process
4. **stderr** - Stderr output chunk from Bolt process
5. **status** - Status update (running, success, failed)
6. **complete** - Execution completed successfully with full results
7. **error** - Execution failed with error details

## Event Format

All events follow this structure:

```typescript
{
  type: StreamingEventType;
  executionId: string;
  timestamp: string;
  data?: unknown;
}
```

## Frontend Integration (To Be Implemented)

### Required Components

1. **useExecutionStream Hook** - Svelte 5 utility for SSE connection management
2. **RealtimeOutputViewer Component** - Display streaming output with:
   - Bolt command display at top (expert mode)
   - Separate stdout/stderr sections
   - Auto-scrolling with pause toggle
   - Syntax highlighting
   - Copy-to-clipboard
   - Elapsed time display
   - Status indicators

3. **Integration Points**:
   - Node Detail page (command, task, Puppet, package execution)
   - Executions page (execution history detail view)

### API Client Updates

The frontend API client needs to:

- Include `expertMode: true` in request bodies when expert mode is enabled
- Create EventSource connections to `/api/executions/:id/stream`
- Parse SSE events and update reactive state
- Handle reconnection on connection loss
- Clean up connections on component unmount

## Benefits

1. **Immediate Feedback** - Users see output as it happens, not after completion
2. **Long-Running Operations** - Better UX for operations that take minutes
3. **Debugging** - Real-time stderr helps diagnose issues faster
4. **Command Visibility** - Full Bolt command shown in expert mode
5. **Scalable** - SSE is lightweight and efficient for one-way streaming

## Performance Considerations

1. **Buffering** - Consider implementing 100ms buffering to reduce event frequency
2. **Output Limits** - May want to limit maximum output size (e.g., 10MB per execution)
3. **Connection Limits** - Monitor active connection count
4. **Heartbeat** - 30-second heartbeat keeps connections alive through proxies

## Security Considerations

1. **Authentication** - SSE endpoints should validate user permissions (future enhancement)
2. **Execution Validation** - Verifies execution exists before streaming
3. **Expert Mode Only** - Streaming only enabled when expert mode is active
4. **Connection Cleanup** - Proper cleanup prevents resource leaks

## Testing Recommendations

1. **Unit Tests** - Test StreamingExecutionManager event emission
2. **Integration Tests** - Test SSE endpoint with mock executions
3. **E2E Tests** - Test full streaming flow from frontend to backend
4. **Load Tests** - Test with multiple concurrent streaming connections
5. **Network Tests** - Test reconnection on connection loss

## Next Steps

1. Implement frontend SSE client utility
2. Create RealtimeOutputViewer component
3. Integrate streaming in Node Detail page
4. Add streaming to Executions page
5. Implement output buffering optimization
6. Add configuration for streaming limits
7. Write comprehensive tests
8. Update user documentation

## Configuration

No new environment variables required. Streaming is automatically enabled when:

- Expert mode is active in the request
- StreamingExecutionManager is initialized (always on)

## Backward Compatibility

- All changes are backward compatible
- Streaming is optional (only when expert mode enabled)
- Non-streaming execution flow unchanged
- Existing API responses unchanged
