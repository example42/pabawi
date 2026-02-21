# Unified Frontend + Backend Logging with Expert Mode Integration

## Overview

This document describes the implementation of a unified logging system that spans both frontend and backend, with deep integration into expert mode for comprehensive debugging capabilities.

## Architecture

### Frontend Logger (`frontend/src/lib/logger.svelte.ts`)

**Features:**

- Structured logging with levels: debug, info, warn, error
- Automatic data obfuscation for sensitive fields (passwords, tokens, secrets, etc.)
- Circular buffer (100 entries) for recent logs
- Throttled backend sync (max 1 request per second)
- Correlation ID support for request tracking
- Auto-enabled when expert mode is toggled on
- Persists configuration in localStorage

**Sensitive Data Patterns:**

- `/password/i`
- `/token/i`
- `/secret/i`
- `/api[_-]?key/i`
- `/auth/i`
- `/credential/i`
- `/private[_-]?key/i`
- `/session/i`
- `/cookie/i`

All matching fields are replaced with `***` in logs.

### Backend Debug Endpoint (`backend/src/routes/debug.ts`)

**Endpoints:**

- `POST /api/debug/frontend-logs` - Receive batch of frontend logs
- `GET /api/debug/frontend-logs/:correlationId` - Get logs for correlation ID
- `GET /api/debug/frontend-logs` - List all correlation IDs
- `DELETE /api/debug/frontend-logs/:correlationId` - Clear specific logs
- `DELETE /api/debug/frontend-logs` - Clear all logs

**Storage:**

- In-memory Map<correlationId, LogEntry[]>
- Max 100 correlation IDs
- Max age: 5 minutes
- Automatic cleanup every minute

### API Integration (`frontend/src/lib/api.ts`)

**Enhanced with:**

- Correlation ID generation for each request
- Automatic logging of request initiation, responses, errors, retries
- Correlation ID sent as `X-Correlation-ID` header
- Expert mode header sent as `X-Expert-Mode: true`
- Performance timing captured (DNS, connect, TTFB, download)

### Expert Mode Service Enhancement (`backend/src/services/ExpertModeService.ts`)

**New Features:**

- `addFrontendLogs()` method to attach frontend logs to debug info
- `FrontendLogEntry` interface added to `DebugInfo`
- Frontend logs automatically included when correlation ID matches

### Middleware Enhancement (`backend/src/middleware/expertMode.ts`)

**New Features:**

- Extracts `X-Correlation-ID` header
- Stores in `req.correlationId` for route handlers
- Available alongside `req.expertMode` flag

## Data Flow

### 1. User Action in Frontend

```
User clicks button
  ↓
logger.info('Component', 'operation', 'message', metadata)
  ↓
Log stored in circular buffer
  ↓
If expert mode enabled → Add to pending logs queue
```

### 2. API Request

```
fetchWithRetry() called
  ↓
Generate correlation ID: frontend_timestamp_random
  ↓
logger.setCorrelationId(id)
  ↓
Add headers: X-Expert-Mode, X-Correlation-ID
  ↓
Log request initiation
  ↓
Send request
```

### 3. Backend Processing

```
Request received
  ↓
expertModeMiddleware extracts headers
  ↓
req.expertMode = true
req.correlationId = 'frontend_...'
  ↓
Route handler processes request
  ↓
Backend logger logs operations
  ↓
If expert mode: Create debug info
  ↓
If correlation ID: Fetch frontend logs
  ↓
Merge frontend + backend logs in response
```

### 4. Frontend Receives Response

```
Response received
  ↓
logger.info('API', 'fetch', 'Request completed')
  ↓
logger.clearCorrelationId()
  ↓
If _debug present: Display in ExpertModeDebugPanel
```

### 5. Frontend Log Sync (Throttled)

```
Pending logs accumulate
  ↓
After 1 second (throttle)
  ↓
POST /api/debug/frontend-logs
  ↓
Backend stores by correlation ID
  ↓
Backend also logs to unified logger
```

## Timeline View Structure

The enhanced `ExpertModeDebugPanel` will display a unified timeline:

```
Timeline:
├─ [Frontend] 10:30:45.123 - User clicked "Run Task" button
│  Component: TaskRunInterface
│  Metadata: { taskName: "service::restart", targets: ["web01"] }
│
├─ [Frontend] 10:30:45.138 - Initiating POST request
│  Component: API
│  URL: /api/bolt/tasks/run
│  Correlation ID: frontend_abc123
│
├─ [Backend] 10:30:45.156 - Received request
│  Component: TasksRouter
│  Request ID: req_xyz789
│  Correlation ID: frontend_abc123
│
├─ [Backend] 10:30:45.160 - Validating task parameters
│  Component: BoltService
│  Integration: bolt
│
├─ [Backend] 10:30:45.165 - Executing Bolt command
│  Component: BoltService
│  Command: bolt task run service::restart --targets web01
│
├─ [Backend] 10:30:46.421 - Command completed successfully
│  Component: BoltService
│  Duration: 1256ms
│
├─ [Frontend] 10:30:46.466 - Response received
│  Component: API
│  Status: 200
│  Duration: 1328ms
│
└─ [Frontend] 10:30:46.482 - Rendering task results
   Component: TaskRunInterface
   Duration: 16ms
```

## Configuration

### Frontend Logger Config (localStorage: `pabawi_logger_config`)

```typescript
{
  logLevel: 'info',           // 'debug' | 'info' | 'warn' | 'error'
  sendToBackend: false,       // Auto-enabled with expert mode
  bufferSize: 100,            // Max logs in memory
  includePerformance: true,   // Capture timing data
  throttleMs: 1000           // Max 1 backend sync per second
}
```

### Expert Mode Config (localStorage: `pabawi_expert_mode`)

```typescript
{
  enabled: false  // Toggle via UI
}
```

## Security Considerations

### Data Obfuscation

All sensitive fields are automatically obfuscated:

```typescript
// Before obfuscation
{ // pragma: allowlist secret
  username: "admin",
  password: "secret123", // pragma: allowlist secret
  apiKey: "sk_live_abc123", // pragma: allowlist secret
  email: "user@example.com"
}

// After obfuscation
{
  username: "admin",
  password: "***",
  apiKey: "***",
  email: "user@example.com"
}
```

### Privacy

- Frontend logs only sent when expert mode explicitly enabled
- Logs stored in-memory only (not persisted to database)
- Automatic cleanup after 5 minutes
- Max 100 correlation IDs stored

### Performance

- Throttled backend sync (1 request/second max)
- Circular buffer prevents memory growth
- Logs flushed on page unload
- No impact when expert mode disabled

## Usage Examples

### Frontend Component Logging

```typescript
import { logger } from '../lib/logger.svelte';

function handleTaskRun() {
  logger.info('TaskRunInterface', 'runTask', 'Starting task execution', {
    taskName: task.name,
    targets: selectedNodes,
  });
  
  try {
    const result = await api.post('/api/bolt/tasks/run', payload);
    
    logger.info('TaskRunInterface', 'runTask', 'Task completed successfully', {
      executionId: result.executionId,
      duration: result.duration,
    });
  } catch (error) {
    logger.error('TaskRunInterface', 'runTask', 'Task execution failed', error, {
      taskName: task.name,
    });
  }
}
```

### Backend Route with Frontend Logs

```typescript
import { getFrontendLogs } from "../routes/debug";

router.post('/api/bolt/tasks/run', async (req, res) => {
  const startTime = Date.now();
  
  logger.info('Processing task run request', {
    component: 'TasksRouter',
    operation: 'runTask',
  });
  
  // ... execute task ...
  
  const duration = Date.now() - startTime;
  
  if (req.expertMode) {
    const debugInfo = expertModeService.createDebugInfo(
      'POST /api/bolt/tasks/run',
      req.id,
      duration
    );
    
    // Add frontend logs if available
    if (req.correlationId) {
      const frontendLogs = getFrontendLogs(req.correlationId);
      expertModeService.addFrontendLogs(debugInfo, frontendLogs);
    }
    
    res.json(expertModeService.attachDebugInfo(result, debugInfo));
  } else {
    res.json(result);
  }
});
```

## Benefits

### For Users

- One-click debug info copy for support tickets
- Visual timeline of what happened
- Clear error messages with context

### For Developers

- Full request lifecycle visibility
- Easy correlation between frontend actions and backend processing
- Performance bottleneck identification
- Unified logging pattern across stack

### For Support

- Complete context for bug reports
- Reproducible issues with full state
- No need for screen sharing to debug

## Next Steps

1. ✅ Frontend logger service created
2. ✅ Backend debug endpoint created
3. ✅ API integration with correlation IDs
4. ✅ Expert mode service enhanced
5. ✅ Middleware updated
6. ⏳ Update ExpertModeDebugPanel with timeline view
7. ⏳ Test end-to-end flow
8. ⏳ Update documentation

## Testing Checklist

- [ ] Frontend logger obfuscates sensitive data
- [ ] Logs throttled to 1 request/second
- [ ] Correlation IDs properly generated and tracked
- [ ] Backend receives and stores frontend logs
- [ ] Expert mode responses include frontend logs
- [ ] Timeline view displays merged logs chronologically
- [ ] Cleanup removes old logs after 5 minutes
- [ ] Performance impact minimal when expert mode disabled
- [ ] Copy functionality includes full context
