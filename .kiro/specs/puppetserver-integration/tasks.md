# Implementation Plan

- [x] 1. Set up Puppetserver integration foundation
  - Create directory structure for Puppetserver integration
  - Define TypeScript types for Puppetserver data models (Certificate, NodeStatus, Environment, etc.)
  - Implement PuppetserverConfig interface and configuration loading
  - Set up error classes (PuppetserverError, CertificateOperationError, CatalogCompilationError, etc.)
  - _Requirements: 8.1, 9.1_

- [x] 1.1 Write property test for configuration validation
  - **Property 18: Configuration error handling**
  - **Validates: Requirements 8.4, 8.5**

- [x] 2. Implement PuppetserverClient for API communication
  - Create PuppetserverClient class with HTTP request methods (get, post, put, delete)
  - Implement SSL/TLS support with custom CA certificates
  - Add support for token-based and certificate-based authentication
  - Implement request/response handling with proper error transformation
  - Add timeout and connection management
  - _Requirements: 8.2, 8.3, 9.2_

- [x] 2.1 Write property test for SSL and authentication
  - **Property 17: SSL and authentication support**
  - **Validates: Requirements 8.2, 8.3**

- [x] 2.2 Write property test for REST API usage
  - **Property 19: REST API usage**
  - **Validates: Requirements 9.2**

- [x] 3. Implement retry logic and circuit breaker
  - Add retry logic with exponential backoff to PuppetserverClient
  - Integrate circuit breaker pattern (reuse from PuppetDB integration)
  - Implement error categorization (connection, timeout, authentication)
  - Add detailed error logging with endpoint, status code, and response body
  - _Requirements: 9.3, 14.1, 14.4, 14.5_

- [ ]* 3.1 Write property test for retry logic
  - **Property 20: Retry logic with exponential backoff**
  - **Validates: Requirements 9.3, 14.5**

- [ ]* 3.2 Write property test for network error categorization
  - **Property 36: Network error categorization**
  - **Validates: Requirements 14.4**

- [ ]* 3.3 Write property test for error logging
  - **Property 33: Detailed error logging**
  - **Validates: Requirements 14.1**

- [x] 4. Implement certificate API methods
  - Add getCertificates() method to retrieve certificate list with optional status filter
  - Add getCertificate() method to retrieve single certificate details
  - Add signCertificate() method to sign certificate requests
  - Add revokeCertificate() method to revoke certificates
  - Implement response validation and transformation
  - _Requirements: 1.1, 3.2, 3.4_

- [ ]* 4.1 Write property test for certificate data transformation
  - **Property 2: Certificate data transformation**
  - **Validates: Requirements 2.1**

- [ ]* 4.2 Write property test for response validation
  - **Property 21: Response validation and transformation**
  - **Validates: Requirements 9.4**

- [x] 5. Implement PuppetserverService plugin
  - Create PuppetserverService class extending BasePlugin
  - Implement InformationSourcePlugin interface methods
  - Add initialize() method with configuration validation
  - Implement healthCheck() method to verify Puppetserver connectivity
  - Add cache manager integration with TTL configuration
  - _Requirements: 9.1, 9.5_

- [ ]* 5.1 Write property test for cache expiration
  - **Property 22: Cache expiration by source**
  - **Validates: Requirements 9.5**

- [x] 6. Implement certificate management operations
  - Add listCertificates() method with status filtering
  - Add getCertificate() method for single certificate retrieval
  - Add signCertificate() method with error handling
  - Add revokeCertificate() method with error handling
  - Implement specific error messages for certificate operations
  - _Requirements: 1.1, 1.2, 3.1, 3.2, 3.3, 3.4, 14.3_

- [ ]* 6.1 Write property test for Puppetserver connection
  - **Property 1: Puppetserver connection and certificate retrieval**
  - **Validates: Requirements 1.1**

- [ ]* 6.2 Write property test for filtering
  - **Property 4: Multi-source filtering**
  - **Validates: Requirements 1.4, 2.5, 11.4, 13.3**

- [ ]* 6.3 Write property test for specific error messages
  - **Property 35: Specific error messages**
  - **Validates: Requirements 14.3**

- [x] 7. Implement bulk certificate operations
  - Add bulkSignCertificates() method to sign multiple certificates
  - Add bulkRevokeCertificates() method to revoke multiple certificates
  - Implement sequential processing with progress tracking
  - Return BulkOperationResult with success/failure details
  - _Requirements: 12.2, 12.4, 12.5_

- [ ]* 7.1 Write property test for bulk operation execution
  - **Property 29: Bulk operation execution**
  - **Validates: Requirements 12.4, 12.5**

- [x] 8. Implement inventory integration
  - Add getInventory() method to retrieve nodes from CA
  - Transform certificates to normalized Node format with source attribution
  - Add certificate status to node metadata
  - Implement getNode() method for single node retrieval
  - _Requirements: 2.1, 2.2_

- [ ]* 8.1 Write property test for source attribution
  - **Property 6: Source attribution consistency**
  - **Validates: Requirements 2.2, 6.2, 10.2**

- [-] 9. Implement NodeLinkingService
  - Create NodeLinkingService class for cross-source node linking
  - Implement linkNodes() method to match nodes by certname/hostname
  - Add getLinkedNodeData() method to aggregate data from all sources
  - Implement findMatchingNodes() method for identifier-based search
  - Add node matching logic with multiple identifier types
  - _Requirements: 2.3, 2.4, 10.3_

- [ ]* 9.1 Write property test for node linking
  - **Property 7: Node linking by identifier**
  - **Validates: Requirements 2.3**

- [ ]* 9.2 Write property test for multi-source indicator
  - **Property 8: Multi-source indicator display**
  - **Validates: Requirements 2.4**

- [ ]* 9.3 Write property test for unified view
  - **Property 23: Unified multi-source view**
  - **Validates: Requirements 10.3**

- [ ] 10. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 11. Implement node status operations
  - Add getNodeStatus() method to retrieve node status from Puppetserver
  - Add listNodeStatuses() method to retrieve all node statuses
  - Implement node status categorization (active, inactive, never checked in)
  - Add inactivity threshold configuration and highlighting logic
  - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [ ]* 11.1 Write property test for node status categorization
  - **Property 11: Node status categorization**
  - **Validates: Requirements 4.3, 4.4**

- [ ] 12. Implement facts retrieval
  - Add getNodeFacts() method to retrieve facts from Puppetserver
  - Implement fact categorization (system, network, hardware, custom)
  - Add timestamp tracking for fact freshness
  - Implement multi-source fact display logic
  - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [ ]* 12.1 Write property test for multi-source fact display
  - **Property 14: Multi-source fact display**
  - **Validates: Requirements 6.3**

- [ ]* 12.2 Write property test for fact categorization
  - **Property 15: Fact categorization**
  - **Validates: Requirements 6.4**

- [ ] 13. Implement catalog compilation
  - Add compileCatalog() method to compile catalogs for specific environments
  - Implement catalog resource parsing and transformation
  - Add catalog metadata extraction (environment, timestamp, version)
  - Implement detailed compilation error handling with line numbers
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [ ]* 13.1 Write property test for catalog display
  - **Property 12: Catalog display structure**
  - **Validates: Requirements 5.3, 5.4**

- [ ]* 13.2 Write property test for compilation errors
  - **Property 13: Compilation error detail**
  - **Validates: Requirements 5.5**

- [ ] 14. Implement catalog comparison (within PuppetserverService)
  - Implement compareCatalogs() method to generate diffs
  - Add compareResources() method to identify added, removed, and modified resources
  - Implement compareParameters() method to show parameter changes
  - Add catalog comparison error handling
  - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5_

- [ ]* 14.1 Write property test for catalog diff
  - **Property 37: Catalog diff display**
  - **Validates: Requirements 15.3, 15.4**

- [ ]* 14.2 Write property test for comparison errors
  - **Property 38: Comparison error display**
  - **Validates: Requirements 15.5**

- [ ] 15. Implement environment management
  - Add listEnvironments() method to retrieve available environments
  - Add getEnvironment() method for single environment details
  - Add deployEnvironment() method for environment deployment
  - Implement environment metadata display (name, last deployed, status)
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [ ]* 15.1 Write property test for environment metadata
  - **Property 16: Environment metadata display**
  - **Validates: Requirements 7.2, 7.5**

- [ ] 16. Register Puppetserver plugin with IntegrationManager
  - Update server initialization to register PuppetserverService
  - Configure plugin priority relative to PuppetDB
  - Add Puppetserver to health check scheduler
  - Update integration status endpoint to include Puppetserver
  - _Requirements: 9.1_

- [ ] 17. Implement API endpoints for certificates
  - Add GET /api/integrations/puppetserver/certificates endpoint
  - Add GET /api/integrations/puppetserver/certificates/:certname endpoint
  - Add POST /api/integrations/puppetserver/certificates/:certname/sign endpoint
  - Add DELETE /api/integrations/puppetserver/certificates/:certname endpoint
  - Add POST /api/integrations/puppetserver/certificates/bulk-sign endpoint
  - Add POST /api/integrations/puppetserver/certificates/bulk-revoke endpoint
  - _Requirements: 1.1, 1.2, 3.2, 3.4, 12.4_

- [ ] 18. Implement API endpoints for node data
  - Add GET /api/integrations/puppetserver/nodes endpoint
  - Add GET /api/integrations/puppetserver/nodes/:certname endpoint
  - Add GET /api/integrations/puppetserver/nodes/:certname/status endpoint
  - Add GET /api/integrations/puppetserver/nodes/:certname/facts endpoint
  - _Requirements: 2.1, 4.1, 6.1_

- [ ] 19. Implement API endpoints for catalogs and environments
  - Add GET /api/integrations/puppetserver/catalog/:certname/:environment endpoint
  - Add POST /api/integrations/puppetserver/catalog/compare endpoint
  - Add GET /api/integrations/puppetserver/environments endpoint
  - Add GET /api/integrations/puppetserver/environments/:name endpoint
  - Add POST /api/integrations/puppetserver/environments/:name/deploy endpoint
  - _Requirements: 5.2, 7.1, 7.4, 15.2_

- [ ] 20. Implement enhanced inventory endpoints
  - Add GET /api/inventory/linked endpoint for linked inventory
  - Add GET /api/inventory/nodes/:id/linked-data endpoint for aggregated node data
  - Update existing inventory endpoint to support Puppetserver source
  - _Requirements: 2.2, 2.3, 10.3_

- [ ] 21. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 22. Create Certificate Management UI component
  - Create CertificateManagement.svelte component
  - Implement certificate list display with status, fingerprint, and expiration
  - Add search interface with partial matching and case-insensitive search
  - Implement filtering by status, expiration date, and fingerprint
  - Add real-time filter updates without page reload
  - Display active filters with clear buttons
  - _Requirements: 1.2, 1.3, 1.4, 13.1, 13.2, 13.3, 13.4, 13.5_

- [ ]* 22.1 Write property test for required field display
  - **Property 3: Required field display completeness**
  - **Validates: Requirements 1.3, 4.2, 5.4**

- [ ]* 22.2 Write property test for search functionality
  - **Property 30: Search functionality**
  - **Validates: Requirements 13.2**

- [ ]* 22.3 Write property test for real-time filter updates
  - **Property 31: Real-time filter updates**
  - **Validates: Requirements 13.4**

- [ ]* 22.4 Write property test for active filter display
  - **Property 32: Active filter display**
  - **Validates: Requirements 13.5**

- [ ] 23. Add certificate operation buttons
  - Add sign button for certificates with "requested" status
  - Add revoke button for signed certificates
  - Implement confirmation dialog for revoke operations
  - Add post-operation refresh and success/error messages
  - Display actionable error messages with troubleshooting guidance
  - _Requirements: 3.1, 3.3, 3.4, 3.5, 14.2_

- [ ]* 23.1 Write property test for conditional button display
  - **Property 9: Conditional button display**
  - **Validates: Requirements 3.1, 3.3**

- [ ]* 23.2 Write property test for post-operation refresh
  - **Property 10: Post-operation refresh and feedback**
  - **Validates: Requirements 3.5**

- [ ]* 23.3 Write property test for actionable error messages
  - **Property 34: Actionable error messages**
  - **Validates: Requirements 14.2**

- [ ] 24. Implement bulk certificate operations UI
  - Add checkboxes for certificate selection
  - Display bulk action buttons when multiple certificates are selected
  - Implement confirmation dialog showing affected certificates
  - Add progress display during bulk operations
  - Display summary with successful and failed operations
  - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_

- [ ]* 24.1 Write property test for bulk operation conditional display
  - **Property 28: Bulk operation conditional display**
  - **Validates: Requirements 12.2**

- [ ] 25. Update Inventory Page with Puppetserver integration
  - Add certificate status indicators (badges, icons, colors) for Puppetserver nodes
  - Display visual indicator for pending certificate requests
  - Display prominent warning for revoked certificates
  - Add filtering by certificate status
  - Add sorting by certificate status and last check-in time
  - Show multi-source indicators for linked nodes
  - _Requirements: 2.2, 2.4, 11.1, 11.2, 11.3, 11.4, 11.5_

- [ ]* 25.1 Write property test for certificate status indicators
  - **Property 26: Certificate status indicators**
  - **Validates: Requirements 11.1, 11.2, 11.3**

- [ ]* 25.2 Write property test for inventory sorting
  - **Property 27: Inventory sorting**
  - **Validates: Requirements 11.5**

- [ ] 26. Create Node Status component
  - Create NodeStatus.svelte component
  - Display last run timestamp, catalog version, and run status
  - Show node activity status (active, inactive, never checked in)
  - Highlight inactive nodes based on configurable threshold
  - Display error messages while preserving other functionality
  - _Requirements: 4.2, 4.3, 4.4, 4.5_

- [ ] 27. Create Environment Selector component
  - Create EnvironmentSelector.svelte component
  - Display environment list with names and metadata
  - Add environment selection interface
  - Implement environment deployment trigger (if supported)
  - Display deployment timestamp and status
  - _Requirements: 7.2, 7.3, 7.4, 7.5_

- [ ] 28. Create Catalog Comparison component
  - Create CatalogComparison.svelte component
  - Add interface to select two environments for comparison
  - Display diff view with added, removed, and modified resources
  - Highlight resource parameter changes
  - Display detailed error messages for failed compilations
  - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5_

- [ ] 29. Update Node Detail Page with Puppetserver tabs
  - Add Certificate Status tab showing certificate info and operations
  - Add Node Status tab showing last check-in and run status
  - Add Catalog Compilation tab with environment selector and comparison
  - Add Environments tab for environment management
  - Ensure source attribution for all data types
  - Display unified view for nodes in multiple sources
  - Show conflict resolution with timestamps for conflicting data
  - Implement independent section loading without blocking
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

- [ ]* 29.1 Write property test for conflict resolution display
  - **Property 24: Conflict resolution display**
  - **Validates: Requirements 10.4**

- [ ]* 29.2 Write property test for independent section loading
  - **Property 25: Independent section loading**
  - **Validates: Requirements 10.5**

- [ ] 30. Implement multi-source facts display
  - Update Facts tab to show facts from both Puppetserver and PuppetDB
  - Display timestamps for each fact source
  - Organize facts by category (system, network, hardware, custom)
  - Show error messages while preserving facts from other sources
  - _Requirements: 6.2, 6.3, 6.4, 6.5_

- [ ] 31. Implement graceful degradation
  - Add error handling to continue showing data from other sources on Puppetserver failure
  - Display error messages for failed Puppetserver operations
  - Ensure system operates normally when Puppetserver is not configured
  - _Requirements: 1.5, 4.5, 6.5, 8.5_

- [ ]* 31.1 Write property test for graceful degradation
  - **Property 5: Graceful degradation on source failure**
  - **Validates: Requirements 1.5, 4.5, 6.5**

- [ ] 32. Add integration status display
  - Update integration status component to include Puppetserver
  - Display Puppetserver connection status on home page
  - Show last health check timestamp and status
  - _Requirements: 9.1_

- [ ] 33. Update documentation
  - Add Puppetserver configuration guide
  - Document certificate management workflows
  - Document catalog comparison workflows
  - Add API endpoint documentation
  - Update architecture diagrams
  - _Requirements: All_

- [ ] 34. Final Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
