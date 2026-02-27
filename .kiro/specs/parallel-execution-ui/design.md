# Design Document: Parallel Execution UI

## Overview

This design extends the Pabawi executions page to support multi-node and group-based parallel execution. Users can select multiple nodes or entire groups from the inventory and execute actions (commands, tasks, plans) on all selected targets simultaneously. The feature leverages existing backend infrastructure (ExecutionQueue service with concurrent execution limiting and SSH integration's executeOnMultipleHosts) while adding comprehensive UI capabilities for target selection, execution initiation, real-time progress monitoring, and aggregated results display.

### Goals

- Enable parallel execution on multiple nodes or entire groups with a single action
- Provide intuitive target selection UI with multi-select and group expansion
- Display real-time progress monitoring for parallel executions
- Show aggregated results with success/failure statistics and individual node details
- Integrate seamlessly with existing ExecutionQueue service for concurrency management
- Support batch execution cancellation for operational control
- Maintain performance and scalability for large target sets (up to 1000 nodes)

### Non-Goals

- Modifying the ExecutionQueue concurrency limit (uses existing configuration)
- Creating new node groups through the UI (uses existing inventory groups)
- Real-time streaming output during execution (shows results after completion)
- Execution scheduling or delayed execution (immediate execution only)
- Custom execution workflows or pipelines (single action per batch)

### Key Design Decisions

1. **Batch Execution Model**: Create a batch execution record that groups individual node executions, enabling unified tracking and aggregated results display.

2. **Reuse ExecutionQueue**: Leverage existing ExecutionQueue service for concurrency management rather than implementing separate parallel execution logic.

3. **Database-Driven Progress**: Store batch and individual execution records in the database, using polling to fetch status updates rather than WebSocket streaming.

4. **Group Expansion Backend**: Expand groups to individual nodes in the backend API layer, ensuring the execution layer works with concrete node IDs.

5. **Modal-Based UI**: Use a modal dialog for target selection and execution initiation, keeping the main executions page focused on history and results.

6. **Polling with Backoff**: Use exponential backoff polling for progress updates to balance responsiveness and server load.

## Architecture

### System Components

```
┌──────────────────────────────────────────────────────────────────┐
│                      Frontend (Svelte)                            │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │              ExecutionsPage.svelte                         │  │
│  │  - Displays execution history (single + batch)             │  │
│  │  - "New Parallel Execution" button                         │  │
│  │  - Filters by type, status, date                           │  │
│  └────────────────────────────────────────────────────────────┘  │
│                            │                                      │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │         ParallelExecutionModal.svelte                      │  │
│  │  - Target selection (nodes + groups)                       │  │
│  │  - Action configuration (command/task/plan)                │  │
│  │  - Execution initiation                                    │  │
│  └────────────────────────────────────────────────────────────┘  │
│                            │                                      │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │         BatchProgressPanel.svelte                          │  │
│  │  - Real-time progress monitoring                           │  │
│  │  - Individual target status indicators                     │  │
│  │  - Cancel batch button                                     │  │
│  └────────────────────────────────────────────────────────────┘  │
│                            │                                      │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │         AggregatedResultsView.svelte                       │  │
│  │  - Summary statistics (success/failed counts)              │  │
│  │  - Individual node results with expand/collapse            │  │
│  │  - Export to JSON/CSV                                      │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
                            │
                            │ HTTP API
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│                  Backend (Express/TypeScript)                     │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │         POST /api/executions/batch                         │  │
│  │  - Validates target nodes and action                       │  │
│  │  - Expands groups to node IDs                              │  │
│  │  - Creates batch execution record                          │  │
│  │  - Enqueues individual executions                          │  │
│  └────────────────────────────────────────────────────────────┘  │
│                            │                                      │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │         GET /api/executions/batch/:batchId                 │  │
│  │  - Fetches batch execution status                          │  │
│  │  - Returns aggregated statistics                           │  │
│  │  - Includes individual execution details                   │  │
│  └────────────────────────────────────────────────────────────┘  │
│                            │                                      │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │         POST /api/executions/batch/:batchId/cancel         │  │
│  │  - Cancels queued executions                               │  │
│  │  - Attempts to stop running executions                     │  │
│  │  - Updates batch status                                    │  │
│  └────────────────────────────────────────────────────────────┘  │
│                            │                                      │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │         BatchExecutionService                              │  │
│  │  - Creates batch execution records                         │  │
│  │  - Expands groups to nodes                                 │  │
│  │  - Enqueues executions via ExecutionQueue                  │  │
│  │  - Aggregates batch status                                 │  │
│  └────────────────────────────────────────────────────────────┘  │
│              │                           │                        │
│  ┌───────────┴────────┐     ┌───────────┴────────────┐          │
│  │  ExecutionQueue    │     │  ExecutionRepository   │          │
│  │  - Concurrency     │     │  - Database operations │          │
│  │    management      │     │  - Batch queries       │          │
│  │  - FIFO queueing   │     │  - Status aggregation  │          │
│  └────────────────────┘     └────────────────────────┘          │
│              │                                                    │
│  ┌───────────┴────────────────────────────────────────┐          │
│  │         SSHService / IntegrationPlugins            │          │
│  │  - executeOnMultipleHosts (SSH)                    │          │
│  │  - Integration-specific execution methods          │          │
│  └────────────────────────────────────────────────────┘          │
└──────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│                      SQLite Database                              │
│  - batch_executions table                                         │
│  - executions table (existing, extended)                          │
└──────────────────────────────────────────────────────────────────┘
```

### Data Flow

#### Batch Execution Initiation

1. User opens ParallelExecutionModal and selects targets (nodes/groups)
2. User configures action (command/task/plan) and parameters
3. Frontend sends POST /api/executions/batch with targetNodeIds, targetGroupIds, and action
4. Backend validates request and expands groups to node IDs
5. Backend creates batch execution record in database
6. Backend creates individual execution records for each target node
7. Backend enqueues all executions through ExecutionQueue
8. Backend returns batch ID and execution IDs to frontend
9. Frontend displays BatchProgressPanel and starts polling for status

#### Progress Monitoring

1. Frontend polls GET /api/executions/batch/:batchId every 2 seconds
2. Backend fetches all executions for the batch from database
3. Backend aggregates status (total, running, success, failed)
4. Backend returns aggregated data with individual execution details
5. Frontend updates BatchProgressPanel with current status
6. Polling uses exponential backoff (2s → 4s → 8s) as executions complete
7. Polling stops when all executions reach terminal state (success/failed)

#### Results Display

1. When batch completes, frontend displays AggregatedResultsView
2. User can expand individual node results to see stdout/stderr
3. User can filter results by status (success/failed)
4. User can export results to JSON or CSV format
5. User can navigate to individual execution details page

## Components and Interfaces

### Backend Data Models

#### BatchExecution Interface

```typescript
/**
 * Batch execution record grouping multiple node executions
 */
export interface BatchExecution {
  /** Unique identifier for the batch */
  id: string;
  
  /** Type of action executed */
  type: "command" | "task" | "plan";
  
  /** Action name or command string */
  action: string;
  
  /** Action parameters (JSON) */
  parameters?: Record<string, unknown>;
  
  /** Array of target node IDs */
  targetNodes: string[];
  
  /** Array of target group IDs (before expansion) */
  targetGroups: string[];
  
  /** Overall batch status */
  status: "running" | "success" | "failed" | "partial" | "cancelled";
  
  /** Timestamp when batch was created */
  createdAt: Date;
  
  /** Timestamp when first execution started */
  startedAt?: Date;
  
  /** Timestamp when last execution completed */
  completedAt?: Date;
  
  /** User who initiated the batch */
  userId: string;
  
  /** Array of individual execution IDs */
  executionIds: string[];
  
  /** Aggregated statistics */
  stats: {
    total: number;
    queued: number;
    running: number;
    success: number;
    failed: number;
  };
}
```

#### Extended ExecutionRecord Interface

```typescript
/**
 * Individual execution record (existing interface extended)
 */
export interface ExecutionRecord {
  // ... existing fields ...
  
  /** Batch ID if this execution is part of a batch */
  batchId?: string;
  
  /** Position in batch (for ordering) */
  batchPosition?: number;
}
```

#### BatchExecutionRequest Interface

```typescript
/**
 * Request body for batch execution creation
 */
export interface BatchExecutionRequest {
  /** Array of node IDs to target */
  targetNodeIds?: string[];
  
  /** Array of group IDs to target */
  targetGroupIds?: string[];
  
  /** Type of action */
  type: "command" | "task" | "plan";
  
  /** Action name or command string */
  action: string;
  
  /** Action parameters */
  parameters?: Record<string, unknown>;
}
```

#### BatchExecutionResponse Interface

```typescript
/**
 * Response from batch execution creation
 */
export interface BatchExecutionResponse {
  /** Batch execution ID */
  batchId: string;
  
  /** Array of created execution IDs */
  executionIds: string[];
  
  /** Total number of targets */
  targetCount: number;
  
  /** Expanded node IDs (after group expansion) */
  expandedNodeIds: string[];
}
```

#### BatchStatusResponse Interface

```typescript
/**
 * Response from batch status query
 */
export interface BatchStatusResponse {
  /** Batch execution details */
  batch: BatchExecution;
  
  /** Individual execution details */
  executions: Array<{
    id: string;
    nodeId: string;
    nodeName: string;
    status: "queued" | "running" | "success" | "failed";
    startedAt?: Date;
    completedAt?: Date;
    duration?: number;
    result?: {
      exitCode?: number;
      stdout?: string;
      stderr?: string;
    };
  }>;
  
  /** Progress percentage (0-100) */
  progress: number;
}
```

### Backend Services

#### BatchExecutionService

```typescript
export class BatchExecutionService {
  constructor(
    private db: Database,
    private executionQueue: ExecutionQueue,
    private executionRepository: ExecutionRepository,
    private integrationManager: IntegrationManager
  ) {}
  
  /**
   * Create a batch execution
   */
  async createBatch(
    request: BatchExecutionRequest,
    userId: string
  ): Promise<BatchExecutionResponse>;
  
  /**
   * Get batch execution status
   */
  async getBatchStatus(batchId: string): Promise<BatchStatusResponse>;
  
  /**
   * Cancel a batch execution
   */
  async cancelBatch(batchId: string): Promise<{ cancelledCount: number }>;
  
  /**
   * Expand group IDs to node IDs
   */
  private async expandGroups(groupIds: string[]): Promise<string[]>;
  
  /**
   * Deduplicate node IDs
   */
  private deduplicateNodes(nodeIds: string[]): string[];
  
  /**
   * Validate target nodes exist
   */
  private async validateNodes(nodeIds: string[]): Promise<void>;
}
```

### Database Schema

#### batch_executions Table

```sql
CREATE TABLE IF NOT EXISTS batch_executions (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('command', 'task', 'plan')),
  action TEXT NOT NULL,
  parameters TEXT,  -- JSON object
  target_nodes TEXT NOT NULL,  -- JSON array of node IDs
  target_groups TEXT NOT NULL,  -- JSON array of group IDs
  status TEXT NOT NULL CHECK(status IN ('running', 'success', 'failed', 'partial', 'cancelled')),
  created_at TEXT NOT NULL,  -- ISO 8601 timestamp
  started_at TEXT,  -- ISO 8601 timestamp
  completed_at TEXT,  -- ISO 8601 timestamp
  user_id TEXT NOT NULL,
  execution_ids TEXT NOT NULL,  -- JSON array of execution IDs
  stats_total INTEGER NOT NULL,
  stats_queued INTEGER NOT NULL,
  stats_running INTEGER NOT NULL,
  stats_success INTEGER NOT NULL,
  stats_failed INTEGER NOT NULL
);

-- Indexes for batch executions
CREATE INDEX IF NOT EXISTS idx_batch_executions_created ON batch_executions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_batch_executions_status ON batch_executions(status);
CREATE INDEX IF NOT EXISTS idx_batch_executions_user ON batch_executions(user_id);
```

#### Extended executions Table

```sql
-- Add columns to existing executions table
ALTER TABLE executions ADD COLUMN batch_id TEXT;
ALTER TABLE executions ADD COLUMN batch_position INTEGER;

-- Index for batch queries
CREATE INDEX IF NOT EXISTS idx_executions_batch ON executions(batch_id);
```

### Frontend Components

#### ParallelExecutionModal.svelte

**Props**:

```typescript
interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: (batchId: string) => void;
}
```

**State**:

```typescript
let selectedNodeIds = $state<string[]>([]);
let selectedGroupIds = $state<string[]>([]);
let actionType = $state<"command" | "task" | "plan">("command");
let actionValue = $state<string>("");
let parameters = $state<Record<string, unknown>>({});
let loading = $state<boolean>(false);
let error = $state<string | null>(null);
```

**Methods**:

- `handleNodeSelection(nodeId: string)`: Toggle node selection
- `handleGroupSelection(groupId: string)`: Toggle group selection
- `handleSubmit()`: Validate and submit batch execution request
- `getTotalTargetCount()`: Calculate total targets (deduplicated)

#### BatchProgressPanel.svelte

**Props**:

```typescript
interface Props {
  batchId: string;
  onComplete: () => void;
}
```

**State**:

```typescript
let batchStatus = $state<BatchStatusResponse | null>(null);
let polling = $state<boolean>(true);
let pollingInterval = $state<number>(2000);
let filterStatus = $state<"all" | "running" | "success" | "failed">("all");
```

**Methods**:

- `startPolling()`: Begin polling for status updates
- `stopPolling()`: Stop polling when complete
- `handleCancel()`: Cancel remaining executions
- `getFilteredExecutions()`: Filter executions by status

#### AggregatedResultsView.svelte

**Props**:

```typescript
interface Props {
  batchId: string;
}
```

**State**:

```typescript
let batchStatus = $state<BatchStatusResponse | null>(null);
let expandedExecutionIds = $state<Set<string>>(new Set());
let sortBy = $state<"nodeName" | "status" | "duration">("nodeName");
let sortOrder = $state<"asc" | "desc">("asc");
let filterStatus = $state<"all" | "success" | "failed">("all");
```

**Methods**:

- `toggleExpanded(executionId: string)`: Expand/collapse execution details
- `handleExport(format: "json" | "csv")`: Export results
- `getSortedExecutions()`: Sort executions by selected field
- `getFilteredExecutions()`: Filter executions by status

### API Endpoints

#### POST /api/executions/batch

**Request Body**:

```typescript
{
  targetNodeIds?: string[];
  targetGroupIds?: string[];
  type: "command" | "task" | "plan";
  action: string;
  parameters?: Record<string, unknown>;
}
```

**Response** (201 Created):

```typescript
{
  batchId: string;
  executionIds: string[];
  targetCount: number;
  expandedNodeIds: string[];
}
```

**Error Responses**:

- 400 Bad Request: Invalid request body or validation errors
- 429 Too Many Requests: Execution queue is full
- 500 Internal Server Error: Server error

#### GET /api/executions/batch/:batchId

**Query Parameters**:

- `status`: Filter by execution status (optional)

**Response** (200 OK):

```typescript
{
  batch: BatchExecution;
  executions: Array<{
    id: string;
    nodeId: string;
    nodeName: string;
    status: string;
    startedAt?: Date;
    completedAt?: Date;
    duration?: number;
    result?: {
      exitCode?: number;
      stdout?: string;
      stderr?: string;
    };
  }>;
  progress: number;
}
```

**Error Responses**:

- 404 Not Found: Batch ID does not exist
- 500 Internal Server Error: Server error

#### POST /api/executions/batch/:batchId/cancel

**Response** (200 OK):

```typescript
{
  batchId: string;
  cancelledCount: number;
  message: string;
}
```

**Error Responses**:

- 404 Not Found: Batch ID does not exist
- 500 Internal Server Error: Server error

## Data Models

### Group Expansion Logic

The backend expands group IDs to individual node IDs before creating executions:

```typescript
async expandGroups(groupIds: string[]): Promise<string[]> {
  const nodeIds: string[] = [];
  
  for (const groupId of groupIds) {
    try {
      // Fetch group from inventory
      const inventory = await this.integrationManager.getAggregatedInventory();
      const group = inventory.groups.find(g => g.id === groupId);
      
      if (!group) {
        logger.warn(`Group ${groupId} not found, skipping`);
        continue;
      }
      
      // Add all node IDs from the group
      nodeIds.push(...group.nodes);
    } catch (error) {
      logger.error(`Failed to expand group ${groupId}:`, error);
      // Continue with other groups
    }
  }
  
  return nodeIds;
}
```

### Node Deduplication

When multiple groups contain the same node, or when both individual nodes and groups are selected, the backend deduplicates node IDs:

```typescript
deduplicateNodes(nodeIds: string[]): string[] {
  return [...new Set(nodeIds)];
}
```

### Batch Status Aggregation

The backend aggregates individual execution statuses to determine batch status:

```typescript
function aggregateBatchStatus(executions: ExecutionRecord[]): BatchExecution['status'] {
  const statuses = executions.map(e => e.status);
  
  // If any running, batch is running
  if (statuses.some(s => s === 'running')) {
    return 'running';
  }
  
  // If all success, batch is success
  if (statuses.every(s => s === 'success')) {
    return 'success';
  }
  
  // If all failed, batch is failed
  if (statuses.every(s => s === 'failed')) {
    return 'failed';
  }
  
  // Mixed results = partial
  return 'partial';
}
```

### Execution Queue Integration

Each individual execution is enqueued through the existing ExecutionQueue service:

```typescript
async createBatch(request: BatchExecutionRequest, userId: string): Promise<BatchExecutionResponse> {
  // Expand groups and deduplicate
  const groupNodeIds = await this.expandGroups(request.targetGroupIds || []);
  const allNodeIds = this.deduplicateNodes([
    ...(request.targetNodeIds || []),
    ...groupNodeIds
  ]);
  
  // Validate nodes exist
  await this.validateNodes(allNodeIds);
  
  // Create batch record
  const batchId = generateId();
  const executionIds: string[] = [];
  
  // Create individual execution records
  for (let i = 0; i < allNodeIds.length; i++) {
    const nodeId = allNodeIds[i];
    const executionId = generateId();
    
    await this.executionRepository.create({
      id: executionId,
      type: request.type,
      targetNodes: [nodeId],
      action: request.action,
      parameters: request.parameters,
      status: 'running',
      startedAt: new Date(),
      results: [],
      batchId,
      batchPosition: i
    });
    
    executionIds.push(executionId);
    
    // Enqueue through ExecutionQueue
    await this.executionQueue.acquire({
      id: executionId,
      type: request.type,
      nodeId,
      action: request.action,
      enqueuedAt: new Date()
    });
  }
  
  // Create batch record
  await this.createBatchRecord({
    id: batchId,
    type: request.type,
    action: request.action,
    parameters: request.parameters,
    targetNodes: allNodeIds,
    targetGroups: request.targetGroupIds || [],
    status: 'running',
    createdAt: new Date(),
    userId,
    executionIds,
    stats: {
      total: allNodeIds.length,
      queued: allNodeIds.length,
      running: 0,
      success: 0,
      failed: 0
    }
  });
  
  return {
    batchId,
    executionIds,
    targetCount: allNodeIds.length,
    expandedNodeIds: allNodeIds
  };
}
```

### Database Queries

#### Fetch Batch with Executions

```sql
-- Get batch execution
SELECT * FROM batch_executions WHERE id = ?;

-- Get all executions for batch
SELECT * FROM executions WHERE batch_id = ? ORDER BY batch_position ASC;
```

#### Update Batch Statistics

```sql
UPDATE batch_executions
SET 
  stats_queued = ?,
  stats_running = ?,
  stats_success = ?,
  stats_failed = ?,
  status = ?,
  started_at = ?,
  completed_at = ?
WHERE id = ?;
```

#### Cancel Batch Executions

```sql
-- Mark queued executions as cancelled
UPDATE executions
SET status = 'failed', error = 'Cancelled by user', completed_at = ?
WHERE batch_id = ? AND status = 'running';
```
