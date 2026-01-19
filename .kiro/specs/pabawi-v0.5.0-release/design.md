# Design Document: Pabawi v0.5.0 Release

## Overview

This design document outlines the technical approach for implementing the pabawi v0.5.0 release features. The release focuses on six major areas:

1. **Integration Color Coding System**: Visual consistency for identifying data sources
2. **Backend Logging Consistency**: Standardized logging across all components
3. **Expert Mode Enhancements**: Comprehensive debugging information with performance optimization
4. **Performance Optimization**: Code cleanup and efficiency improvements for large-scale deployments
5. **Puppet Reports Filtering**: Advanced filtering capabilities for report analysis
6. **Puppet Run Status Visualization**: Graphical representation of puppet run history

The design emphasizes maintainability, performance, and user experience while ensuring backward compatibility with existing deployments.

## Architecture

### High-Level Architecture

The pabawi application follows a three-tier architecture:

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (Svelte 5)                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │  UI Components│  │ State Mgmt   │  │  API Client  │ │
│  │  (TailwindCSS)│  │ (Svelte 5)   │  │              │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
└─────────────────────────────────────────────────────────┘
                          │
                          │ HTTP/REST API
                          │
┌─────────────────────────────────────────────────────────┐
│              Backend (Node.js/TypeScript)               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │   Express    │  │  Integration │  │   Services   │ │
│  │   Routes     │  │   Manager    │  │              │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
└─────────────────────────────────────────────────────────┘
                          │
                          │ Plugin Interface
                          │
┌─────────────────────────────────────────────────────────┐
│                  Integration Plugins                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐ │
│  │   Bolt   │  │ PuppetDB │  │  Puppet  │  │ Hiera  │ │
│  │          │  │          │  │  Server  │  │        │ │
│  └──────────┘  └──────────┘  └──────────┘  └────────┘ │
└─────────────────────────────────────────────────────────┘
```

### Integration Color Coding Architecture

Each integration has a designated color inspired by the Puppet brand for better visibility and consistency across all UI elements:

```typescript
// Color mapping configuration - Updated for better visibility
const INTEGRATION_COLORS = {
  bolt: { primary: '#FFAE1A', light: '#FFF4E0', dark: '#CC8B15' },        // Bright orange (Puppet logo)
  puppetdb: { primary: '#9063CD', light: '#F0E6FF', dark: '#7249A8' },    // Violet/purple (Puppet logo)
  puppetserver: { primary: '#2E3A87', light: '#E8EAFF', dark: '#1F2760' }, // Dark blue (Puppet logo)
  hiera: { primary: '#C1272D', light: '#FFE8E9', dark: '#9A1F24' }        // Dark red
};
```

**Color Usage:**
- **Primary**: Main color for badges, labels, and integration dots
- **Light**: Background color for highlighted sections and badge backgrounds
- **Dark**: Hover states, active states, and text on light backgrounds

**Integration Status Display (Home Page Only):**
The home page displays integration status with colored icons showing connection state:
- **Connected**: Integration icon in full color with checkmark
- **Degraded**: Integration icon in warning color (yellow/orange) with alert symbol
- **Error**: Integration icon in error color (red) with X symbol
- **Not Configured**: Integration icon in gray with info symbol

### Expert Mode Architecture

Expert mode uses a conditional data loading strategy with unified logging across frontend and backend:

```
┌─────────────────────────────────────────────────────────┐
│                      Frontend                           │
│                                                         │
│  Expert Mode Disabled:                                 │
│  ┌─────────────────────────────────────────────────┐  │
│  │  Standard API Response (minimal data)           │  │
│  └─────────────────────────────────────────────────┘  │
│                                                         │
│  Expert Mode Enabled:                                  │
│  ┌─────────────────────────────────────────────────┐  │
│  │  Enhanced API Response (with debug data)        │  │
│  │  + Frontend logs (with correlation IDs)        │  │
│  │  + Backend debug info                          │  │
│  │  + Performance metrics                         │  │
│  │  + Expandable sections for large outputs        │  │
│  │  + Copy-to-clipboard support button             │  │
│  └─────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### Unified Logging Architecture

The unified logging system provides full-stack visibility with correlation IDs linking frontend actions to backend processing:

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend Logger                      │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Circular Buffer (100 entries)                   │  │
│  │  - Automatic sensitive data obfuscation         │  │
│  │  - Correlation ID generation                    │  │
│  │  - Throttled backend sync (1 req/sec)           │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                          │
                          │ POST /api/debug/frontend-logs
                          │ (when expert mode enabled)
                          ↓
┌─────────────────────────────────────────────────────────┐
│                  Backend Debug Routes                   │
│  ┌──────────────────────────────────────────────────┐  │
│  │  In-Memory Storage (by correlation ID)          │  │
│  │  - 5 minute TTL                                  │  │
│  │  - 100 correlation ID max                       │  │
│  │  - Automatic cleanup                            │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                          │
                          │ Included in expert mode responses
                          ↓
┌─────────────────────────────────────────────────────────┐
│              ExpertModeDebugPanel (UI)                  │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Timeline View (frontend + backend logs)        │  │
│  │  - Filtering by log level                       │  │
│  │  - Search functionality                         │  │
│  │  - Full context copy                            │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. Integration Color Coding System

#### IntegrationColorService (Backend)

```typescript
// backend/src/services/IntegrationColorService.ts

interface IntegrationColorConfig {
  primary: string;
  light: string;
  dark: string;
}

interface IntegrationColors {
  bolt: IntegrationColorConfig;
  puppetdb: IntegrationColorConfig;
  puppetserver: IntegrationColorConfig;
  hiera: IntegrationColorConfig;
}

class IntegrationColorService {
  private colors: IntegrationColors;
  
  getColor(integration: string): IntegrationColorConfig;
  getAllColors(): IntegrationColors;
}
```

#### IntegrationBadge Component (Frontend)

```typescript
// frontend/src/components/IntegrationBadge.svelte

interface IntegrationBadgeProps {
  integration: 'bolt' | 'puppetdb' | 'puppetserver' | 'hiera';
  variant?: 'dot' | 'label' | 'badge';
  size?: 'sm' | 'md' | 'lg';
}
```

#### IntegrationColorStore (Frontend)

```typescript
// frontend/src/lib/integrationColors.svelte.ts

class IntegrationColorStore {
  colors = $state<IntegrationColors>({});
  
  async loadColors(): Promise<void>;
  getColor(integration: string): IntegrationColorConfig;
}
```

### 2. Backend Logging System

#### LoggerService (Backend)

```typescript
// backend/src/services/LoggerService.ts

type LogLevel = 'error' | 'warn' | 'info' | 'debug';

interface LogContext {
  component: string;
  integration?: string;
  operation?: string;
  metadata?: Record<string, unknown>;
}

class LoggerService {
  private level: LogLevel;
  
  constructor(level: LogLevel);
  
  error(message: string, context?: LogContext, error?: Error): void;
  warn(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  debug(message: string, context?: LogContext): void;
  
  shouldLog(level: LogLevel): boolean;
  formatMessage(level: LogLevel, message: string, context?: LogContext): string;
}
```

#### Integration Plugin Logging

All integration plugins will use the centralized LoggerService:

```typescript
// Example usage in BoltPlugin
class BoltPlugin extends BasePlugin {
  private logger: LoggerService;
  
  constructor(boltService: BoltService, logger: LoggerService) {
    super("bolt", "both");
    this.logger = logger;
  }
  
  protected async performHealthCheck(): Promise<Omit<HealthStatus, "lastCheck">> {
    this.logger.debug("Starting health check", { 
      component: "BoltPlugin", 
      operation: "healthCheck" 
    });
    // ... health check logic
  }
}
```

### 3. Expert Mode Enhancement

#### ExpertModeService (Backend)

```typescript
// backend/src/services/ExpertModeService.ts

interface FrontendLogEntry {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  component: string;
  operation: string;
  message: string;
  metadata?: Record<string, unknown>;
  correlationId?: string;
}

interface DebugInfo {
  timestamp: string;
  requestId: string;
  correlationId?: string;
  integration?: string;
  operation: string;
  duration: number;
  apiCalls?: Array<{
    endpoint: string;
    duration: number;
    status: number;
  }>;
  cacheHit?: boolean;
  errors?: Array<{
    message: string;
    stack?: string;
    level: 'error';
  }>;
  warnings?: Array<{
    message: string;
    context?: string;
    level: 'warn';
  }>;
  info?: Array<{
    message: string;
    context?: string;
    level: 'info';
  }>;
  frontendLogs?: FrontendLogEntry[];
  performance?: {
    memoryUsage: number;
    cpuUsage: number;
    activeConnections: number;
    cacheStats: {
      hits: number;
      misses: number;
      size: number;
    };
  };
}

class ExpertModeService {
  attachDebugInfo<T>(data: T, debugInfo: DebugInfo): T & { _debug?: DebugInfo };
  shouldIncludeDebug(req: Request): boolean;
  collectPerformanceMetrics(): PerformanceMetrics;
  addFrontendLogs(debugInfo: DebugInfo, logs: FrontendLogEntry[]): void;
}
```

#### Frontend Logger Service

```typescript
// frontend/src/lib/logger.svelte.ts

interface LoggerConfig {
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  sendToBackend: boolean;
  bufferSize: number;
  includePerformance: boolean;
  throttleMs: number;
}

interface LogEntry {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  component: string;
  operation: string;
  message: string;
  metadata?: Record<string, unknown>;
  correlationId?: string;
}

class FrontendLogger {
  private buffer: LogEntry[];
  private config: LoggerConfig;
  
  debug(component: string, operation: string, message: string, metadata?: Record<string, unknown>): void;
  info(component: string, operation: string, message: string, metadata?: Record<string, unknown>): void;
  warn(component: string, operation: string, message: string, metadata?: Record<string, unknown>): void;
  error(component: string, operation: string, message: string, metadata?: Record<string, unknown>): void;
  
  // Automatic sensitive data obfuscation
  private obfuscateSensitiveData(data: unknown): unknown;
  
  // Throttled backend sync
  private syncToBackend(): Promise<void>;
  
  // Get logs for correlation ID
  getLogsForCorrelation(correlationId: string): LogEntry[];
}
```

#### Backend Debug Routes

```typescript
// backend/src/routes/debug.ts

// POST /api/debug/frontend-logs - Receive frontend log batches
router.post('/frontend-logs', async (req, res) => {
  const { correlationId, logs } = req.body;
  storeFrontendLogs(correlationId, logs);
  res.json({ success: true });
});

// GET /api/debug/frontend-logs/:correlationId - Retrieve logs
router.get('/frontend-logs/:correlationId', (req, res) => {
  const logs = getFrontendLogs(req.params.correlationId);
  res.json({ logs });
});

// In-memory storage with automatic cleanup
interface FrontendLogStorage {
  [correlationId: string]: {
    logs: FrontendLogEntry[];
    timestamp: number;
  };
}
```

#### ExpertModeDebugPanel Component (Frontend)

```typescript
// frontend/src/components/ExpertModeDebugPanel.svelte

interface DebugPanelProps {
  debugInfo: DebugInfo;
  frontendInfo?: {
    renderTime: number;
    componentTree: string[];
    url: string;
    browserInfo: {
      userAgent: string;
      viewport: { width: number; height: number };
      language: string;
    };
    cookies: Record<string, string>;
  };
  compact?: boolean; // For on-page view vs popup
}

// On-page view: Shows errors (red), warnings (yellow), info (blue) with color coding
// Popup view: Shows all above + debug data + performance metrics + contextual data
```

#### ExpertModeCopyButton Component (Frontend)

```typescript
// frontend/src/components/ExpertModeCopyButton.svelte

interface CopyButtonProps {
  data: unknown;
  label?: string;
  includeContext?: boolean;
  includePerformance?: boolean;
  includeBrowserInfo?: boolean;
}
```

#### Expert Mode Coverage Requirements

Every frontend page section that makes backend API calls must include:

1. **On-Page Expert Mode View** (when expert mode enabled):
   - Compact debug panel showing errors (red), warnings (yellow), info (blue)
   - Consistent styling using integration colors where applicable
   - "Show Details" button to open full popup

2. **Expert Mode Popup** (accessed via button):
   - Complete debug information including debug-level logs
   - Performance metrics from PerformanceMonitorService
   - Contextual troubleshooting data:
     - Current URL and route
     - Browser information (user agent, viewport, language)
     - Relevant cookies
     - Request headers
     - Timestamp and request ID
   - Copy-to-clipboard button for entire context
   - Formatted for easy sharing with support/AI

3. **Backend Endpoint Requirements**:
   - All endpoints must use LoggerService for consistent logging
   - All endpoints must collect and attach debug info when expert mode enabled
   - All endpoints must include performance metrics in debug info
   - All endpoints must log at appropriate levels (error, warn, info, debug)

#### Pages and Sections Requiring Expert Mode

1. **HomePage** (`frontend/src/pages/HomePage.svelte`):
   - Integration status section
   - Puppet reports summary section
   - Quick actions section (if backend calls)

2. **InventoryPage** (`frontend/src/pages/InventoryPage.svelte`):
   - Inventory list section
   - Node filtering section
   - Bulk actions section

3. **NodeDetailPage** (`frontend/src/pages/NodeDetailPage.svelte`):
   - Node status tab
   - Facts tab
   - Hiera tab
   - Catalog tab
   - Reports tab
   - Managed resources tab

4. **PuppetPage** (`frontend/src/pages/PuppetPage.svelte`):
   - Reports list section
   - Report filtering section
   - Report details section

5. **ExecutionsPage** (`frontend/src/pages/ExecutionsPage.svelte`):
   - Executions list section
   - Execution details section
   - Re-execution section

6. **IntegrationSetupPage** (`frontend/src/pages/IntegrationSetupPage.svelte`):
   - Integration health checks section
   - Configuration validation section

#### Backend Routes Requiring Expert Mode & Logging

All routes must implement:
- Consistent logging using LoggerService
- Debug info attachment when expert mode enabled
- Performance metrics collection
- Proper error/warning/info logging

Routes to update:
1. `/api/integrations/*` - Integration status and health
2. `/api/inventory/*` - Inventory and node data
3. `/api/puppet/*` - Puppet reports and catalogs
4. `/api/facts/*` - Facts retrieval
5. `/api/hiera/*` - Hiera data
6. `/api/executions/*` - Execution history and details
7. `/api/tasks/*` - Task execution
8. `/api/commands/*` - Command execution
9. `/api/packages/*` - Package management
10. `/api/streaming/*` - Streaming execution data

### 4. Performance Optimization

#### PerformanceMonitorService (Backend)

```typescript
// backend/src/services/PerformanceMonitorService.ts

interface PerformanceMetrics {
  operation: string;
  duration: number;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

class PerformanceMonitorService {
  startTimer(operation: string): () => PerformanceMetrics;
  recordMetric(metric: PerformanceMetrics): void;
  getMetrics(operation?: string): PerformanceMetrics[];
}
```

#### API Call Deduplication

```typescript
// backend/src/middleware/deduplication.ts

interface RequestCache {
  key: string;
  response: unknown;
  timestamp: number;
  ttl: number;
}

class RequestDeduplicationMiddleware {
  private cache: Map<string, RequestCache>;
  
  generateKey(req: Request): string;
  getCached(key: string): RequestCache | null;
  setCached(key: string, response: unknown, ttl: number): void;
  middleware(): RequestHandler;
}
```

### 5. Puppet Reports Filtering

#### ReportFilterService (Backend)

```typescript
// backend/src/services/ReportFilterService.ts

interface ReportFilters {
  status?: ('success' | 'failed' | 'changed' | 'unchanged')[];
  minDuration?: number;
  minCompileTime?: number;
  minTotalResources?: number;
}

interface PuppetReport {
  certname: string;
  status: string;
  duration: number;
  compileTime: number;
  totalResources: number;
  timestamp: string;
  // ... other fields
}

class ReportFilterService {
  filterReports(reports: PuppetReport[], filters: ReportFilters): PuppetReport[];
  validateFilters(filters: ReportFilters): boolean;
}
```

#### ReportFilterPanel Component (Frontend)

```typescript
// frontend/src/components/ReportFilterPanel.svelte

interface FilterPanelProps {
  onFilterChange: (filters: ReportFilters) => void;
  initialFilters?: ReportFilters;
}

interface FilterState {
  status: Set<string>;
  minDuration: number;
  minCompileTime: number;
  minTotalResources: number;
}
```

#### Session Filter Persistence (Frontend)

```typescript
// frontend/src/lib/reportFilters.svelte.ts

class ReportFilterStore {
  filters = $state<ReportFilters>({});
  
  setFilter(key: keyof ReportFilters, value: unknown): void;
  clearFilters(): void;
  getFilters(): ReportFilters;
  
  // Session persistence (not localStorage)
  private persistToSession(): void;
  private loadFromSession(): void;
}
```

### 6. Puppet Run Status Visualization

#### PuppetRunHistoryService (Backend)

```typescript
// backend/src/services/PuppetRunHistoryService.ts

interface RunHistoryData {
  date: string;
  success: number;
  failed: number;
  changed: number;
  unchanged: number;
}

interface NodeRunHistory {
  nodeId: string;
  history: RunHistoryData[];
  summary: {
    totalRuns: number;
    successRate: number;
    avgDuration: number;
  };
}

class PuppetRunHistoryService {
  getNodeHistory(nodeId: string, days: number): Promise<NodeRunHistory>;
  getAggregatedHistory(days: number): Promise<RunHistoryData[]>;
}
```

#### PuppetRunChart Component (Frontend)

```typescript
// frontend/src/components/PuppetRunChart.svelte

interface ChartProps {
  data: RunHistoryData[];
  type: 'bar' | 'timeline';
  height?: number;
}

interface ChartConfig {
  colors: {
    success: string;
    failed: string;
    changed: string;
    unchanged: string;
  };
  responsive: boolean;
  animation: boolean;
}
```

## Data Models

### Frontend Logger Configuration

```typescript
interface LoggerConfig {
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  sendToBackend: boolean;
  bufferSize: number;
  includePerformance: boolean;
  throttleMs: number;
}

interface FrontendLogEntry {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  component: string;
  operation: string;
  message: string;
  metadata?: Record<string, unknown>;
  correlationId?: string;
}
```

**Storage:** `localStorage` key `pabawi_logger_config`

**Default Values:**
```typescript
{
  logLevel: 'info',
  sendToBackend: false,
  bufferSize: 100,
  includePerformance: true,
  throttleMs: 1000
}
```

**Security Features:**
- Automatic obfuscation of sensitive data (passwords, tokens, API keys, secrets, auth headers)
- In-memory only storage on backend (5 min TTL)
- Only syncs when expert mode enabled

### Integration Color Configuration

```typescript
interface IntegrationColorConfig {
  primary: string;      // Main color for badges and labels
  light: string;        // Background color for highlighted sections
  dark: string;         // Hover and active states
}

interface IntegrationColors {
  bolt: IntegrationColorConfig;
  puppetdb: IntegrationColorConfig;
  puppetserver: IntegrationColorConfig;
  hiera: IntegrationColorConfig;
}
```

**Actual Color Values (Implemented):**
```typescript
{
  bolt: {
    primary: '#FFAE1A',  // Bright orange from Puppet logo
    light: '#FFF4E0',
    dark: '#CC8B15',
  },
  puppetdb: {
    primary: '#9063CD',  // Violet/purple from Puppet logo
    light: '#F0E6FF',
    dark: '#7249A8',
  },
  puppetserver: {
    primary: '#2E3A87',  // Dark blue from Puppet logo
    light: '#E8EAFF',
    dark: '#1F2760',
  },
  hiera: {
    primary: '#C1272D',  // Dark red
    light: '#FFE8E9',
    dark: '#9A1F24',
  },
}
```

### Debug Information Model

```typescript
interface DebugInfo {
  timestamp: string;
  requestId: string;
  correlationId?: string;
  integration?: string;
  operation: string;
  duration: number;
  apiCalls?: ApiCallInfo[];
  cacheHit?: boolean;
  errors?: ErrorInfo[];
  warnings?: WarningInfo[];
  info?: InfoMessage[];
  debug?: DebugMessage[];
  frontendLogs?: FrontendLogEntry[];
  performance?: PerformanceMetrics;
  context?: ContextInfo;
  metadata?: Record<string, unknown>;
}

interface FrontendLogEntry {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  component: string;
  operation: string;
  message: string;
  metadata?: Record<string, unknown>;
  correlationId?: string;
}

interface ApiCallInfo {
  endpoint: string;
  method: string;
  duration: number;
  status: number;
  cached: boolean;
}

interface ErrorInfo {
  message: string;
  stack?: string;
  code?: string;
  level: 'error';
}

interface WarningInfo {
  message: string;
  context?: string;
  level: 'warn';
}

interface InfoMessage {
  message: string;
  context?: string;
  level: 'info';
}

interface DebugMessage {
  message: string;
  context?: string;
  level: 'debug';
}

interface PerformanceMetrics {
  memoryUsage: number;
  cpuUsage: number;
  activeConnections: number;
  cacheStats: {
    hits: number;
    misses: number;
    size: number;
    hitRate: number;
  };
  requestStats: {
    total: number;
    avgDuration: number;
    p95Duration: number;
    p99Duration: number;
  };
}

interface ContextInfo {
  url: string;
  method: string;
  headers: Record<string, string>;
  query: Record<string, string>;
  userAgent: string;
  ip: string;
  timestamp: string;
  correlationId?: string;
}

interface FrontendDebugInfo {
  renderTime: number;
  componentTree: string[];
  url: string;
  browserInfo: {
    userAgent: string;
    viewport: { width: number; height: number };
    language: string;
    platform: string;
  };
  cookies: Record<string, string>;
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
}
```

### Report Filter Model

```typescript
interface ReportFilters {
  status?: ('success' | 'failed' | 'changed' | 'unchanged')[];
  minDuration?: number;          // in seconds
  minCompileTime?: number;       // in seconds
  minTotalResources?: number;
}

interface FilterValidation {
  valid: boolean;
  errors: string[];
}
```

### Puppet Run History Model

```typescript
interface RunHistoryData {
  date: string;              // ISO date string
  success: number;           // count of successful runs
  failed: number;            // count of failed runs
  changed: number;           // count of runs with changes
  unchanged: number;         // count of unchanged runs
}

interface NodeRunHistory {
  nodeId: string;
  history: RunHistoryData[];
  summary: {
    totalRuns: number;
    successRate: number;      // percentage
    avgDuration: number;      // in seconds
    lastRun: string;          // ISO timestamp
  };
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*


### Property 1: Integration Color Consistency

*For any* UI element that displays integration-attributed data, all elements associated with the same integration should use the same color values (primary, light, dark) consistently across labels, badges, tabs, and status indicators.

**Validates: Requirements 1.2, 1.3, 1.4**

### Property 2: Log Level Hierarchy

*For any* log level setting (error, warn, info, debug), the system should output only messages at that level and higher priority levels, following the hierarchy: error > warn > info > debug.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4**

### Property 3: Log Format Consistency

*For any* log message from any integration module (Bolt, PuppetDB, PuppetServer, Hiera), the message should follow the same format structure including timestamp, log level, component name, and message content.

**Validates: Requirements 2.5, 2.6**

### Property 4: Expert Mode Debug Data Inclusion

*For any* API response, debug information should be included if and only if expert mode is enabled in the request context.

**Validates: Requirements 3.1, 3.5, 3.13**

### Property 5: Expert Mode UI Rendering

*For any* page render, debugging UI elements (debug panels, copy buttons, expandable sections) should be rendered if and only if expert mode is enabled.

**Validates: Requirements 3.6**

### Property 6: Debug Info Completeness

*For any* debug information object when expert mode is enabled, it should include all required fields: timestamp, requestId, operation, duration, and any relevant apiCalls, errors, warnings, info, performance metrics, or context data.

**Validates: Requirements 3.4, 3.9, 3.11**

### Property 7: Error Response Debug Attachment

*For any* API endpoint that returns an error response when expert mode is enabled, the error response should include a `_debug` field containing complete debug information including the error details.

**Validates: Requirements 3.13, 3.14**

### Property 8: External API Error Capture

*For any* external integration API call (PuppetDB, PuppetServer, Bolt, Hiera) that fails, the debug information should capture the error message, stack trace, and connection details when expert mode is enabled.

**Validates: Requirements 3.14**

### Property 7: Expert Mode Page Coverage

*For any* frontend page section that makes backend API calls, an expert mode debug view should be available when expert mode is enabled.

**Validates: Requirements 3.7, 3.10**

### Property 8: Debug Info Color Consistency

*For any* expert mode debug panel, errors should be displayed in red, warnings in yellow/orange, and info in blue, consistently across all pages.

**Validates: Requirements 3.8, 3.10**

### Property 9: Backend Logging Completeness

*For any* backend API endpoint, appropriate logging should occur at all relevant log levels (error for failures, warn for degraded states, info for normal operations, debug for detailed troubleshooting).

**Validates: Requirements 3.11, 3.12**

### Property 10: Request Deduplication

*For any* identical API request made within the cache TTL window, the second request should return cached data without making an external API call.

**Validates: Requirements 4.1, 4.5**

### Property 11: Report Filter Correctness

*For any* combination of report filters (status, minDuration, minCompileTime, minTotalResources), all returned reports should satisfy ALL applied filter criteria.

**Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5**

### Property 12: Filter Session Persistence

*For any* filter state set during a user session, navigating to a different page and returning should restore the same filter state.

**Validates: Requirements 5.6**

### Property 13: Visualization Data Completeness

*For any* puppet run visualization, the data should include all run status categories (success, failed, changed, unchanged) for the specified time period.

**Validates: Requirements 6.2**

### Property 14: Visualization Reactivity

*For any* puppet run visualization, when new report data is added to the underlying dataset, the visualization should update to reflect the new data.

**Validates: Requirements 6.5**

## Error Handling

### Integration Color Service Errors

- **Missing Color Configuration**: If a color configuration is missing for an integration, fall back to a default gray color and log a warning
- **Invalid Color Format**: Validate color values (hex format) and reject invalid configurations during initialization
- **Unknown Integration**: When requesting colors for an unknown integration, return default colors and log a warning

### Logging Service Errors

- **Invalid Log Level**: If LOG_LEVEL environment variable contains an invalid value, default to "info" and log a warning
- **Logging Failures**: If logging itself fails (e.g., disk full), fail silently to prevent cascading failures
- **Missing Context**: If log context is incomplete, log with available information and mark missing fields

### Expert Mode Errors

- **Debug Data Collection Failure**: If collecting debug information fails, include error details in the debug object rather than failing the request
- **Large Debug Output**: Implement size limits for debug data (e.g., 1MB) and truncate with indication if exceeded
- **Copy-to-Clipboard Failure**: Handle clipboard API failures gracefully with user-friendly error messages

### Performance Optimization Errors

- **Cache Corruption**: If cached data is corrupted, invalidate cache entry and fetch fresh data
- **Deduplication Key Collision**: Use cryptographic hash for cache keys to minimize collision risk
- **Memory Pressure**: Implement LRU eviction for caches when memory usage exceeds thresholds

### Report Filtering Errors

- **Invalid Filter Values**: Validate filter inputs (e.g., negative durations) and return validation errors
- **Filter Parsing Errors**: Handle malformed filter objects gracefully with clear error messages
- **Empty Result Sets**: When filters produce no results, display appropriate "no results" message rather than error

### Visualization Errors

- **Missing Data**: If historical data is unavailable, display message indicating data gap
- **Data Format Errors**: Validate report data format before visualization and handle malformed data gracefully
- **Rendering Failures**: Catch chart rendering errors and display fallback message with option to view raw data

## Testing Strategy

### Dual Testing Approach

This project will use both unit testing and property-based testing to ensure comprehensive coverage:

- **Unit Tests**: Verify specific examples, edge cases, error conditions, and integration points
- **Property Tests**: Verify universal properties across all inputs using randomized testing

Both approaches are complementary and necessary for comprehensive coverage. Unit tests catch concrete bugs and verify specific behaviors, while property tests verify general correctness across a wide range of inputs.

### Testing Framework Selection

- **Backend**: Vitest for both unit and property-based tests
- **Property-Based Testing Library**: fast-check (already in dependencies)
- **Frontend**: Vitest with Svelte Testing Library
- **E2E Tests**: Playwright (already configured)

### Property-Based Testing Configuration

Each property test will:
- Run a minimum of 100 iterations to ensure adequate coverage
- Include a comment tag referencing the design document property
- Use the format: `// Feature: pabawi-v0.5.0-release, Property N: [property title]`

### Test Organization

#### Backend Tests

```
backend/test/
├── unit/
│   ├── services/
│   │   ├── IntegrationColorService.test.ts
│   │   ├── LoggerService.test.ts
│   │   ├── ExpertModeService.test.ts
│   │   ├── ReportFilterService.test.ts
│   │   └── PuppetRunHistoryService.test.ts
│   └── middleware/
│       └── deduplication.test.ts
└── property/
    ├── logging.property.test.ts
    ├── filtering.property.test.ts
    ├── caching.property.test.ts
    └── expertMode.property.test.ts
```

#### Frontend Tests

```
frontend/src/
├── components/
│   ├── IntegrationBadge.test.ts
│   ├── ReportFilterPanel.test.ts
│   ├── PuppetRunChart.test.ts
│   └── ExpertModeDebugPanel.test.ts
└── lib/
    ├── integrationColors.test.ts
    ├── reportFilters.test.ts
    └── expertMode.test.ts (already exists)
```

### Unit Test Coverage

Unit tests will focus on:

1. **Integration Color Service**
   - Color configuration loading
   - Color retrieval for known integrations
   - Fallback behavior for unknown integrations
   - Color format validation

2. **Logger Service**
   - Log level filtering
   - Message formatting
   - Context inclusion
   - Error handling

3. **Expert Mode Service**
   - Debug info attachment
   - Request context detection
   - Data size limits
   - Error handling in debug collection

4. **Report Filter Service**
   - Individual filter application
   - Combined filter logic
   - Filter validation
   - Edge cases (empty results, invalid values)

5. **Puppet Run History Service**
   - Data aggregation
   - Date range handling
   - Summary calculations
   - Missing data handling

6. **UI Components**
   - Integration badge rendering
   - Filter panel interactions
   - Chart rendering
   - Expert mode panel display

### Property-Based Test Examples

#### Property 1: Integration Color Consistency

```typescript
// Feature: pabawi-v0.5.0-release, Property 1: Integration Color Consistency
test('integration colors are consistent across all UI elements', () => {
  fc.assert(
    fc.property(
      fc.constantFrom('bolt', 'puppetdb', 'puppetserver', 'hiera'),
      fc.array(fc.constantFrom('badge', 'label', 'dot', 'indicator')),
      (integration, elementTypes) => {
        const colorService = new IntegrationColorService();
        const expectedColor = colorService.getColor(integration);
        
        // All elements for this integration should use the same color
        const colors = elementTypes.map(type => 
          getElementColor(type, integration)
        );
        
        return colors.every(color => 
          color.primary === expectedColor.primary &&
          color.light === expectedColor.light &&
          color.dark === expectedColor.dark
        );
      }
    ),
    { numRuns: 100 }
  );
});
```

#### Property 2: Log Level Hierarchy

```typescript
// Feature: pabawi-v0.5.0-release, Property 2: Log Level Hierarchy
test('log levels follow correct hierarchy', () => {
  fc.assert(
    fc.property(
      fc.constantFrom('error', 'warn', 'info', 'debug'),
      fc.array(
        fc.record({
          level: fc.constantFrom('error', 'warn', 'info', 'debug'),
          message: fc.string()
        })
      ),
      (configuredLevel, messages) => {
        const logger = new LoggerService(configuredLevel);
        const hierarchy = { error: 0, warn: 1, info: 2, debug: 3 };
        const configuredPriority = hierarchy[configuredLevel];
        
        // Only messages at or above configured level should be logged
        const logged = messages.filter(msg => 
          hierarchy[msg.level] <= configuredPriority
        );
        
        // Verify logger would log exactly these messages
        return messages.every(msg => 
          logger.shouldLog(msg.level) === (hierarchy[msg.level] <= configuredPriority)
        );
      }
    ),
    { numRuns: 100 }
  );
});
```

#### Property 7: Error Response Debug Attachment

```typescript
// Feature: pabawi-v0.5.0-release, Property 7: Error Response Debug Attachment
test('error responses include debug info when expert mode enabled', () => {
  fc.assert(
    fc.property(
      fc.boolean(), // expert mode enabled
      fc.record({
        statusCode: fc.constantFrom(400, 401, 403, 404, 500, 503),
        errorMessage: fc.string(),
        errorStack: fc.option(fc.string())
      }),
      (expertModeEnabled, errorDetails) => {
        const req = { expertMode: expertModeEnabled };
        const expertModeService = new ExpertModeService();
        
        // Simulate error response creation
        const errorResponse = { error: errorDetails.errorMessage };
        
        if (expertModeEnabled) {
          const debugInfo = expertModeService.createDebugInfo('test-operation', 'req-123', 0);
          expertModeService.addError(debugInfo, {
            message: errorDetails.errorMessage,
            stack: errorDetails.errorStack,
            level: 'error'
          });
          const responseWithDebug = expertModeService.attachDebugInfo(errorResponse, debugInfo);
          
          // Error response should have _debug field
          return responseWithDebug._debug !== undefined &&
                 responseWithDebug._debug.errors.length > 0;
        } else {
          // Error response should NOT have _debug field
          return errorResponse._debug === undefined;
        }
      }
    ),
    { numRuns: 100 }
  );
});
```

#### Property 8: External API Error Capture

```typescript
// Feature: pabawi-v0.5.0-release, Property 8: External API Error Capture
test('external API errors are captured in debug info', () => {
  fc.assert(
    fc.property(
      fc.constantFrom('PuppetDB', 'PuppetServer', 'Bolt', 'Hiera'),
      fc.record({
        errorType: fc.constantFrom('connection', 'authentication', 'timeout', 'query'),
        errorMessage: fc.string(),
        statusCode: fc.option(fc.nat(600))
      }),
      (integration, errorDetails) => {
        const expertModeService = new ExpertModeService();
        const debugInfo = expertModeService.createDebugInfo(`${integration}-call`, 'req-123', 0);
        
        // Simulate external API error capture
        expertModeService.addError(debugInfo, {
          message: `${integration} ${errorDetails.errorType} error: ${errorDetails.errorMessage}`,
          level: 'error'
        });
        
        // Debug info should contain the error
        return debugInfo.errors.length > 0 &&
               debugInfo.errors[0].message.includes(integration) &&
               debugInfo.errors[0].message.includes(errorDetails.errorType);
      }
    ),
    { numRuns: 100 }
  );
});
```

#### Property 11: Report Filter Correctness

```typescript
// Feature: pabawi-v0.5.0-release, Property 11: Report Filter Correctness
test('filtered reports match all filter criteria', () => {
  fc.assert(
    fc.property(
      fc.array(generatePuppetReport()),
      fc.record({
        status: fc.option(fc.array(fc.constantFrom('success', 'failed', 'changed', 'unchanged'))),
        minDuration: fc.option(fc.nat(3600)),
        minCompileTime: fc.option(fc.nat(300)),
        minTotalResources: fc.option(fc.nat(1000))
      }),
      (reports, filters) => {
        const filterService = new ReportFilterService();
        const filtered = filterService.filterReports(reports, filters);
        
        // Every filtered report should match all criteria
        return filtered.every(report => {
          const matchesStatus = !filters.status || filters.status.includes(report.status);
          const matchesDuration = !filters.minDuration || report.duration >= filters.minDuration;
          const matchesCompile = !filters.minCompileTime || report.compileTime >= filters.minCompileTime;
          const matchesResources = !filters.minTotalResources || report.totalResources >= filters.minTotalResources;
          
          return matchesStatus && matchesDuration && matchesCompile && matchesResources;
        });
      }
    ),
    { numRuns: 100 }
  );
});
```

### Integration Testing

Integration tests will verify:

1. **End-to-End Color Consistency**: Verify colors are consistent from backend API through frontend rendering
2. **Logging Across Integrations**: Verify all integration plugins use consistent logging
3. **Expert Mode Flow**: Verify expert mode flag propagates correctly from frontend through backend to response
4. **Filter Persistence**: Verify filter state persists across page navigation
5. **Visualization Data Flow**: Verify report data flows correctly to visualization components

### Performance Testing

Performance tests will focus on:

1. **Large Dataset Handling**: Test with 1000+ nodes and 10000+ reports
2. **Cache Effectiveness**: Measure cache hit rates and response time improvements
3. **API Call Reduction**: Count external API calls before and after optimization
4. **Memory Usage**: Monitor memory consumption with large datasets
5. **UI Responsiveness**: Measure render times for large report lists and visualizations

### Manual Testing Checklist

Before release, manually verify:

- [ ] All integration colors are visually distinct and accessible
- [ ] Color consistency across all pages and components
- [ ] Log output at each level (error, warn, info, debug)
- [ ] Expert mode toggle works correctly
- [ ] Debug panel displays complete information
- [ ] Copy-to-clipboard functionality works
- [ ] All filter combinations work correctly
- [ ] Filter state persists across navigation
- [ ] Visualizations render correctly on different screen sizes
- [ ] Visualizations update when data changes
- [ ] Performance is acceptable with large datasets (1000+ nodes)

## Implementation Notes

### Critical Expert Mode Implementation Issues

During implementation of Phase 2 (Expert Mode), several critical issues were discovered that must be addressed:

#### Issue 1: Broken Utility Functions

**Problem**: The utility functions `captureError()` and `captureWarning()` in `backend/src/routes/integrations/utils.ts` create debug information but do NOT attach it to responses. This means routes using these utilities send error responses without the `_debug` field, making external API errors invisible on the frontend.

**Impact**: 
- Users cannot see underlying reasons for external API failures
- Error messages, stack traces, and connection details are lost
- Expert mode is ineffective for troubleshooting external integration issues

**Solution**: Eliminate these broken utility functions and use direct ExpertModeService calls in all routes, following the pattern established in the `/api/integrations/puppetdb/reports/summary` route.

#### Issue 2: Incomplete Route Coverage

**Current State**:
- ✅ 5/58 routes (8.6%) properly implement expert mode with all log levels
- ⚠️ 11 routes use broken utility functions (need complete rewrite)
- ❌ 42 routes have NO expert mode implementation

**Reference Implementation**: The route `GET /api/integrations/puppetdb/reports/summary` (lines 800-900 in `backend/src/routes/integrations/puppetdb.ts`) demonstrates the CORRECT pattern:
1. Create debugInfo at start if expert mode enabled
2. Add info/debug messages during processing
3. Add errors/warnings in catch blocks
4. Attach debugInfo to BOTH success AND error responses
5. Include performance metrics and request context

#### Issue 3: External API Error Visibility

**Problem**: When external integrations (PuppetDB, PuppetServer, Bolt) fail due to connection errors, authentication failures, or timeouts, these errors are not captured in debug information and are invisible to users.

**Solution**: All routes must capture external API errors in try-catch blocks and add them to debug info using `expertModeService.addError()` before attaching debug info to error responses.

### Phase 1: Foundation (Integration Colors & Logging)

1. Implement IntegrationColorService and color configuration
2. Implement LoggerService and migrate all logging
3. Update all integration plugins to use LoggerService
4. Create IntegrationBadge component
5. Add integration color indicators to existing components

### Phase 2: Expert Mode Enhancement

1. Implement ExpertModeService for backend
2. Add debug info collection to API routes
3. Create ExpertModeDebugPanel component
4. Create ExpertModeCopyButton component
5. Add conditional rendering based on expert mode state
6. Implement "show more" functionality for large outputs

### Phase 3: Performance Optimization

1. Implement RequestDeduplicationMiddleware
2. Add PerformanceMonitorService
3. Audit and remove unused code
4. Consolidate duplicate code
5. Optimize database queries
6. Implement caching strategies

### Phase 4: Report Filtering

1. Implement ReportFilterService
2. Create ReportFilterPanel component
3. Implement ReportFilterStore for session persistence
4. Update PuppetReportsListView to use filters
5. Update home page reports to use filters
6. Add filter state to URL query parameters (optional)

### Phase 5: Visualization

1. Implement PuppetRunHistoryService
2. Create PuppetRunChart component
3. Integrate chart into node detail page
4. Integrate aggregated chart into home page
5. Add responsive design for different screen sizes
6. Implement chart update on data changes

### Phase 6: Testing & Documentation

1. Write unit tests for all new services
2. Write property-based tests for key properties
3. Write integration tests for end-to-end flows
4. Perform manual testing with large datasets
5. Update user documentation
6. Update API documentation

## Deployment Considerations

1. **Configuration**: Set LOG_LEVEL environment variable (error, warn, info, or debug)
2. **Cache Warming**: First requests after deployment may be slower due to empty cache
3. **Memory Usage**: Monitor memory usage after enabling caching
4. **Log Volume**: Debug level logging will increase log volume significantly
5. **Database**: No schema changes required; all features use existing data structures

## Security Considerations

### Expert Mode Security

- Expert mode debug information may contain sensitive data (API endpoints, timing information)
- Ensure expert mode is only accessible to authenticated administrators
- Consider adding audit logging for expert mode usage
- Sanitize sensitive information from debug output (credentials, tokens)

### Logging Security

- Ensure log files have appropriate permissions (readable only by administrators)
- Implement log rotation to prevent disk space exhaustion
- Sanitize sensitive information from logs (passwords, API keys)
- Consider encrypting logs at rest for compliance

### Caching Security

- Ensure cached data respects user permissions
- Implement cache invalidation on permission changes
- Use secure cache keys to prevent cache poisoning
- Monitor cache for potential memory exhaustion attacks

### Filter Injection

- Validate all filter inputs to prevent injection attacks
- Use parameterized queries for database filters
- Sanitize filter values before use in queries
- Implement rate limiting on filter API endpoints

## Performance Targets

### Response Time Targets

- API responses (cached): < 100ms
- API responses (uncached): < 500ms
- Page load time: < 2s
- Filter application: < 200ms
- Visualization rendering: < 500ms

### Scalability Targets

- Support 10,000+ nodes without performance degradation
- Support 100,000+ puppet reports
- Handle 100+ concurrent users
- Cache hit rate > 80% for frequently accessed data

### Resource Usage Targets

- Memory usage: < 2GB for typical deployment
- CPU usage: < 50% average
- Disk I/O: Minimal (primarily read operations)
- Network: Minimize external API calls through caching

## Monitoring and Observability

### Metrics to Track

1. **Integration Health**
   - Health check success rate per integration
   - API call count per integration
   - API response times per integration

2. **Performance Metrics**
   - Cache hit rate
   - Average response time
   - P95/P99 response times
   - Memory usage
   - CPU usage

3. **Feature Usage**
   - Expert mode usage frequency
   - Filter usage patterns
   - Visualization view counts
   - Most common filter combinations

4. **Error Rates**
   - API error rate
   - Integration failure rate
   - Frontend error rate
   - Log error count

### Logging Strategy

- **Error Level**: Critical failures requiring immediate attention
- **Warn Level**: Degraded functionality, fallback behavior activated
- **Info Level**: Normal operations, significant events (startup, shutdown, configuration changes)
- **Debug Level**: Detailed operational information for troubleshooting

### Alerting

Consider implementing alerts for:
- Integration health check failures
- High error rates (> 5%)
- Slow response times (> 2s)
- High memory usage (> 80%)
- Cache failures

## Future Enhancements

### Potential Future Features

1. **Custom Color Themes**: Allow users to customize integration colors
2. **Advanced Filtering**: Add date range filters, regex filters, saved filter presets
3. **Export Functionality**: Export filtered reports to CSV/JSON
4. **Visualization Enhancements**: Add more chart types, interactive tooltips, drill-down capabilities
5. **Performance Dashboard**: Dedicated page for performance metrics and trends
6. **Real-time Updates**: WebSocket-based real-time updates for reports and visualizations
7. **Filter Sharing**: Share filter configurations via URL or saved presets
8. **Accessibility Improvements**: Enhanced keyboard navigation, screen reader support

### Technical Debt to Address

1. **Code Consolidation**: Continue identifying and consolidating duplicate code
2. **Test Coverage**: Increase test coverage to > 90%
3. **Documentation**: Expand inline documentation and API documentation
4. **Type Safety**: Strengthen TypeScript types, eliminate `any` types
5. **Error Handling**: Standardize error handling patterns across codebase
