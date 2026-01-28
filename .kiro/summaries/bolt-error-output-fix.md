# Bolt Task Error Output Fix

## Problem

When Bolt tasks failed, the UI only showed a generic error message like "Bolt command failed with exit code 1" instead of the detailed error information that Bolt actually returns. The detailed output (like "Permission denied" errors) was being lost.

## Root Cause

When Bolt executes a task that fails, it returns JSON output with different structures depending on the type of failure:

**Case 1: Task execution failure with output**

```json
{
  "items": [{
    "target": "node-name",
    "status": "failure",
    "value": {
      "_output": "/tmp/xxx/script.sh: line 8: /usr/local/bin/tp: Permission denied\n",
      "_error": {
        "kind": "puppetlabs.tasks/task-error",
        "issue_code": "TASK_ERROR",
        "msg": "The task failed with exit code 126",
        "details": {
          "exit_code": 126
        }
      }
    }
  }]
}
```

**Case 2: Connection/copy failure (no output)**

```json
{
  "items": [{
    "target": "node-name",
    "status": "failure",
    "value": {
      "_error": {
        "kind": "puppetlabs.tasks/task_file_error",
        "issue_code": "COPY_ERROR",
        "msg": "Could not copy file to /tmp/xxx/info.sh: scp: Connection closed\r\n",
        "details": {}
      }
    }
  }]
}
```

The `transformTaskOutput` method in `BoltService.ts` was only extracting the error message from the `_error` object but:

1. Completely ignoring the `_output` field which contains the actual command output
2. Not displaying the error message as output when there's no `_output` field

## Solution

### Backend Changes (`backend/src/bolt/BoltService.ts`)

Modified the `transformTaskOutput` method to:

1. **Extract `_output` field**: When a task fails, extract the `_output` field from the `value` object and store it in `nodeResult.output.stdout`

2. **Extract exit code**: Extract the exit code from `_error.details.exit_code` and store it in `nodeResult.output.exitCode`

3. **Build comprehensive error message**: Combine the error message from `_error.msg` with the actual output from `_output` to provide complete context:
   - Include the error kind/type (e.g., `puppetlabs.tasks/task_file_error`)
   - Include the error message
   - Append the exit code (if available)
   - Include the full output text (if available)

4. **Display error as output when no _output field**: For errors like connection failures where there's no command output, display the error message itself as output so users can see it in the output section

5. **Handle edge cases**:
   - Tasks with only `_output` (no `_error` object)
   - Tasks with only `_error` (no `_output` field) - connection errors, copy errors, etc.
   - Successful tasks (no changes needed)

### Frontend Changes

#### 1. TaskRunInterface (`frontend/src/components/TaskRunInterface.svelte`)

Enhanced the execution result display to show:

- **Output section**: Display `result.output.stdout` and `result.output.stderr` separately with proper formatting
- **Exit code**: Show the exit code when available
- **Error message**: Display the comprehensive error message that now includes the output

#### 2. ExecutionsPage (`frontend/src/pages/ExecutionsPage.svelte`)

Updated the execution detail modal to show **both** error and output:

- Changed from `if/else` logic to show error OR output
- Now shows error message first (if present)
- Then shows the output section (if present)
- Both are displayed together for failed tasks, providing complete context

#### 3. NodeDetailPage (`frontend/src/pages/NodeDetailPage.svelte`)

Updated the command execution result display:

- Shows error message first (if present)
- Then shows the output (if present)
- Both are displayed together for failed executions

### Tests (`backend/test/bolt/BoltService.test.ts`)

Added comprehensive tests covering:

1. Failed task with both `_output` and `_error` (task execution failure with output)
2. Failed task with only `_output` (no `_error` object)
3. Failed task with only `_error` (connection/copy errors with no output)
4. Successful task (regression test)

All tests verify that:

- Output is correctly extracted to `nodeResult.output.stdout`
- Exit code is correctly extracted to `nodeResult.output.exitCode`
- Error message includes the error kind, message, and output
- Error messages are displayed as output when there's no `_output` field

## Impact

Users will now see the full error details when Bolt tasks fail in **all views**:

### Task Execution Interface

- Error message with full context
- Separate output section showing stdout/stderr
- Exit code display

### Execution Detail Modal

- Error message displayed prominently
- Output section shown below the error
- Both visible simultaneously for complete debugging context

### Node Detail Page

- Command execution results show both error and output
- Consistent display across all execution types

This makes debugging task failures much easier and provides the same level of detail as running the Bolt command directly from the CLI.

## Testing

Run the BoltService tests:

```bash
cd backend
npm test BoltService.test.ts
```

All 36 tests should pass, including the 4 new tests for error output extraction.

Build the frontend to verify all components compile:

```bash
cd frontend
npm run build
```

## Example Outputs

### Case 1: Task Execution Failure (with output)

Before this fix:

```
Error: Bolt command failed with exit code 1
```

After this fix:

```
Error: [puppetlabs.tasks/task-error] The task failed with exit code 126 (exit code 126)

Output:
/tmp/67760305-a3b1-42c1-846a-ef5fd2ba6f72/info.sh: line 8: /usr/local/bin/tp: Permission denied

Exit code: 126
```

### Case 2: Connection/Copy Failure (no output)

Before this fix:

```
Error: Bolt command failed with exit code 1
```

After this fix:

```
Error: [puppetlabs.tasks/task_file_error] Could not copy file to /tmp/580bed87-238f-487b-b4e5-75c0d7e0b690/info.sh: scp: Connection closed

Output:
[puppetlabs.tasks/task_file_error] Could not copy file to /tmp/580bed87-238f-487b-b4e5-75c0d7e0b690/info.sh: scp: Connection closed
```
