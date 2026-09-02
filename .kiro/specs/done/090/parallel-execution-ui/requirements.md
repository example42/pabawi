# Requirements Document: Parallel Execution UI

## Introduction

This feature extends the Pabawi executions page to support multi-node and group-based parallel execution. Users will be able to select multiple nodes or entire groups from the inventory and execute actions (commands, tasks, plans) on all selected targets simultaneously. The feature leverages existing backend infrastructure (ExecutionQueue service with concurrent execution limiting and SSH integration's executeOnMultipleHosts) while adding comprehensive UI capabilities for target selection, execution initiation, real-time progress monitoring, and aggregated results display.

## Glossary

- **Execution_Page**: The frontend page at /executions that displays execution history and provides execution controls
- **Inventory_System**: The backend and frontend components that manage nodes and groups from multiple integration sources (Bolt, Ansible, PuppetDB, SSH)
- **Node_Group**: A collection of nodes defined in integration sources, with properties including id, name, source, and member nodes
- **Target_Selector**: UI component that allows users to select multiple nodes or groups for parallel execution
- **Execution_Queue**: Backend service that manages concurrent execution limits (default: 5 concurrent executions)
- **Parallel_Execution**: Execution of an action on multiple targets simultaneously, subject to concurrency limits
- **Aggregated_Results**: Combined results from all target executions, showing success/failure counts and individual node outcomes
- **Real_Time_Progress**: Live updates of execution status as actions complete on individual targets
- **Action**: A command, task, or plan to be executed on target nodes
- **Target**: A node or group selected for execution

## Requirements

### Requirement 1: Target Selection UI

**User Story:** As a user, I want to select multiple nodes or entire groups from the inventory, so that I can execute actions on all selected targets at once.

#### Acceptance Criteria

1. THE Execution_Page SHALL display a Target_Selector component with access to the Inventory_System
2. WHEN a user opens the Target_Selector, THE Target_Selector SHALL fetch and display all available nodes and groups from the Inventory_System
3. THE Target_Selector SHALL support multi-select for individual nodes with checkboxes or similar UI controls
4. THE Target_Selector SHALL support group selection where selecting a group automatically includes all member nodes
5. WHEN a user selects a Node_Group, THE Target_Selector SHALL expand the group to show all member nodes
6. THE Target_Selector SHALL display the total count of selected targets (deduplicated nodes)
7. THE Target_Selector SHALL support search and filtering by node name, group name, and source
8. THE Target_Selector SHALL preserve selection state when switching between nodes and groups views
9. THE Target_Selector SHALL support "select all" and "clear all" operations
10. WHEN a node appears in multiple selected groups, THE Target_Selector SHALL deduplicate the node in the final target list

### Requirement 2: Execution Initiation

**User Story:** As a user, I want to initiate parallel execution on selected targets, so that I can run actions across my infrastructure efficiently.

#### Acceptance Criteria

1. WHEN at least one target is selected, THE Execution_Page SHALL enable the execution initiation button
2. THE Execution_Page SHALL provide input fields for action type (command, task, plan) and action parameters
3. WHEN a user initiates execution, THE Execution_Page SHALL send a request to the backend with the list of target node IDs and action details
4. THE Backend SHALL create individual execution records for each target node
5. THE Backend SHALL enqueue all target executions through the Execution_Queue service
6. THE Execution_Queue SHALL respect the configured concurrent execution limit when processing parallel executions
7. WHEN the execution queue is full, THE Backend SHALL return an error message indicating queue capacity
8. THE Backend SHALL return a batch execution ID that groups all related target executions
9. WHEN execution initiation succeeds, THE Execution_Page SHALL display a success message with the batch execution ID
10. WHEN execution initiation fails, THE Execution_Page SHALL display an error message with failure details

### Requirement 3: Real-Time Progress Monitoring

**User Story:** As a user, I want to see real-time progress of parallel executions, so that I can monitor which targets have completed and which are still running.

#### Acceptance Criteria

1. WHEN a parallel execution is initiated, THE Execution_Page SHALL display a progress monitoring panel
2. THE Progress_Panel SHALL show the total number of targets and current execution status (queued, running, completed, failed)
3. THE Progress_Panel SHALL display a progress bar indicating the percentage of completed executions
4. THE Progress_Panel SHALL list all target nodes with individual status indicators (queued, running, success, failed)
5. WHEN an execution completes on a target, THE Progress_Panel SHALL update that target's status in real-time
6. THE Progress_Panel SHALL use polling or streaming to fetch execution status updates from the backend
7. THE Progress_Panel SHALL display execution duration for each completed target
8. THE Progress_Panel SHALL support filtering the target list by status (all, running, success, failed)
9. WHEN all target executions complete, THE Progress_Panel SHALL display a completion summary
10. THE Progress_Panel SHALL provide a button to cancel all remaining queued or running executions

### Requirement 4: Aggregated Results Display

**User Story:** As a user, I want to view aggregated results from all target executions, so that I can quickly assess the overall outcome and identify failures.

#### Acceptance Criteria

1. WHEN parallel executions complete, THE Execution_Page SHALL display an Aggregated_Results panel
2. THE Aggregated_Results SHALL show summary statistics (total targets, successful, failed, partial)
3. THE Aggregated_Results SHALL display a list of all target executions with their individual results
4. WHEN a user clicks on a target result, THE Execution_Page SHALL expand to show detailed output (stdout, stderr, exit code)
5. THE Aggregated_Results SHALL support sorting by node name, status, or duration
6. THE Aggregated_Results SHALL support filtering by status (success, failed)
7. THE Aggregated_Results SHALL highlight failed executions with visual indicators (red color, error icon)
8. THE Aggregated_Results SHALL provide an export button to download results as JSON or CSV
9. WHEN all executions succeed, THE Aggregated_Results SHALL display a success message
10. WHEN any execution fails, THE Aggregated_Results SHALL display a warning message with failure count

### Requirement 5: Backend Batch Execution API

**User Story:** As a developer, I want a backend API endpoint for batch execution, so that the frontend can initiate parallel executions on multiple targets.

#### Acceptance Criteria

1. THE Backend SHALL provide a POST /api/executions/batch endpoint
2. WHEN the endpoint receives a request, THE Backend SHALL validate the request body contains targetNodeIds array and action details
3. THE Backend SHALL verify all target node IDs exist in the Inventory_System
4. THE Backend SHALL create a batch execution record with a unique batch ID
5. THE Backend SHALL create individual execution records for each target node, linked to the batch ID
6. THE Backend SHALL enqueue all executions through the Execution_Queue service
7. WHEN the queue has insufficient capacity, THE Backend SHALL return a 429 status code with queue status information
8. WHEN validation fails, THE Backend SHALL return a 400 status code with validation error details
9. WHEN batch creation succeeds, THE Backend SHALL return a 201 status code with the batch ID and execution IDs
10. THE Backend SHALL log batch execution creation with batch ID, target count, and action type

### Requirement 6: Backend Batch Status API

**User Story:** As a developer, I want a backend API endpoint to query batch execution status, so that the frontend can display real-time progress.

#### Acceptance Criteria

1. THE Backend SHALL provide a GET /api/executions/batch/:batchId endpoint
2. WHEN the endpoint receives a request, THE Backend SHALL fetch all executions associated with the batch ID
3. THE Backend SHALL return aggregated status including total count, running count, success count, failed count
4. THE Backend SHALL return individual execution status for each target node
5. THE Backend SHALL include execution duration for completed executions
6. THE Backend SHALL support query parameters for filtering by status
7. WHEN the batch ID does not exist, THE Backend SHALL return a 404 status code
8. THE Backend SHALL return results sorted by node name by default
9. THE Backend SHALL include timestamps for startedAt and completedAt for each execution
10. THE Backend SHALL calculate and return overall batch progress percentage

### Requirement 7: Group Expansion Logic

**User Story:** As a developer, I want backend logic to expand groups into individual nodes, so that parallel execution can target all group members.

#### Acceptance Criteria

1. THE Backend SHALL provide a function to expand group IDs into node IDs
2. WHEN the function receives a group ID, THE Backend SHALL fetch the group from the Inventory_System
3. THE Backend SHALL extract all node IDs from the group's nodes array
4. WHEN a group is linked (exists in multiple sources), THE Backend SHALL include nodes from all sources
5. THE Backend SHALL deduplicate node IDs when multiple groups contain the same node
6. WHEN a group ID does not exist, THE Backend SHALL log a warning and skip that group
7. THE Backend SHALL support mixed input of node IDs and group IDs
8. THE Backend SHALL return a deduplicated array of node IDs
9. THE Backend SHALL preserve node metadata (name, source) for display purposes
10. THE Backend SHALL validate that expanded node IDs exist in the Inventory_System

### Requirement 8: Execution Cancellation

**User Story:** As a user, I want to cancel all remaining executions in a batch, so that I can stop parallel execution if I detect an issue.

#### Acceptance Criteria

1. THE Execution_Page SHALL provide a cancel button in the Progress_Panel
2. WHEN a user clicks cancel, THE Execution_Page SHALL send a POST request to /api/executions/batch/:batchId/cancel
3. THE Backend SHALL cancel all queued executions in the batch
4. THE Backend SHALL attempt to cancel all running executions in the batch
5. THE Backend SHALL update the batch status to "cancelled"
6. THE Backend SHALL return the count of cancelled executions
7. WHEN cancellation succeeds, THE Execution_Page SHALL display a success message with cancelled count
8. WHEN cancellation fails, THE Execution_Page SHALL display an error message
9. THE Backend SHALL log batch cancellation with batch ID and cancelled count
10. THE Progress_Panel SHALL update to reflect cancelled execution statuses

### Requirement 9: UI Integration with Existing Executions Page

**User Story:** As a user, I want parallel execution features integrated into the existing executions page, so that I have a unified interface for all execution types.

#### Acceptance Criteria

1. THE Execution_Page SHALL add a "New Parallel Execution" button in the header
2. WHEN a user clicks the button, THE Execution_Page SHALL open a modal or panel with the Target_Selector
3. THE Execution_Page SHALL display batch executions in the executions list with a batch indicator
4. WHEN a user clicks on a batch execution, THE Execution_Page SHALL show the Aggregated_Results view
5. THE Execution_Page SHALL support filtering executions by type (single, batch)
6. THE Execution_Page SHALL display batch execution summary in the list (e.g., "5/10 targets completed")
7. THE Execution_Page SHALL use existing StatusBadge and ExecutionList components for consistency
8. THE Execution_Page SHALL maintain existing single-node execution functionality
9. THE Execution_Page SHALL support navigation from batch view to individual execution details
10. THE Execution_Page SHALL display batch execution duration as the time from first start to last completion

### Requirement 10: Error Handling and Validation

**User Story:** As a user, I want clear error messages when parallel execution fails, so that I can understand and resolve issues.

#### Acceptance Criteria

1. WHEN no targets are selected, THE Execution_Page SHALL disable the execution button and display a message
2. WHEN the execution queue is full, THE Execution_Page SHALL display an error with current queue status
3. WHEN a target node is unavailable, THE Backend SHALL mark that execution as failed with a descriptive error
4. WHEN network errors occur during execution, THE Backend SHALL retry according to configured retry policy
5. WHEN a target node ID is invalid, THE Backend SHALL return a validation error listing invalid IDs
6. WHEN group expansion fails, THE Backend SHALL log the error and exclude that group from execution
7. THE Execution_Page SHALL display validation errors inline near the relevant input field
8. THE Execution_Page SHALL display execution errors in the Aggregated_Results with error details
9. WHEN partial failures occur, THE Execution_Page SHALL display a warning with success and failure counts
10. THE Backend SHALL include error stack traces in expert mode debug output

### Requirement 11: Performance and Scalability

**User Story:** As a user, I want parallel execution to handle large numbers of targets efficiently, so that I can manage infrastructure at scale.

#### Acceptance Criteria

1. THE Target_Selector SHALL support virtual scrolling for lists with more than 100 items
2. THE Target_Selector SHALL implement debounced search to avoid excessive API calls
3. THE Backend SHALL support pagination for batch execution status queries
4. THE Backend SHALL use database indexes on batch ID and execution status for efficient queries
5. THE Progress_Panel SHALL use polling with exponential backoff to reduce server load
6. THE Backend SHALL limit batch size to a maximum of 1000 targets per batch
7. WHEN batch size exceeds the limit, THE Backend SHALL return a validation error
8. THE Backend SHALL process group expansion asynchronously for large groups
9. THE Execution_Page SHALL display a loading indicator during target selection and execution initiation
10. THE Backend SHALL cache inventory data with appropriate TTL to reduce integration source load

### Requirement 12: Audit and Logging

**User Story:** As an administrator, I want parallel executions logged for audit purposes, so that I can track who executed what on which targets.

#### Acceptance Criteria

1. THE Backend SHALL log batch execution creation with user ID, batch ID, target count, and action type
2. THE Backend SHALL log individual execution start and completion for each target
3. THE Backend SHALL log batch cancellation events with user ID and batch ID
4. THE Backend SHALL include batch ID in all execution log entries for correlation
5. THE Backend SHALL log group expansion with group ID and resulting node count
6. THE Backend SHALL log execution queue status when batch execution is enqueued
7. THE Backend SHALL log validation errors with request details
8. THE Backend SHALL include execution duration in completion log entries
9. THE Backend SHALL log failed executions with error details and stack traces
10. THE Backend SHALL support filtering logs by batch ID for troubleshooting

### Requirement 13: Integration with Existing SSH Service

**User Story:** As a developer, I want to leverage the existing SSH executeOnMultipleHosts method, so that parallel execution uses proven infrastructure.

#### Acceptance Criteria

1. THE Backend SHALL use SSHService.executeOnMultipleHosts for SSH transport targets
2. THE Backend SHALL respect the SSH service's concurrency limit configuration
3. THE Backend SHALL handle SSH connection errors gracefully with retry logic
4. THE Backend SHALL collect results from executeOnMultipleHosts and store them in execution records
5. THE Backend SHALL support mixed transport types (SSH, WinRM, local) in a single batch
6. WHEN a target uses non-SSH transport, THE Backend SHALL use the appropriate integration plugin
7. THE Backend SHALL aggregate results from multiple transport types into unified format
8. THE Backend SHALL include SSH connection metadata in execution results (host, port, user)
9. THE Backend SHALL log SSH execution details for debugging
10. THE Backend SHALL handle SSH timeout errors and mark executions as failed with timeout message

### Requirement 14: UI Responsiveness and Accessibility

**User Story:** As a user, I want the parallel execution UI to be responsive and accessible, so that I can use it on different devices and with assistive technologies.

#### Acceptance Criteria

1. THE Target_Selector SHALL be responsive and usable on mobile, tablet, and desktop screen sizes
2. THE Target_Selector SHALL support keyboard navigation for all interactive elements
3. THE Target_Selector SHALL provide ARIA labels for screen readers
4. THE Progress_Panel SHALL use semantic HTML for status indicators
5. THE Aggregated_Results SHALL support keyboard navigation for expanding result details
6. THE Execution_Page SHALL use focus management to guide users through the execution workflow
7. THE Target_Selector SHALL provide visual feedback for selected targets (checkboxes, highlighting)
8. THE Progress_Panel SHALL use color and icons together to convey status (not color alone)
9. THE Execution_Page SHALL support high contrast mode for accessibility
10. THE Target_Selector SHALL announce selection changes to screen readers

### Requirement 15: Testing and Quality Assurance

**User Story:** As a developer, I want comprehensive tests for parallel execution, so that the feature is reliable and maintainable.

#### Acceptance Criteria

1. THE Backend SHALL have unit tests for batch execution API endpoints
2. THE Backend SHALL have unit tests for group expansion logic
3. THE Backend SHALL have integration tests for end-to-end batch execution flow
4. THE Frontend SHALL have component tests for Target_Selector
5. THE Frontend SHALL have component tests for Progress_Panel and Aggregated_Results
6. THE Backend SHALL have property-based tests for group expansion with random inputs
7. THE Backend SHALL have property-based tests for execution queue behavior under load
8. THE Backend SHALL have tests for concurrent execution limit enforcement
9. THE Frontend SHALL have tests for real-time progress updates
10. THE Backend SHALL have tests for error handling and validation scenarios
