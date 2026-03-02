# Bug: Batch Executions Not Actually Executing Actions

## Status

✅ **FIXED**

## Description

Bolt commands that work correctly when executed from the node detail page fail when executed in parallel/batch executions. The executions remain in "running" state indefinitely and never complete.

## Root Cause

The `BatchExecutionService.createBatch()` method was missing the critical step of actually executing the actions after acquiring queue slots.

**What was happening:**

1. Execution records were created with status "running"
2. Queue slots were acquired via `executionQueue.acquire()`
3. ❌ **Nothing actually executed the action**
4. Executions remained stuck in "running" state forever

**What should happen (like single-node execution):**

1. Create execution record
2. Acquire queue slot
3. ✅ **Execute the action asynchronously via IntegrationManager**
4. Update execution record with results
5. Release queue slot

## Fix Applied

Added a new private method `executeAction()` to `BatchExecutionService` that:

- Executes the action through `IntegrationManager.executeAction()`
- Updates the execution record with results
- Handles errors and updates execution status
- Always releases the queue slot in a `finally` block

Modified `createBatch()` to call `executeAction()` asynchronously after acquiring each queue slot:

```typescript
await this.executionQueue.acquire({
  id: executionId,
  type: request.type,
  nodeId,
  action: request.action,
  enqueuedAt: new Date(),
});

// Step 6: Execute action asynchronously after acquiring queue slot
void this.executeAction(executionId, nodeId, request);
```

## Files Changed

- `pabawi/backend/src/services/BatchExecutionService.ts`
  - Added `executeAction()` private method
  - Modified `createBatch()` to call `executeAction()` after queue acquisition
  - Updated step numbering in comments

- `pabawi/backend/test/services/BatchExecutionService.test.ts`
  - Added `release` method to mock executionQueue
  - Added `update` method to mock executionRepository
  - Added `executeAction` method to mock integrationManager

## Testing

All 33 tests in `BatchExecutionService.test.ts` pass successfully.

## Impact

This fix ensures that batch/parallel executions actually execute the requested actions instead of hanging indefinitely. Bolt commands, tasks, and other actions will now complete properly in batch execution mode.
