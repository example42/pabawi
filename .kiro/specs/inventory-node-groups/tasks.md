# Implementation Plan: Inventory Node Groups

## Overview

This implementation extends Pabawi's inventory system to support node groups as first-class entities. The approach follows the existing node architecture: each integration source provides groups independently, IntegrationManager aggregates them with linking support, the API exposes them alongside nodes, and the frontend displays them in a unified view. Implementation proceeds incrementally from backend data models through integration-specific implementations to frontend display and group-based actions.

## Tasks

- [x] 1. Set up backend data models and core interfaces
  - Create NodeGroup interface in backend types
  - Extend InformationSourcePlugin interface with getGroups() method
  - Extend AggregatedInventory interface to include groups array
  - Update source metadata type to include groupCount
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [ ]* 1.1 Write property test for NodeGroup structure validity
  - **Property 1: NodeGroup Structure Validity**
  - **Validates: Requirements 1.1, 1.2**

- [x] 2. Implement Bolt integration group support
  - [x] 2.1 Implement Bolt getGroups() method
    - Parse inventory.yaml groups section
    - Extract group names, targets, and nested groups
    - Map targets to node IDs using source:nodeName format
    - Include vars and config as metadata
    - Handle nested groups by storing hierarchy in metadata.hierarchy
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [ ]* 2.2 Write property test for Bolt integration parsing
    - **Property 2: Integration Parsing Round-Trip (Bolt)**
    - **Validates: Requirements 2.1, 2.3**

  - [ ]* 2.3 Write property test for node reference correctness
    - **Property 3: Node Reference Correctness**
    - **Validates: Requirements 2.2**

  - [ ]* 2.4 Write property test for hierarchy preservation
    - **Property 4: Hierarchy Preservation (Bolt)**
    - **Validates: Requirements 2.4**

  - [ ]* 2.5 Write unit tests for Bolt group parsing
    - Test example inventory.yaml with groups
    - Test empty groups array
    - Test malformed inventory files
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [x] 3. Implement Ansible integration group support
  - [x] 3.1 Implement Ansible getGroups() method
    - Parse hosts.yml or INI format for groups
    - Extract group hierarchy (children relationships)
    - Map hosts to node IDs
    - Include group_vars as metadata
    - Store parent groups in metadata.hierarchy
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [ ]* 3.2 Write property test for Ansible integration parsing
    - **Property 2: Integration Parsing Round-Trip (Ansible)**
    - **Validates: Requirements 3.1, 3.3**

  - [ ]* 3.3 Write property test for hierarchy preservation
    - **Property 4: Hierarchy Preservation (Ansible)**
    - **Validates: Requirements 3.4**

  - [ ]* 3.4 Write unit tests for Ansible group parsing
    - Test example hosts.yml with groups
    - Test INI format parsing
    - Test parent-child relationships
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 4. Implement PuppetDB integration group support
  - [x] 4.1 Implement PuppetDB getGroups() method
    - Query PuppetDB for node classifiers
    - Create synthetic groups from common patterns (environment, OS family, classes)
    - Map certnames to node IDs
    - Return empty array if PuppetDB doesn't support groups
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [ ]* 4.2 Write unit tests for PuppetDB group extraction
    - Test environment-based grouping
    - Test OS family grouping
    - Test empty results when no groups available
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [x] 5. Implement SSH integration group support
  - [x] 5.1 Implement SSH getGroups() method
    - Parse SSH config for Host patterns
    - Extract patterns from Host and Match directives
    - Create groups from patterns (e.g., "web-prod-*" → "web-prod")
    - Match nodes against patterns using glob matching
    - Handle multi-host patterns (e.g., "Host app-_db-_")
    - Detect environment-based patterns (-prod-, -stg-, -dev-)
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [ ]* 5.2 Write property test for SSH pattern matching
    - **Property 5: SSH Pattern Matching**
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5**

  - [ ]* 5.3 Write unit tests for SSH group creation
    - Test Host pattern extraction
    - Test Match directive handling
    - Test multi-host patterns
    - Test environment pattern detection
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [x] 6. Checkpoint - Ensure all integration tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement IntegrationManager group aggregation
  - [x] 7.1 Add getGroups() calls to IntegrationManager
    - Call getGroups() on all enabled information source plugins in parallel
    - Collect groups from all sources into Map<source, NodeGroup[]>
    - Handle errors gracefully (log and continue with other sources)
    - _Requirements: 6.1_

  - [x] 7.2 Implement group linking logic
    - Group all groups by name across sources
    - For groups with same name, create linked group entity
    - Set linked=true and populate sources array
    - Merge nodes arrays and deduplicate node IDs
    - Merge metadata from all sources
    - _Requirements: 6.2, 6.3, 6.4_

  - [ ]* 7.3 Write property test for group aggregation completeness
    - **Property 6: Group Aggregation Completeness**
    - **Validates: Requirements 6.1**

  - [ ]* 7.4 Write property test for linked group creation
    - **Property 7: Linked Group Creation**
    - **Validates: Requirements 6.2, 6.3, 6.4**

  - [ ]* 7.5 Write unit tests for IntegrationManager aggregation
    - Test aggregation with multiple sources
    - Test linking groups with same name
    - Test node deduplication
    - Test error handling when source fails
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [x] 8. Update inventory API endpoint
  - [x] 8.1 Modify /api/inventory route handler
    - Call IntegrationManager.getAggregatedInventory() to get groups
    - Apply source filtering to groups (same as nodes)
    - Apply sorting to groups (sortBy=name or source)
    - Include groupCount in source metadata
    - Return { nodes, groups, sources } in response
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [ ]* 8.2 Write property test for API response structure
    - **Property 8: API Response Structure**
    - **Validates: Requirements 7.1, 7.4**

  - [ ]* 8.3 Write property test for source filtering
    - **Property 9: Source Filtering**
    - **Validates: Requirements 7.2**

  - [ ]* 8.4 Write property test for API sorting
    - **Property 10: API Sorting**
    - **Validates: Requirements 7.3**

  - [ ]* 8.5 Write unit tests for inventory API
    - Test response includes nodes and groups
    - Test source filtering
    - Test sorting by name and source
    - Test groupCount in metadata
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [x] 9. Implement backend validation and error handling
  - [x] 9.1 Add group validation logic
    - Validate required fields (id, name, source, nodes)
    - Reject groups missing required fields and log warning
    - Validate group ID uniqueness within source
    - Sanitize group names to prevent injection attacks
    - Log warnings for groups with invalid node references
    - _Requirements: 14.1, 14.2, 14.3, 14.4_

  - [ ]* 9.2 Write property test for group validation
    - **Property 11: Group Validation**
    - **Validates: Requirements 14.1**

  - [ ]* 9.3 Write property test for invalid node references
    - **Property 12: Invalid Node References**
    - **Validates: Requirements 14.2**

  - [ ]* 9.4 Write property test for group ID uniqueness
    - **Property 13: Group ID Uniqueness**
    - **Validates: Requirements 14.3**

  - [ ]* 9.5 Write property test for group name sanitization
    - **Property 14: Group Name Sanitization**
    - **Validates: Requirements 14.4**

  - [ ]* 9.6 Write unit tests for validation logic
    - Test rejection of invalid groups
    - Test sanitization of malicious names
    - Test warning logs for invalid references
    - _Requirements: 14.1, 14.2, 14.3, 14.4_

- [x] 10. Implement backend caching and performance optimization
  - [x] 10.1 Add group caching to IntegrationManager
    - Cache group data with same TTL as node data
    - Implement parallel fetching for groups from multiple sources
    - Add cache invalidation on refresh
    - _Requirements: 15.3, 15.4_

  - [ ]* 10.2 Write property test for cache TTL consistency
    - **Property 15: Cache TTL Consistency**
    - **Validates: Requirements 15.3**

  - [ ]* 10.3 Write unit tests for caching behavior
    - Test cache hit and miss scenarios
    - Test TTL expiration
    - Test parallel fetching performance
    - _Requirements: 15.3, 15.4_

- [x] 11. Checkpoint - Ensure all backend tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Update frontend InventoryPage component
  - [x] 12.1 Add groups state and API integration
    - Add groups state variable to InventoryPage.svelte
    - Update API call to fetch groups alongside nodes
    - Add groupCountsBySource derived state
    - Handle API errors for group fetching
    - _Requirements: 8.1_

  - [x] 12.2 Implement group filtering logic
    - Add filteredGroups derived state with search and source filtering
    - Apply same filtering logic as nodes (search by name, filter by source)
    - Update results count to include filtered groups
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [x] 12.3 Implement group sorting logic
    - Add group sorting to filteredGroups (by name or source)
    - Support ascending and descending order
    - Sort groups independently from nodes
    - _Requirements: 9.1, 9.2, 9.5, 9.6, 9.7, 9.8_

  - [x] 12.4 Create combinedResults derived state
    - Combine filteredGroups and filteredNodes
    - Place groups before nodes in the combined array
    - Maintain visual separation between entity types
    - _Requirements: 11.1, 11.3_

  - [ ]* 12.5 Write property test for search filtering
    - **Property 18: Search Filtering**
    - **Validates: Requirements 9.2**

  - [ ]* 12.6 Write property test for source filter application
    - **Property 19: Source Filter Application**
    - **Validates: Requirements 9.1**

  - [ ]* 12.7 Write property test for results count accuracy
    - **Property 20: Results Count Accuracy**
    - **Validates: Requirements 9.3, 9.4**

  - [ ]* 12.8 Write property test for group sorting
    - **Property 21: Group Sorting**
    - **Validates: Requirements 9.5, 9.6, 9.7, 9.8**

  - [ ]* 12.9 Write property test for group-first ordering
    - **Property 24: Group-First Ordering**
    - **Validates: Requirements 11.3**

- [x] 13. Implement group rendering in InventoryPage
  - [x] 13.1 Add group rendering to grid view
    - Render groups with folder icon (distinguish from node server icon)
    - Display group name and source badges
    - Show member count badge
    - Add click handler for navigation to group detail page
    - Add hover state for clickable groups
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 10.1, 10.3, 11.2_

  - [x] 13.2 Add group rendering to list view
    - Render groups with folder icon
    - Display group name, source badges, and member count
    - Add click handler for navigation
    - Maintain consistent styling with grid view
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 10.1, 10.3, 11.2_

  - [x] 13.3 Implement group navigation
    - Add navigation route for group detail page
    - Pass group ID in route parameters
    - Maintain consistent navigation behavior with nodes
    - _Requirements: 10.1, 10.2, 10.4_

  - [ ]* 13.4 Write property test for source badge display
    - **Property 16: Source Badge Display**
    - **Validates: Requirements 8.2, 8.3, 13.1, 13.2, 13.3**

  - [ ]* 13.5 Write property test for member count display
    - **Property 17: Member Count Display**
    - **Validates: Requirements 8.4**

  - [ ]* 13.6 Write property test for navigation with group ID
    - **Property 22: Navigation with Group ID**
    - **Validates: Requirements 10.2**

  - [ ]* 13.7 Write property test for visual differentiation
    - **Property 23: Visual Differentiation**
    - **Validates: Requirements 11.2**

  - [ ]* 13.8 Write unit tests for group rendering
    - Test grid view rendering
    - Test list view rendering
    - Test source badge display for linked groups
    - Test member count display
    - Test navigation on click
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 10.1, 10.2, 10.3, 11.2_

- [x] 14. Implement empty state handling
  - [x] 14.1 Add empty state messages for groups
    - Display "no groups found" when filters exclude all groups
    - Display "no groups or nodes found" when both are empty
    - Provide actionable guidance (adjust filters, check integrations)
    - Handle sources that don't support groups gracefully
    - _Requirements: 12.1, 12.2, 12.3, 12.4_

  - [ ]* 14.2 Write unit tests for empty states
    - Test "no groups found" message
    - Test "no groups or nodes found" message
    - Test display when source doesn't support groups
    - _Requirements: 12.1, 12.2, 12.3, 12.4_

- [x] 15. Implement frontend performance optimizations
  - [x] 15.1 Add virtual scrolling for large group lists
    - Implement virtual scrolling when group count > 100
    - Maintain smooth scrolling performance
    - Handle combined groups and nodes in virtual list
    - _Requirements: 15.1, 15.2_

  - [ ]* 15.2 Write unit tests for virtual scrolling
    - Test rendering with > 100 groups
    - Test scroll performance
    - _Requirements: 15.1, 15.2_

- [x] 16. Checkpoint - Ensure all frontend tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 17. Implement group-based action execution
  - [x] 17.1 Update action execution components
    - Modify command execution to accept group targets
    - Modify task execution to accept group targets
    - Modify plan execution to accept group targets
    - Expand group targets to node lists before execution
    - _Requirements: Design Goals - Group-based action execution_

  - [ ]* 17.2 Write unit tests for group-based actions
    - Test command execution with group target
    - Test task execution with group target
    - Test plan execution with group target
    - Test group expansion to node list
    - _Requirements: Design Goals - Group-based action execution_

- [x] 18. Integration testing and end-to-end validation
  - [x] 18.1 Create integration test fixtures
    - Create sample Bolt inventory.yaml with groups
    - Create sample Ansible hosts.yml with groups
    - Create sample SSH config with Host patterns
    - Create mock PuppetDB responses with groups
    - _Requirements: All_

  - [x] 18.2 Write integration tests for complete flow
    - Test integration source → IntegrationManager → API → frontend flow
    - Test with multiple sources enabled
    - Test group linking across sources
    - Test filtering and sorting end-to-end
    - Test navigation to group detail page
    - _Requirements: All_

  - [ ]* 18.3 Write performance tests
    - Test with 100+ groups
    - Measure parallel vs sequential fetching time
    - Verify cache hit rates
    - Test frontend rendering performance
    - _Requirements: 15.1, 15.2, 15.3, 15.4_

- [x] 19. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Property tests validate universal correctness properties using fast-check with minimum 100 iterations
- Unit tests validate specific examples and edge cases
- Implementation uses TypeScript throughout (backend and frontend)
- Groups follow the same architectural pattern as nodes for consistency
- All 24 correctness properties from the design document are covered in property test tasks
