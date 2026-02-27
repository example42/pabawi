# Implementation Plan: Parallel Execution UI

## Overview

This implementation plan covers the development of multi-node and group-based parallel execution capabilities for the Pabawi executions page. The feature includes backend batch execution APIs, database schema extensions, frontend components for target selection and progress monitoring, and integration with the existing ExecutionQueue service.

## Tasks

- [ ] 1. Set up database schema and migrations
  - Create batch_executions table with indexes
  - Add batch_id and batch_position columns to executions table
  - Create database migration script
  - _Requirements: 5.4, 5.5, 11.4_

- [ ] 2. Implement BatchExecutionService core functionality
  - [ ] 2.1 Create BatchExecutionService class with constructor and dependencies
    - Set up service with Database, ExecutionQueue, ExecutionRepository, IntegrationManager dependencies
    - _Requirements: 5.1, 7.1_
  
  - [ ] 2.2 Implement group expansion logic
    - Write expandGroups method to fetch groups from inventory and extract node IDs
    - Handle linked groups (multiple sources)
    - Add error handling for missing groups
    - _Requirements: 7.2, 7.3, 7.4, 7.6_
  
  - [ ] 2.3 Implement node deduplication and validation
    - Write deduplicateNodes method using Set
    - Write validateNodes method to verify node IDs exist in inventory
    - _Requirements: 7.5, 7.8, 7.10_
  
  - [ ] 2.4 Implement createBatch method
    - Expand groups and deduplicate nodes
    - Create batch execution record in database
    - Create individual execution records for each target
    - Enqueue executions through ExecutionQueue
    - Handle queue capacity errors
    - _Requirements: 5.3, 5.4, 5.5, 5.6, 5.7_
  
  - [ ] 2.5 Implement getBatchStatus method
    - Fetch batch record and associated executions
    - Aggregate execution statistics
    - Calculate progress percentage
    - Support status filtering
    - _Requirements: 6.2, 6.3, 6.4, 6.8_
  
  - [ ] 2.6 Implement cancelBatch method
    - Cancel queued executions
    - Attempt to stop running executions
    - Update batch status to cancelled
    - Return cancelled count
    - _Requirements: 8.3, 8.4, 8.5, 8.6_

- [ ]* 2.7 Write unit tests for BatchExecutionService
  - Test group expansion with various inputs
  - Test node deduplication
  - Test batch creation and status aggregation
  - Test cancellation logic
  - _Requirements: 15.2, 15.3_

- [ ] 3. Implement batch execution API endpoints
  - [ ] 3.1 Create POST /api/executions/batch endpoint
    - Validate request body (targetNodeIds, targetGroupIds, action)
    - Call BatchExecutionService.createBatch
    - Handle validation errors (400), queue full errors (429)
    - Return batch ID and execution IDs
    - Add logging for batch creation
    - _Requirements: 5.1, 5.2, 5.8, 5.9, 5.10, 12.1_
  
  - [ ] 3.2 Create GET /api/executions/batch/:batchId endpoint
    - Validate batch ID exists
    - Call BatchExecutionService.getBatchStatus
    - Support status query parameter for filtering
    - Handle not found errors (404)
    - _Requirements: 6.1, 6.2, 6.6, 6.7_
  
  - [ ] 3.3 Create POST /api/executions/batch/:batchId/cancel endpoint
    - Validate batch ID exists
    - Call BatchExecutionService.cancelBatch
    - Return cancelled count
    - Add logging for cancellation
    - _Requirements: 8.2, 8.9_

- [ ]* 3.4 Write integration tests for batch execution endpoints
  - Test end-to-end batch creation and status flow
  - Test error handling scenarios
  - Test cancellation workflow
  - _Requirements: 15.3_

- [ ] 4. Checkpoint - Ensure backend tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. Implement ParallelExecutionModal component
  - [ ] 5.1 Create ParallelExecutionModal.svelte with basic structure
    - Set up modal dialog with open/close props
    - Create state for selected nodes, groups, action type, and parameters
    - Add loading and error state management
    - _Requirements: 1.1, 9.2_
  
  - [ ] 5.2 Implement target selection UI
    - Fetch nodes and groups from inventory API
    - Display nodes and groups with checkboxes for multi-select
    - Implement search and filtering by name and source
    - Add "select all" and "clear all" buttons
    - Display total selected target count (deduplicated)
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.9_
  
  - [ ] 5.3 Implement action configuration UI
    - Add action type selector (command/task/plan)
    - Add action input field
    - Add parameters input (JSON or form fields)
    - Enable execution button only when targets and action are selected
    - _Requirements: 2.1, 2.2_
  
  - [ ] 5.4 Implement execution initiation
    - Validate selections and action
    - Send POST request to /api/executions/batch
    - Handle success response (display batch ID, call onSuccess)
    - Handle error responses (display error messages)
    - _Requirements: 2.3, 2.9, 2.10, 10.1, 10.2_
  
  - [ ] 5.5 Add accessibility and responsiveness
    - Implement keyboard navigation for all controls
    - Add ARIA labels for screen readers
    - Make layout responsive for mobile/tablet/desktop
    - Add focus management
    - _Requirements: 14.1, 14.2, 14.3, 14.6_

- [ ]* 5.6 Write component tests for ParallelExecutionModal
  - Test target selection and deduplication
  - Test action configuration
  - Test execution initiation flow
  - _Requirements: 15.4_

- [ ] 6. Implement BatchProgressPanel component
  - [ ] 6.1 Create BatchProgressPanel.svelte with polling logic
    - Set up component with batchId prop
    - Implement polling with exponential backoff (2s → 4s → 8s)
    - Fetch batch status from GET /api/executions/batch/:batchId
    - Stop polling when all executions complete
    - _Requirements: 3.1, 3.6, 11.5_
  
  - [ ] 6.2 Implement progress display
    - Show total targets and current status counts (queued/running/completed/failed)
    - Display progress bar with percentage
    - List all target nodes with individual status indicators
    - Show execution duration for completed targets
    - _Requirements: 3.2, 3.3, 3.4, 3.7_
  
  - [ ] 6.3 Implement status filtering and cancellation
    - Add filter dropdown for status (all/running/success/failed)
    - Add cancel button to stop remaining executions
    - Send POST request to /api/executions/batch/:batchId/cancel
    - Display completion summary when all executions finish
    - _Requirements: 3.8, 3.9, 3.10, 8.1, 8.7_
  
  - [ ] 6.4 Add accessibility features
    - Use semantic HTML for status indicators
    - Add ARIA labels and live regions for status updates
    - Support keyboard navigation
    - Use color and icons together for status
    - _Requirements: 14.4, 14.5, 14.8, 14.10_

- [ ]* 6.5 Write component tests for BatchProgressPanel
  - Test polling behavior and backoff
  - Test status updates and filtering
  - Test cancellation flow
  - _Requirements: 15.5, 15.9_

- [ ] 7. Implement AggregatedResultsView component
  - [ ] 7.1 Create AggregatedResultsView.svelte with data fetching
    - Set up component with batchId prop
    - Fetch batch status from API
    - Display summary statistics (total/success/failed counts)
    - _Requirements: 4.1, 4.2_
  
  - [ ] 7.2 Implement results list with expand/collapse
    - Display list of all target executions
    - Show node name, status, and duration for each
    - Implement expand/collapse for detailed output (stdout/stderr/exit code)
    - Highlight failed executions with visual indicators
    - _Requirements: 4.3, 4.4, 4.7_
  
  - [ ] 7.3 Implement sorting and filtering
    - Add sort controls for node name, status, and duration
    - Add filter dropdown for status (all/success/failed)
    - Implement sorting and filtering logic
    - _Requirements: 4.5, 4.6_
  
  - [ ] 7.4 Implement export functionality
    - Add export button with format selection (JSON/CSV)
    - Generate JSON export with full execution details
    - Generate CSV export with summary data
    - Trigger download in browser
    - _Requirements: 4.8_
  
  - [ ] 7.5 Add success/failure messaging
    - Display success message when all executions succeed
    - Display warning message with failure count when any fail
    - _Requirements: 4.9, 4.10_
  
  - [ ] 7.6 Add accessibility features
    - Support keyboard navigation for expand/collapse
    - Use semantic HTML and ARIA labels
    - Support high contrast mode
    - _Requirements: 14.5, 14.9_

- [ ]* 7.7 Write component tests for AggregatedResultsView
  - Test results display and expansion
  - Test sorting and filtering
  - Test export functionality
  - _Requirements: 15.5_

- [ ] 8. Checkpoint - Ensure frontend component tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 9. Integrate components into ExecutionsPage
  - [ ] 9.1 Add "New Parallel Execution" button to ExecutionsPage
    - Add button to page header
    - Open ParallelExecutionModal on click
    - _Requirements: 9.1, 9.2_
  
  - [ ] 9.2 Update executions list to display batch executions
    - Add batch indicator to execution list items
    - Display batch summary (e.g., "5/10 targets completed")
    - Support filtering by execution type (single/batch)
    - _Requirements: 9.3, 9.5, 9.6_
  
  - [ ] 9.3 Implement batch execution detail view
    - Show AggregatedResultsView when clicking batch execution
    - Support navigation to individual execution details
    - Display batch execution duration (first start to last completion)
    - _Requirements: 9.4, 9.9, 9.10_
  
  - [ ] 9.4 Maintain existing single-node execution functionality
    - Ensure existing execution flows work unchanged
    - Reuse StatusBadge and ExecutionList components
    - _Requirements: 9.7, 9.8_

- [ ] 10. Implement performance optimizations
  - [ ] 10.1 Add virtual scrolling to target selector
    - Implement virtual scrolling for lists with >100 items
    - _Requirements: 11.1_
  
  - [ ] 10.2 Add debounced search to target selector
    - Implement debounced search input (300ms delay)
    - _Requirements: 11.2_
  
  - [ ] 10.3 Add pagination to batch status API
    - Support page and pageSize query parameters
    - Return pagination metadata
    - _Requirements: 11.3_
  
  - [ ] 10.4 Add batch size validation
    - Validate batch size does not exceed 1000 targets
    - Return validation error if limit exceeded
    - _Requirements: 11.6, 11.7_
  
  - [ ] 10.5 Implement inventory data caching
    - Cache inventory data with appropriate TTL
    - _Requirements: 11.10_

- [ ] 11. Implement error handling and validation
  - [ ] 11.1 Add frontend validation
    - Disable execution button when no targets selected
    - Display inline validation errors
    - Show queue full errors with current status
    - _Requirements: 10.1, 10.2, 10.7_
  
  - [ ] 11.2 Add backend error handling
    - Handle invalid node IDs with descriptive errors
    - Handle group expansion failures gracefully
    - Mark unavailable nodes as failed with error message
    - Implement retry logic for network errors
    - _Requirements: 10.3, 10.4, 10.5, 10.6_
  
  - [ ] 11.3 Add error display in results
    - Display execution errors in AggregatedResultsView
    - Show partial failure warnings
    - Include error stack traces in debug mode
    - _Requirements: 10.8, 10.9, 10.10_

- [ ] 12. Implement logging and audit trail
  - [ ] 12.1 Add batch execution logging
    - Log batch creation with user ID, batch ID, target count, action type
    - Log individual execution start and completion
    - Log batch cancellation events
    - Include batch ID in all execution log entries
    - _Requirements: 12.1, 12.2, 12.3, 12.4_
  
  - [ ] 12.2 Add operational logging
    - Log group expansion with group ID and node count
    - Log execution queue status on batch enqueue
    - Log validation errors with request details
    - Log execution duration in completion entries
    - Log failed executions with error details
    - _Requirements: 12.5, 12.6, 12.7, 12.8, 12.9_
  
  - [ ] 12.3 Add log filtering support
    - Support filtering logs by batch ID
    - _Requirements: 12.10_

- [ ] 13. Integrate with SSH service for execution
  - [ ] 13.1 Use SSHService.executeOnMultipleHosts for SSH targets
    - Call executeOnMultipleHosts for SSH transport targets
    - Respect SSH service concurrency limits
    - Handle SSH connection errors with retry logic
    - Collect and store results from executeOnMultipleHosts
    - _Requirements: 13.1, 13.2, 13.3, 13.4_
  
  - [ ] 13.2 Support mixed transport types
    - Handle SSH, WinRM, and local transports in single batch
    - Use appropriate integration plugin for non-SSH transports
    - Aggregate results from multiple transport types
    - Include connection metadata in results
    - Handle SSH timeout errors
    - _Requirements: 13.5, 13.6, 13.7, 13.8, 13.10_
  
  - [ ] 13.3 Add SSH execution logging
    - Log SSH execution details for debugging
    - _Requirements: 13.9_

- [ ] 14. Final integration and testing
  - [ ] 14.1 Create end-to-end test scenarios
    - Test complete flow from target selection to results display
    - Test batch execution with mixed nodes and groups
    - Test cancellation during execution
    - Test error scenarios (queue full, invalid nodes, execution failures)
    - _Requirements: 15.3_
  
  - [ ] 14.2 Test performance with large target sets
    - Test with 100, 500, and 1000 targets
    - Verify virtual scrolling and pagination work correctly
    - Verify polling performance with exponential backoff
    - _Requirements: 11.1, 11.3, 11.5_
  
  - [ ] 14.3 Test concurrent execution limit enforcement
    - Verify ExecutionQueue respects concurrency limits
    - Test queue behavior under load
    - _Requirements: 15.8_

- [ ]* 14.4 Write property-based tests
  - **Property 1: Group expansion produces valid node IDs**
  - **Validates: Requirements 7.2, 7.3, 7.8**
  - Generate random group structures and verify all expanded nodes exist in inventory
  
- [ ]* 14.5 Write property-based tests for deduplication
  - **Property 2: Node deduplication is idempotent**
  - **Validates: Requirements 7.5**
  - Generate random node ID arrays and verify deduplication produces same result when applied multiple times

- [ ]* 14.6 Write property-based tests for batch status aggregation
  - **Property 3: Batch status correctly reflects execution states**
  - **Validates: Requirements 6.3**
  - Generate random execution status combinations and verify batch status aggregation logic

- [ ] 15. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- The implementation leverages existing ExecutionQueue service for concurrency management
- Database schema changes require migration script for existing installations
- Frontend components use Svelte 5 with runes ($state, $derived)
- Backend uses TypeScript with Express framework
