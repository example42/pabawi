# Implementation Plan

## Completed Backend Infrastructure

- [x] 1. Set up plugin architecture and integration foundation
- [x] 1.1 Create integration plugin interfaces and base classes
  - Define IntegrationPlugin, ExecutionToolPlugin, and InformationSourcePlugin interfaces
  - Create base plugin class with common functionality
  - _Requirements: 12.1_

- [x] 1.2 Implement IntegrationManager service
  - Create plugin registration and initialization logic
  - Implement plugin routing and health check aggregation
  - Add multi-source data aggregation methods
  - _Requirements: 12.1, 9.2_

- [x] 1.3 Add integration configuration schema and loading
  - Extend AppConfig schema with integrations section
  - Add PuppetDB configuration schema with SSL and auth options
  - Implement configuration validation
  - _Requirements: 6.1, 6.2, 6.3_

- [x] 2. Implement PuppetDB client and service
- [x] 2.1 Create PuppetDBClient for HTTP communication
  - Implement HTTP client with SSL support
  - Add token-based authentication
  - Implement request/response handling
  - _Requirements: 6.2, 6.3_

- [x] 2.2 Implement retry logic with exponential backoff
  - Create retry wrapper with configurable attempts and delays
  - Add exponential backoff calculation
  - _Requirements: 12.3_

- [x] 2.3 Implement circuit breaker pattern
  - Create CircuitBreaker class with state management
  - Add failure threshold and timeout logic
  - Integrate with PuppetDBClient
  - _Requirements: 12.3_

- [x] 2.4 Create PuppetDBService with plugin interface
  - Implement InformationSourcePlugin interface
  - Add initialization and health check methods
  - _Requirements: 12.1_

- [x] 3. Implement PuppetDB inventory integration
- [x] 3.1 Implement getInventory method in PuppetDBService
  - Query PuppetDB nodes endpoint
  - Transform PuppetDB node data to normalized format
  - Add source attribution
  - _Requirements: 1.1, 1.2, 1.3_

- [x] 3.2 Add PQL query support for inventory filtering
  - Implement PQL query builder
  - Add query validation
  - _Requirements: 1.4, 12.2_

- [x] 3.3 Add inventory caching with TTL
  - Implement cache storage and retrieval
  - Add TTL-based expiration
  - _Requirements: 12.5_

- [x] 3.4 Create API endpoint for PuppetDB inventory
  - Add GET /api/integrations/puppetdb/nodes
  - Add GET /api/integrations/puppetdb/nodes/:certname
  - _Requirements: 1.1_

- [x] 4. Implement PuppetDB facts integration
- [x] 4.1 Implement getNodeFacts method in PuppetDBService
  - Query PuppetDB facts endpoint
  - Transform facts data with categorization
  - Add timestamp and source metadata
  - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [x] 4.2 Add facts caching with TTL
  - Implement per-node facts caching
  - _Requirements: 12.5_

- [x] 4.3 Create API endpoint for PuppetDB facts
  - Add GET /api/integrations/puppetdb/nodes/:certname/facts
  - _Requirements: 2.1_

- [x] 5. Implement PuppetDB reports integration
- [x] 5.1 Implement getNodeReports method in PuppetDBService
  - Query PuppetDB reports endpoint
  - Transform report data with metrics
  - Sort reports in reverse chronological order
  - _Requirements: 3.1, 3.2, 3.3_

- [x] 5.2 Implement getReport method for report details
  - Query specific report by hash
  - Include resource events, logs, and metrics
  - _Requirements: 3.4_

- [x] 5.3 Create API endpoints for PuppetDB reports
  - Add GET /api/integrations/puppetdb/nodes/:certname/reports
  - Add GET /api/integrations/puppetdb/nodes/:certname/reports/:hash
  - _Requirements: 3.1, 3.4_

- [x] 6. Implement PuppetDB catalog integration
- [x] 6.1 Implement getNodeCatalog method in PuppetDBService
  - Query PuppetDB catalog endpoint
  - Transform catalog data with resources
  - Add metadata (timestamp, environment)
  - _Requirements: 4.1, 4.2, 4.5_

- [x] 6.2 Implement getCatalogResources method
  - Extract and organize resources by type
  - Add filtering capabilities
  - _Requirements: 4.3_

- [x] 6.3 Create API endpoints for PuppetDB catalog
  - Add GET /api/integrations/puppetdb/nodes/:certname/catalog
  - _Requirements: 4.1_

- [x] 7. Implement PuppetDB events integration
- [x] 7.1 Implement getNodeEvents method in PuppetDBService
  - Query PuppetDB events endpoint
  - Transform event data
  - Sort events in reverse chronological order
  - _Requirements: 5.1, 5.2, 5.3_

- [x] 7.2 Add event filtering support
  - Implement filters for status, resource type, time range
  - _Requirements: 5.5_

- [x] 7.3 Create API endpoints for PuppetDB events
  - Add GET /api/integrations/puppetdb/nodes/:certname/events
  - _Requirements: 5.1_

## Remaining Backend Tasks

- [x] 8. Implement PuppetDB-specific error classes
- [x] 8.1 Create error class hierarchy
  - Implement PuppetDBConnectionError
  - Implement PuppetDBQueryError
  - Implement PuppetDBAuthenticationError
  - Export from puppetdb/index.ts
  - _Requirements: 6.4_

- [x] 8.2 Update PuppetDBService to use specific error classes
  - Replace generic errors with specific error types
  - Add detailed error messages with context
  - _Requirements: 6.4_

- [x] 9. Enhance ExecutionRepository for re-execution
- [x] 9.1 Add re-execution fields to database schema
  - Add original_execution_id TEXT column
  - Add re_execution_count INTEGER column
  - Create migration script
  - _Requirements: 7.5_

- [x] 9.2 Update ExecutionRecord interface
  - Add originalExecutionId?: string field
  - Add reExecutionCount?: number field
  - _Requirements: 7.5_

- [x] 9.3 Implement findOriginalExecution method
  - Query execution by ID
  - Return ExecutionRecord or null
  - _Requirements: 7.5_

- [x] 9.4 Implement findReExecutions method
  - Query all executions with matching originalExecutionId
  - Return array of ExecutionRecords
  - _Requirements: 7.5_

- [x] 9.5 Implement createReExecution method
  - Create new execution with original reference
  - Increment reExecutionCount
  - Return new execution ID
  - _Requirements: 7.5_

- [x] 10. Implement re-execution API endpoints
- [x] 10.1 Create GET /api/executions/:id/original endpoint
  - Return original execution for re-execution
  - Handle case where execution is not a re-execution
  - _Requirements: 7.2_

- [x] 10.2 Create GET /api/executions/:id/re-executions endpoint
  - Return all re-executions of an execution
  - Return empty array if no re-executions
  - _Requirements: 7.5_

- [x] 10.3 Create POST /api/executions/:id/re-execute endpoint
  - Trigger re-execution with preserved parameters
  - Allow parameter modification via request body
  - Create new execution with original reference
  - _Requirements: 7.2, 7.3, 7.4_

- [x] 11. Implement integration status API
- [x] 11.1 Create GET /api/integrations/status endpoint
  - Return status for all configured integrations
  - Include health check results from IntegrationManager
  - Return connection status, last check time, error details
  - _Requirements: 9.5_

- [x] 11.2 Add health check scheduling (optional enhancement)
  - Implement periodic health checks in background
  - Cache health status with TTL
  - _Requirements: 9.5_

- [x] 12. Enhance expert mode for complete output capture
- [x] 12.1 Add stdout and stderr fields to database schema
  - Add stdout TEXT column
  - Add stderr TEXT column
  - Create migration script
  - _Requirements: 13.4_

- [x] 12.2 Update ExecutionRecord interface
  - Add stdout?: string field
  - Add stderr?: string field
  - _Requirements: 13.4_

- [x] 12.3 Update BoltService to capture complete output
  - Capture full stdout without truncation
  - Capture full stderr without truncation
  - Store in database when expert mode enabled
  - _Requirements: 13.4, 13.8_

- [x] 12.4 Update execution API endpoints
  - Include stdout/stderr in responses when expert mode enabled
  - Add GET /api/executions/:id/output endpoint for full output
  - _Requirements: 13.4_

## Frontend Tasks

- [x] 13. Implement PuppetDB data viewer components
- [x] 13.1 Create ReportViewer component
  - Display report summary with metrics
  - Show resource events with status
  - Highlight failed resources (requirement 3.5)
  - Use consistent styling with StatusBadge
  - _Requirements: 3.3, 3.4, 3.5_

- [x] 13.2 Create CatalogViewer component
  - Display catalog resources organized by type
  - Add search and filter functionality
  - Show resource details on selection
  - Implement collapsible resource type sections
  - _Requirements: 4.2, 4.3, 4.4_

- [x] 13.3 Create EventsViewer component
  - Display events in chronological order
  - Add filtering by status, resource type, time range
  - Highlight failures (requirement 5.4)
  - Use consistent styling
  - _Requirements: 5.2, 5.3, 5.4, 5.5_

- [x] 14. Implement tabbed node detail page
- [x] 14.1 Update NodeDetailPage with tab navigation
  - Implement tabs: Overview, Facts, Execution History, Puppet Reports, Catalog, Events
  - Add tab state management with URL sync
  - Preserve tab selection in browser history
  - _Requirements: 10.1_

- [x] 14.2 Implement lazy loading for tab content
  - Load data only when tab is activated
  - Show loading indicators per tab
  - Cache loaded data to avoid re-fetching
  - _Requirements: 10.3, 10.5_

- [x] 14.3 Add source attribution to all data displays
  - Show source badge for each data section
  - Use consistent badge styling
  - Display "PuppetDB" or "Bolt" as source
  - _Requirements: 10.2_

- [x] 14.4 Integrate PuppetDB viewers into tabs
  - Add Puppet Reports tab with ReportViewer
  - Add Catalog tab with CatalogViewer
  - Add Events tab with EventsViewer
  - Handle loading and error states
  - _Requirements: 3.1, 4.1, 5.1_

- [x] 15. Implement re-execution UI components
- [x] 15.1 Create ReExecutionButton component
  - Add re-execute button with icon
  - Handle click to navigate with pre-filled parameters
  - Show loading state during navigation
  - Disable when execution is running
  - _Requirements: 7.1, 7.2, 8.1, 8.2_

- [x] 15.2 Update ExecutionsPage to show re-execute buttons
  - Add re-execute button to each execution row
  - Implement navigation to appropriate execution interface
  - Pre-fill parameters from original execution
  - _Requirements: 7.1, 7.2_

- [x] 15.3 Update NodeDetailPage to show re-execute buttons
  - Add re-execute button to execution history
  - Set current node as target
  - Pre-fill command/task parameters
  - _Requirements: 8.1, 8.2, 8.4_

- [x] 15.4 Implement parameter pre-filling in execution interfaces
  - Pre-fill command input in CommandRunInterface
  - Pre-fill task selection and parameters in TaskRunInterface
  - Pre-fill target nodes
  - Allow modification before execution
  - _Requirements: 7.3, 7.4_

- [x] 16. Enhance expert mode output display
- [x] 16.1 Update CommandOutput component for complete output
  - Display full stdout without truncation
  - Display full stderr without truncation
  - Preserve formatting, line breaks, special characters
  - Add scrolling for long output
  - _Requirements: 13.4, 13.8, 13.10_

- [x] 16.2 Add command line display throughout execution lifecycle
  - Show command line before execution starts
  - Keep command line visible during execution
  - Show command line after completion
  - Use monospace font and syntax highlighting
  - _Requirements: 13.1, 13.2, 13.3, 13.9_

- [x] 16.3 Add search functionality for long output
  - Implement search input for command output
  - Highlight search matches
  - Navigate between matches
  - _Requirements: 13.10_

- [x] 16.4 Update execution history views
  - Show command line in ExecutionsPage
  - Show command line in NodeDetailPage execution history
  - Toggle between expert and simplified views
  - _Requirements: 13.5, 13.6, 13.7_

- [x] 17. Implement integration status display
- [x] 17.1 Create IntegrationStatus component
  - Display connection status for each integration
  - Show last check time and error details
  - Add refresh button
  - Use consistent status badge styling
  - _Requirements: 9.5_

- [x] 17.2 Update HomePage to display integration status
  - Add integration status API call
  - Display integration status cards
  - Show PuppetDB and Bolt status
  - Handle loading and error states
  - _Requirements: 9.5_

- [x] 18. Enhance inventory page with multi-source support
- [x] 18.1 Update inventory API to support multi-source
  - Add sources query parameter to /api/inventory
  - Return source attribution for each node
  - Support filtering by source
  - _Requirements: 1.3_

- [x] 18.2 Update InventoryPage to display source badges
  - Show source for each node in table
  - Add source filter dropdown
  - Update node count by source
  - _Requirements: 1.3_

- [x] 18.3 Add PQL query support to inventory page
  - Create PQL query input component
  - Add query validation
  - Send query to backend
  - Display filtered results
  - Show query errors
  - _Requirements: 1.4_

- [x] 19. Apply consistent UI styling
- [x] 19.1 Audit and standardize status badges
  - Ensure consistent colors for success/failure/running
  - Use StatusBadge component everywhere
  - Add size variants (sm, md, lg)
  - _Requirements: 11.2_

- [x] 19.2 Standardize loading indicators
  - Use LoadingSpinner component consistently
  - Add skeleton screens for data loading
  - Ensure consistent sizing and positioning
  - _Requirements: 11.5_

- [x] 19.3 Standardize error displays
  - Use ErrorAlert component consistently
  - Ensure consistent alert styling
  - Add dismissal functionality
  - _Requirements: 11.4_

- [x] 19.4 Add hover states and focus indicators
  - Add hover states to all interactive elements
  - Add focus indicators for accessibility
  - Test keyboard navigation
  - _Requirements: 11.3_

## Testing Tasks (Optional)

- [ ]* 20. Write property-based tests
- [ ]* 20.1 Write property test for retry logic
  - **Property 22: Retry logic with exponential backoff**
  - **Validates: Requirements 12.3**

- [ ]* 20.2 Write property test for node transformation
  - **Property 2: Node data transformation consistency**
  - **Validates: Requirements 1.2**

- [ ]* 20.3 Write property test for PQL filtering
  - **Property 4: PQL query filtering**
  - **Validates: Requirements 1.4**

- [ ]* 20.4 Write property test for cache expiration
  - **Property 24: Cache expiration by source**
  - **Validates: Requirements 12.5**

- [ ]* 20.5 Write property test for facts display
  - **Property 6: Facts display with metadata**
  - **Validates: Requirements 2.2, 2.3, 2.4**

- [ ]* 20.6 Write property test for chronological ordering
  - **Property 7: Chronological ordering**
  - **Validates: Requirements 3.2**

- [ ]* 20.7 Write property test for required fields
  - **Property 8: Required field display**
  - **Validates: Requirements 3.3**

- [ ]* 20.8 Write property test for error highlighting
  - **Property 9: Error highlighting consistency**
  - **Validates: Requirements 3.5, 5.4**

- [ ]* 20.9 Write property test for resource organization
  - **Property 10: Resource organization and filtering**
  - **Validates: Requirements 4.3, 5.5**

- [ ]* 20.10 Write property test for graceful degradation
  - **Property 5: Graceful degradation on connection failure**
  - **Validates: Requirements 1.5, 2.5, 6.5**

- [ ]* 20.11 Write property test for configuration error handling
  - **Property 12: Configuration error handling**
  - **Validates: Requirements 6.4, 6.5**

- [ ]* 20.12 Write property test for re-execution linkage
  - **Property 14: Re-execution linkage**
  - **Validates: Requirements 7.5**

- [ ]* 20.13 Write property test for parameter preservation
  - **Property 13: Re-execution parameter preservation**
  - **Validates: Requirements 7.2, 7.3**

- [ ]* 20.14 Write property test for context-aware re-execution
  - **Property 15: Context-aware re-execution**
  - **Validates: Requirements 8.4**

- [ ]* 20.15 Write property test for multi-source aggregation
  - **Property 16: Multi-source data aggregation**
  - **Validates: Requirements 9.2, 9.4**

- [ ]* 20.16 Write property test for integration status display
  - **Property 17: Integration status display**
  - **Validates: Requirements 9.5**

- [ ]* 20.17 Write property test for source attribution
  - **Property 18: Source attribution consistency**
  - **Validates: Requirements 10.2**

- [ ]* 20.18 Write property test for independent section loading
  - **Property 19: Independent section loading**
  - **Validates: Requirements 10.5**

- [ ]* 20.19 Write property test for UI consistency
  - **Property 20: UI consistency across integrations**
  - **Validates: Requirements 11.1, 11.2, 11.3, 11.4, 11.5**

- [ ]* 20.20 Write property test for PQL query validation
  - **Property 21: PQL query format validation**
  - **Validates: Requirements 12.2**

- [ ]* 20.21 Write property test for response validation
  - **Property 23: Response validation and transformation**
  - **Validates: Requirements 12.4**

- [ ]* 20.22 Write property test for command line visibility
  - **Property 25: Command line visibility in expert mode**
  - **Validates: Requirements 13.1, 13.2, 13.3, 13.5, 13.6**

- [ ]* 20.23 Write property test for complete output display
  - **Property 26: Complete output display in expert mode**
  - **Validates: Requirements 13.4**

- [ ]* 20.24 Write property test for simplified display
  - **Property 27: Simplified display when expert mode disabled**
  - **Validates: Requirements 13.7**

- [ ]* 20.25 Write property test for output formatting
  - **Property 28: Output formatting preservation**
  - **Validates: Requirements 13.8**

- [ ]* 20.26 Write property test for command display styling
  - **Property 29: Command display styling**
  - **Validates: Requirements 13.9**

- [ ]* 20.27 Write property test for long output handling
  - **Property 30: Long output handling**
  - **Validates: Requirements 13.10**

- [ ]* 21. Write unit tests
- [ ]* 21.1 Write unit tests for PuppetDBClient
  - Test SSL configuration
  - Test authentication
  - Test error handling
  - _Requirements: 6.2, 6.3_

- [ ]* 21.2 Write unit tests for ExecutionRepository enhancements
  - Test re-execution methods
  - Test execution linkage
  - _Requirements: 7.5_

- [ ]* 21.3 Write unit tests for validation logic
  - Test schema validation
  - Test error handling
  - _Requirements: 12.4_

- [ ]* 22. Write integration tests
- [ ]* 22.1 Write integration tests for inventory endpoints
  - Test inventory retrieval
  - Test node detail retrieval
  - Test error handling
  - _Requirements: 1.1, 1.5_

- [ ]* 22.2 Write integration tests for facts endpoints
  - Test facts retrieval
  - Test error handling and graceful degradation
  - _Requirements: 2.1, 2.5_

- [ ]* 22.3 Write integration tests for reports endpoints
  - Test reports retrieval
  - Test report detail retrieval
  - _Requirements: 3.1, 3.4_

- [ ]* 22.4 Write integration tests for catalog endpoints
  - Test catalog retrieval
  - Test resource filtering
  - _Requirements: 4.1, 4.3_

- [ ]* 22.5 Write integration tests for events endpoints
  - Test events retrieval
  - Test event filtering
  - _Requirements: 5.1, 5.5_

- [ ]* 22.6 Write integration tests for re-execution endpoints
  - Test re-execution triggering
  - Test parameter preservation
  - Test execution linkage
  - _Requirements: 7.2, 7.3, 7.5_

- [ ]* 23. Write component tests
- [ ]* 23.1 Write component tests for IntegrationStatus
  - Test status display
  - Test refresh functionality
  - _Requirements: 9.5_

- [ ]* 23.2 Write component tests for enhanced HomePage
  - Test integration status display
  - Test statistics aggregation
  - _Requirements: 9.2, 9.5_

- [ ]* 23.3 Write component tests for tabbed interface
  - Test tab switching
  - Test lazy loading
  - Test state preservation
  - _Requirements: 10.1, 10.3_

- [ ]* 23.4 Write component tests for PuppetDB viewers
  - Test ReportViewer rendering
  - Test CatalogViewer filtering
  - Test EventsViewer filtering
  - _Requirements: 3.3, 4.3, 5.5_

- [ ]* 23.5 Write component tests for re-execution UI
  - Test button display
  - Test navigation
  - Test parameter pre-filling
  - _Requirements: 7.1, 7.2, 7.3_

- [ ]* 23.6 Write component tests for enhanced InventoryPage
  - Test source attribution display
  - Test source filtering
  - _Requirements: 1.3_

- [ ]* 23.7 Write component tests for PQL query UI
  - Test query input
  - Test query execution
  - Test error handling
  - _Requirements: 1.4_

- [ ]* 23.8 Write component tests for error handling
  - Test error display
  - Test retry functionality
  - _Requirements: 1.5, 2.5, 12.3_

## Documentation Tasks (Optional)

- [x] 24. Add documentation
- [x] 24.1 Write PuppetDB integration setup guide
  - Document configuration options
  - Document SSL setup
  - Document authentication setup
  - _Requirements: 6.1, 6.2, 6.3_

- [x] 24.2 Write API documentation
  - Document all new endpoints
  - Add request/response examples
  - _Requirements: All_

- [x] 24.3 Write user guide for new features
  - Document multi-source inventory
  - Document PuppetDB data viewers
  - Document re-execution feature
  - Document expert mode enhancements
  - _Requirements: All_

- [x] 24.4 Update README with new features
  - Add PuppetDB integration section
  - Add re-execution section
  - Add expert mode section
  - Add screenshots
  - _Requirements: All_
