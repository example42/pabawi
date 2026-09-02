# Implementation Plan: Proxmox Integration

## Overview

This implementation plan creates a new Proxmox Virtual Environment integration for Pabawi following the established plugin architecture. The integration enables VM and container lifecycle management, inventory discovery, and introduces a new "provisioning" capability type to the system.

The implementation follows the existing patterns from PuppetDB, Bolt, and SSH integrations, using TypeScript with comprehensive error handling, caching, and retry logic.

## Tasks

- [x] 1. Set up project structure and type definitions
  - Create `pabawi/backend/src/integrations/proxmox/` directory
  - Create `types.ts` with all Proxmox-specific interfaces (ProxmoxConfig, ProxmoxGuest, ProxmoxGuestConfig, ProxmoxGuestStatus, VMCreateParams, LXCCreateParams, ProxmoxTaskStatus, RetryConfig, error classes)
  - Update `pabawi/backend/src/integrations/types.ts` to add ProvisioningCapability interface
  - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 9.1, 9.2_

- [x] 2. Implement ProxmoxClient HTTP layer
  - [x] 2.1 Create ProxmoxClient class with authentication
    - Implement constructor with config and logger
    - Implement authenticate() method for both password and token authentication
    - Implement ticket storage and HTTPS agent configuration
    - _Requirements: 3.1, 3.2, 3.4, 3.6, 16.4_
  
  - [x] 2.2 Implement HTTP request methods
    - Implement get(), post(), delete() methods
    - Implement request() method with authentication headers
    - Implement handleResponse() with HTTP error transformation
    - Implement automatic ticket refresh on 401 errors
    - _Requirements: 3.3, 14.2, 14.3, 14.4, 14.5, 14.6_
  
  - [x] 2.3 Implement retry logic with exponential backoff
    - Implement requestWithRetry() method
    - Configure retry for transient failures (ECONNRESET, ETIMEDOUT, ENOTFOUND)
    - Implement exponential backoff calculation
    - Handle 429 rate limiting with Retry-After header
    - Skip retry for authentication and 4xx errors
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6_
  
  - [x] 2.4 Implement task polling mechanism
    - Implement waitForTask() method with configurable timeout
    - Poll task status endpoint every 2 seconds
    - Handle task completion (success/failure)
    - Implement timeout after 300 seconds (default)
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7_

- [x] 3. Checkpoint - Ensure ProxmoxClient tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement ProxmoxService business logic layer
  - [x] 4.1 Create ProxmoxService class with initialization
    - Implement constructor with config, logger, and performanceMonitor
    - Implement initialize() method to create ProxmoxClient
    - Implement healthCheck() method querying version endpoint
    - Initialize SimpleCache with 60s TTL
    - _Requirements: 1.6, 1.7, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_
  
  - [x] 4.2 Implement inventory discovery
    - Implement getInventory() method with caching
    - Query cluster resources endpoint for all VMs and containers
    - Implement transformGuestToNode() helper method
    - Cache results for 60 seconds
    - Use PerformanceMonitorService to track duration
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 20.1, 20.5_
  
  - [x] 4.3 Implement group management
    - Implement getGroups() method with caching
    - Implement groupByNode() helper to create node-based groups
    - Implement groupByStatus() helper to create status-based groups
    - Implement groupByType() helper to create type-based groups
    - Use correct group ID formats (proxmox:node:{name}, proxmox:status:{status}, proxmox:type:{type})
    - Cache results for 60 seconds
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 20.2_
  
  - [x] 4.4 Implement facts retrieval
    - Implement getNodeFacts() method with caching
    - Parse VMID and node name from nodeId
    - Implement getGuestType() helper to determine qemu vs lxc
    - Query guest config and status endpoints
    - Implement transformToFacts() helper method
    - Include CPU, memory, disk, network config and current usage
    - Handle non-existent guests with descriptive errors
    - Cache results for 30 seconds
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 20.3_

- [x] 5. Implement lifecycle action capabilities
  - [x] 5.1 Implement executeAction() dispatcher
    - Implement executeAction() method to route actions
    - Implement executeLifecycleAction() for start/stop/shutdown/reboot/suspend/resume
    - Parse target nodeId to extract node and VMID
    - Determine guest type and call appropriate endpoint
    - Wait for action task completion
    - Return ExecutionResult with success/error details
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9, 8.10_
  
  - [x] 5.2 Implement capability listing
    - Implement listCapabilities() method
    - Return array of Capability objects for all lifecycle actions
    - Include name, description, and parameters for each capability
    - _Requirements: 8.1, 8.2_

- [x] 6. Implement provisioning capabilities
  - [x] 6.1 Implement VM creation
    - Implement createVM() method
    - Implement guestExists() helper to check VMID uniqueness
    - Validate VMID is unique before creation
    - Call Proxmox VM creation endpoint
    - Wait for creation task completion
    - Clear inventory and groups cache after creation
    - Return ExecutionResult with VMID and status
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7_
  
  - [x] 6.2 Implement LXC container creation
    - Implement createLXC() method
    - Validate VMID is unique before creation
    - Call Proxmox LXC creation endpoint
    - Wait for creation task completion
    - Clear inventory and groups cache after creation
    - Return ExecutionResult with VMID and status
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7_
  
  - [x] 6.3 Implement guest destruction
    - Implement destroyGuest() method
    - Verify guest exists before destruction
    - Stop guest if running before deletion
    - Call Proxmox deletion endpoint
    - Wait for deletion task completion
    - Clear all related caches (inventory, groups, facts)
    - Return success status or error
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7_
  
  - [x] 6.4 Implement provisioning action dispatcher
    - Implement executeProvisioningAction() method
    - Route create_vm, create_lxc, destroy_vm, destroy_lxc actions
    - Validate parameters for each action type
    - Call appropriate service method
    - _Requirements: 9.3, 9.4_
  
  - [x] 6.5 Implement provisioning capability listing
    - Implement listProvisioningCapabilities() method
    - Return ProvisioningCapability objects for create_vm, create_lxc, destroy_vm, destroy_lxc
    - Include operation type (create/destroy) and parameters
    - _Requirements: 9.3, 9.4, 9.5_

- [x] 7. Checkpoint - Ensure ProxmoxService tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Implement ProxmoxIntegration plugin class
  - [x] 8.1 Create ProxmoxIntegration class extending BasePlugin
    - Extend BasePlugin with "both" type
    - Implement InformationSourcePlugin interface
    - Implement ExecutionToolPlugin interface
    - Implement constructor with logger and performanceMonitor
    - _Requirements: 1.1, 1.2, 1.3_
  
  - [x] 8.2 Implement plugin initialization and validation
    - Implement performInitialization() method
    - Implement validateProxmoxConfig() method
    - Validate host, port, authentication, and realm
    - Log security warning if SSL verification disabled
    - Initialize ProxmoxService with validated config
    - _Requirements: 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 16.1, 16.2, 16.3, 16.4, 16.5, 16.6_
  
  - [x] 8.3 Implement plugin interface methods
    - Implement performHealthCheck() delegating to service
    - Implement getInventory() delegating to service
    - Implement getGroups() delegating to service
    - Implement getNodeFacts() delegating to service
    - Implement getNodeData() delegating to service
    - Implement executeAction() delegating to service
    - Implement listCapabilities() delegating to service
    - Implement listProvisioningCapabilities() delegating to service
    - _Requirements: 1.4, 4.1_

- [x] 9. Integrate with IntegrationManager
  - [x] 9.1 Register ProxmoxIntegration with IntegrationManager
    - Import ProxmoxIntegration in IntegrationManager
    - Add proxmox to integration registry
    - Ensure plugin participates in inventory aggregation
    - _Requirements: 1.4, 9.5, 9.6_
  
  - [x] 9.2 Update IntegrationManager for provisioning capabilities
    - Add method to query provisioning capabilities from all plugins
    - Aggregate provisioning capabilities across plugins
    - _Requirements: 9.5, 9.6_

- [ ] 10. Write unit tests for ProxmoxClient
  - [ ]* 10.1 Write unit tests for authentication
    - Test password authentication with ticket storage
    - Test token authentication
    - Test authentication failure handling
    - Test automatic ticket refresh on 401
    - Mock fetch responses
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_
  
  - [ ]* 10.2 Write unit tests for HTTP methods
    - Test get(), post(), delete() methods
    - Test request header construction
    - Test response parsing
    - Mock Proxmox API responses
    - _Requirements: 3.6_
  
  - [ ]* 10.3 Write unit tests for error handling
    - Test 401/403 authentication errors
    - Test 404 not found errors
    - Test 429 rate limiting with retry
    - Test 5xx server errors
    - Test network errors (ECONNRESET, ETIMEDOUT)
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6_
  
  - [ ]* 10.4 Write unit tests for retry logic
    - Test retry with exponential backoff
    - Test max retry attempts
    - Test non-retryable errors (auth, 4xx)
    - Test retryable errors (network, 5xx)
    - Test retry logging
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6_
  
  - [ ]* 10.5 Write unit tests for task polling
    - Test waitForTask() success case
    - Test waitForTask() failure case
    - Test task timeout
    - Test custom timeout values
    - Test polling interval
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7_

- [ ] 11. Write unit tests for ProxmoxService
  - [ ]* 11.1 Write unit tests for initialization and health check
    - Test service initialization
    - Test health check with successful API response
    - Test health check with authentication failure (degraded)
    - Test health check with connection failure (unhealthy)
    - Test health check caching
    - Mock ProxmoxClient
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_
  
  - [ ]* 11.2 Write unit tests for inventory discovery
    - Test getInventory() with valid API response
    - Test guest-to-node transformation
    - Test inventory caching (60s TTL)
    - Test cache hit vs cache miss
    - Test empty inventory
    - Mock cluster resources endpoint
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 20.1_
  
  - [ ]* 11.3 Write unit tests for group management
    - Test getGroups() with multiple nodes
    - Test groupByNode() creates correct groups
    - Test groupByStatus() creates correct groups
    - Test groupByType() creates correct groups
    - Test group ID format correctness
    - Test groups caching (60s TTL)
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 20.2_
  
  - [ ]* 11.4 Write unit tests for facts retrieval
    - Test getNodeFacts() for VM
    - Test getNodeFacts() for LXC
    - Test facts transformation with config and status
    - Test facts caching (30s TTL)
    - Test non-existent guest error
    - Test running vs stopped guest facts
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 20.3_
  
  - [ ]* 11.5 Write unit tests for lifecycle actions
    - Test executeAction() for start action
    - Test executeAction() for stop action
    - Test executeAction() for shutdown action
    - Test executeAction() for reboot action
    - Test executeAction() for suspend action
    - Test executeAction() for resume action
    - Test action failure with error details
    - Test task completion waiting
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9, 8.10_
  
  - [ ]* 11.6 Write unit tests for VM creation
    - Test createVM() success case
    - Test VMID uniqueness validation
    - Test VM creation failure
    - Test cache clearing after creation
    - Mock VM creation endpoint
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7_
  
  - [ ]* 11.7 Write unit tests for LXC creation
    - Test createLXC() success case
    - Test VMID uniqueness validation
    - Test LXC creation failure
    - Test cache clearing after creation
    - Mock LXC creation endpoint
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7_
  
  - [ ]* 11.8 Write unit tests for guest destruction
    - Test destroyGuest() success case
    - Test non-existent guest error
    - Test stop-before-delete for running guest
    - Test cache clearing after destruction
    - Mock deletion endpoint
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7_
  
  - [ ]* 11.9 Write unit tests for capability listing
    - Test listCapabilities() returns all lifecycle actions
    - Test listProvisioningCapabilities() returns all provisioning actions
    - Test capability parameter definitions
    - _Requirements: 8.1, 8.2, 9.3, 9.4_

- [ ] 12. Write unit tests for ProxmoxIntegration
  - [ ]* 12.1 Write unit tests for plugin initialization
    - Test plugin initialization with valid config
    - Test config validation for missing host
    - Test config validation for invalid port
    - Test config validation for missing authentication
    - Test config validation for missing realm
    - Test SSL verification warning
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 16.1, 16.2, 16.3, 16.4, 16.5, 16.6_
  
  - [ ]* 12.2 Write unit tests for plugin interface methods
    - Test performHealthCheck() delegation
    - Test getInventory() delegation
    - Test getGroups() delegation
    - Test getNodeFacts() delegation
    - Test executeAction() delegation
    - Test listCapabilities() delegation
    - Test listProvisioningCapabilities() delegation
    - Mock ProxmoxService
    - _Requirements: 1.4, 4.1_

- [ ] 13. Write property-based tests
  - [ ]* 13.1 Write property test for configuration validation
    - **Property 1: Configuration Validation Rejects Invalid Inputs**
    - **Validates: Requirements 2.3, 2.4, 16.1, 16.2, 16.3, 16.5, 16.6**
    - Generate invalid configs (missing fields, invalid ports, invalid hosts)
    - Verify initialization throws descriptive errors
    - Use fast-check with 100 iterations
  
  - [ ]* 13.2 Write property test for guest-to-node transformation
    - **Property 4: Guest-to-Node Transformation Completeness**
    - **Validates: Requirements 5.3, 5.4, 5.5, 5.6, 5.7**
    - Generate random Proxmox guest objects
    - Verify transformed Node has all required fields
    - Verify type field correctness
    - Verify IP field handling (present or omitted, never null)
    - Use fast-check with 100 iterations
  
  - [ ]* 13.3 Write property test for group ID format
    - **Property 8: Group ID Format Correctness**
    - **Validates: Requirements 6.5, 6.6, 6.7**
    - Generate random node names, statuses, and types
    - Verify group IDs match expected format
    - Use fast-check with 100 iterations
  
  - [ ]* 13.4 Write property test for caching behavior
    - **Property 22, 23, 24: Cache Behavior**
    - **Validates: Requirements 20.1, 20.2, 20.3**
    - Test inventory cache TTL (60s)
    - Test groups cache TTL (60s)
    - Test facts cache TTL (30s)
    - Verify cache hits don't trigger API calls
    - Use fast-check with 100 iterations
  
  - [ ]* 13.5 Write property test for retry logic
    - **Property 18: Retry Logic for Transient Failures**
    - **Validates: Requirements 15.2**
    - Generate transient network errors
    - Verify retry attempts with exponential backoff
    - Verify max retry limit
    - Use fast-check with 100 iterations

- [x] 14. Create API routes for Proxmox endpoints
  - [x] 14.1 Create provisioning API routes
    - Add POST /api/integrations/proxmox/provision/vm endpoint
    - Add POST /api/integrations/proxmox/provision/lxc endpoint
    - Add DELETE /api/integrations/proxmox/provision/:vmid endpoint
    - Validate request parameters
    - Call ProxmoxIntegration methods
    - Return appropriate HTTP status codes
  
  - [x] 14.2 Create action API routes
    - Add POST /api/integrations/proxmox/action endpoint
    - Support all lifecycle actions (start, stop, shutdown, reboot, suspend, resume)
    - Validate action parameters
    - Call ProxmoxIntegration executeAction method

- [x] 15. Write documentation
  - [x] 15.1 Create integration documentation
    - Create `docs/integrations/proxmox.md`
    - Document all configuration options with examples
    - Document authentication setup (password and token)
    - Document all supported actions with parameters
    - Document all provisioning capabilities with examples
    - Include troubleshooting section
    - Include example configuration snippets
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5, 18.6, 18.7_
  
  - [x] 15.2 Create configuration examples
    - Document environment variable setup
    - Provide example .env configuration
    - Document Proxmox API token creation steps
    - Document required permissions
    - _Requirements: 18.5_

- [x] 16. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- The implementation follows existing patterns from PuppetDB and SSH integrations
- TypeScript is used throughout for type safety
- All API communication uses HTTPS
- Caching improves performance and reduces API load
- Retry logic handles transient failures gracefully
