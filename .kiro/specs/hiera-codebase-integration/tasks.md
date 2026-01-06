# Implementation Plan: Hiera and Local Puppet Codebase Integration

## Overview

This implementation plan breaks down the Hiera and Local Puppet Codebase Integration feature into discrete, incremental tasks. Each task builds on previous work, ensuring no orphaned code. The implementation follows the existing integration plugin architecture used by PuppetDB and Puppetserver integrations.

## Tasks

- [x] 1. Set up Hiera integration infrastructure
  - [x] 1.1 Create directory structure for Hiera integration
    - Create `backend/src/integrations/hiera/` directory
    - Create index.ts, types.ts files
    - _Requirements: 1.4, 13.1_

  - [x] 1.2 Define TypeScript types and interfaces
    - Define HieraConfig, HieraKey, HieraResolution, HieraKeyIndex interfaces
    - Define CodeAnalysisResult, LintIssue, ModuleUpdate interfaces
    - Define API request/response types
    - _Requirements: 14.1-14.6_

  - [x] 1.3 Add Hiera configuration schema
    - Add HieraConfig to backend/src/config/schema.ts
    - Add environment variable mappings
    - Update .env.example with Hiera configuration options
    - _Requirements: 1.1, 1.5, 3.2, 12.1_

- [x] 2. Implement HieraParser
  - [x] 2.1 Create HieraParser class
    - Implement hiera.yaml parsing for Hiera 5 format
    - Extract hierarchy levels, paths, data providers
    - Support yaml, json, eyaml backend detection
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 2.2 Write property test for Hiera config parsing round-trip
    - **Property 3: Hiera Configuration Parsing Round-Trip**
    - **Validates: Requirements 2.1, 2.2**

  - [x] 2.3 Implement lookup_options extraction
    - Parse lookup_options from hieradata files
    - Support merge strategies (first, unique, hash, deep)
    - _Requirements: 2.4_

  - [x] 2.4 Implement error handling for invalid hiera.yaml
    - Return descriptive errors with line numbers
    - Handle missing files gracefully
    - _Requirements: 2.5_

  - [x] 2.5 Write property test for parser error reporting
    - **Property 4: Hiera Parser Error Reporting**
    - **Validates: Requirements 2.5**

  - [x] 2.6 Implement hierarchy path interpolation
    - Support %{facts.xxx} variable syntax
    - Support %{::xxx} legacy syntax
    - _Requirements: 2.6_

  - [x] 2.7 Write property test for path interpolation
    - **Property 5: Hierarchy Path Interpolation**
    - **Validates: Requirements 2.6**

- [x] 3. Checkpoint - Ensure parser tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement FactService
  - [x] 4.1 Create FactService class
    - Implement thin wrapper around existing PuppetDB integration
    - Delegate to IntegrationManager.getInformationSource('puppetdb').getNodeFacts()
    - Support local fact files as fallback only
    - _Requirements: 3.1, 3.2_

  - [x] 4.2 Implement local fact file parsing (fallback only)
    - Parse JSON files in Puppetserver format
    - Support "name" and "values" structure
    - Only used when PuppetDB unavailable or missing facts
    - _Requirements: 3.3, 3.4_

  - [x] 4.3 Write property test for local fact file parsing
    - **Property 7: Local Fact File Parsing**
    - **Validates: Requirements 3.3, 3.4**

  - [x] 4.4 Implement fact source priority logic
    - Prefer PuppetDB when available
    - Fall back to local facts with warning
    - Return empty set with warning when no facts available
    - _Requirements: 3.5, 3.6_

  - [x] 4.5 Write property test for fact source priority
    - **Property 6: Fact Source Priority**
    - **Validates: Requirements 3.1, 3.5**

- [x] 5. Implement HieraScanner
  - [x] 5.1 Create HieraScanner class
    - Recursively scan hieradata directories
    - Extract unique keys from YAML/JSON files
    - Track file path, hierarchy level, line number for each key
    - _Requirements: 4.1, 4.2_

  - [x] 5.2 Implement nested key support
    - Handle dot notation keys (e.g., profile::nginx::port)
    - Build hierarchical key index
    - _Requirements: 4.3_

  - [x] 5.3 Implement multi-occurrence tracking
    - Track all locations where a key appears
    - Store value at each location
    - _Requirements: 4.4_

  - [x] 5.4 Write property test for key scanning completeness
    - **Property 8: Key Scanning Completeness**
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4**

  - [x] 5.5 Implement key search functionality
    - Support partial key name matching
    - Case-insensitive search
    - _Requirements: 4.5_

  - [x] 5.6 Write property test for key search
    - **Property 9: Key Search Functionality**
    - **Validates: Requirements 4.5, 7.4**

  - [x] 5.7 Implement file watching for cache invalidation
    - Watch hieradata directory for changes
    - Invalidate affected cache entries
    - _Requirements: 4.6, 15.2_

- [x] 6. Checkpoint - Ensure scanner tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement HieraResolver
  - [x] 7.1 Create HieraResolver class
    - Implement key resolution using hierarchy and facts
    - Support all lookup methods (first, unique, hash, deep)
    - _Requirements: 5.1, 5.2_

  - [x] 7.2 Implement lookup_options handling
    - Apply merge behavior from lookup_options
    - Support knockout_prefix for deep merges
    - _Requirements: 5.3_

  - [x] 7.3 Implement source tracking
    - Track which hierarchy level provided the value
    - Record all values from all levels
    - _Requirements: 5.4_

  - [x] 7.4 Write property test for resolution correctness
    - **Property 10: Hiera Resolution Correctness**
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4**

  - [x] 7.5 Implement value interpolation
    - Replace %{facts.xxx} with fact values
    - Handle nested interpolation
    - _Requirements: 5.5_

  - [x] 7.6 Write property test for value interpolation
    - **Property 11: Value Interpolation**
    - **Validates: Requirements 5.5**

  - [x] 7.7 Implement missing key handling
    - Return appropriate indicator for missing keys
    - Do not throw errors for missing keys
    - _Requirements: 5.6_

  - [x] 7.8 Write property test for missing key handling
    - **Property 12: Missing Key Handling**
    - **Validates: Requirements 5.6, 3.6**

- [x] 8. Checkpoint - Ensure resolver tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Implement HieraService
  - [x] 9.1 Create HieraService class
    - Orchestrate HieraParser, HieraScanner, HieraResolver, FactService
    - Implement caching layer
    - _Requirements: 15.1, 15.5_

  - [x] 9.2 Implement getAllKeys and searchKeys methods
    - Return all discovered keys
    - Support search filtering
    - _Requirements: 4.5_

  - [x] 9.3 Implement resolveKey and resolveAllKeys methods
    - Resolve single key for a node
    - Resolve all keys for a node
    - _Requirements: 5.1_

  - [x] 9.4 Implement getNodeHieraData method
    - Return all Hiera data for a node
    - Include used/unused key classification
    - _Requirements: 6.2, 6.6_

  - [x] 9.5 Write property test for key usage filtering
    - **Property 13: Key Usage Filtering**
    - **Validates: Requirements 6.6**

  - [x] 9.6 Implement getKeyValuesAcrossNodes method
    - Return key values for all nodes
    - Include source file info
    - _Requirements: 7.2, 7.3_

  - [x] 9.7 Write property test for global key resolution
    - **Property 14: Global Key Resolution Across Nodes**
    - **Validates: Requirements 7.2, 7.3, 7.6**

  - [x] 9.8 Write property test for node grouping by value
    - **Property 15: Node Grouping by Value**
    - **Validates: Requirements 7.5**

  - [x] 9.9 Implement cache management
    - Cache parsed hieradata
    - Cache resolved values per node
    - Implement cache invalidation on file changes
    - _Requirements: 15.1, 15.2, 15.5_

  - [x] 9.10 Write property test for cache correctness ✅ PBT PASSED
    - **Property 28: Cache Correctness**
    - **Validates: Requirements 15.1, 15.5**

  - [x] 9.11 Write property test for cache invalidation ✅ PBT PASSED
    - **Property 29: Cache Invalidation on File Change**
    - **Validates: Requirements 15.2**

- [x] 10. Checkpoint - Ensure HieraService tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Implement catalog compilation mode
  - [x] 11.1 Add catalog compilation configuration
    - Add enabled/disabled setting
    - Add timeout and cache TTL settings
    - _Requirements: 12.1_

  - [x] 11.2 Implement catalog compilation for variable resolution
    - Attempt catalog compilation when enabled
    - Extract code-defined variables
    - _Requirements: 12.3_

  - [x] 11.3 Implement fallback behavior
    - Fall back to fact-only resolution on failure
    - Display warning when fallback occurs
    - _Requirements: 12.4_

  - [x] 11.4 Write property test for catalog compilation mode ✅ PBT PASSED
    - **Property 24: Catalog Compilation Mode Behavior**
    - **Validates: Requirements 12.2, 12.3, 12.4**

  - [x] 11.5 Implement catalog caching
    - Cache compiled catalogs
    - Implement appropriate invalidation
    - _Requirements: 12.6_

- [x] 12. Implement CodeAnalyzer
  - [x] 12.1 Create CodeAnalyzer class
    - Set up Puppet manifest parsing
    - Implement analysis result caching
    - _Requirements: 15.3_

  - [x] 12.2 Implement unused code detection
    - Detect unused classes
    - Detect unused defined types
    - Detect unused Hiera keys
    - _Requirements: 8.1, 8.2, 8.3_

  - [ ]* 12.3 Write property test for unused code detection
    - **Property 16: Unused Code Detection**
    - **Validates: Requirements 8.1, 8.2, 8.3**

  - [x] 12.4 Implement unused code metadata
    - Include file path, line number, type for each item
    - _Requirements: 8.4_

  - [ ]* 12.5 Write property test for unused code metadata
    - **Property 17: Unused Code Metadata**
    - **Validates: Requirements 8.4**

  - [x] 12.6 Implement exclusion pattern support
    - Allow excluding patterns from unused detection
    - _Requirements: 8.5_

  - [ ]* 12.7 Write property test for exclusion patterns
    - **Property 18: Exclusion Pattern Support**
    - **Validates: Requirements 8.5**

  - [x] 12.8 Implement lint issue detection
    - Detect Puppet syntax errors
    - Detect common style violations
    - _Requirements: 9.1, 9.2_

  - [ ]* 12.9 Write property test for lint issue detection
    - **Property 19: Lint Issue Detection**
    - **Validates: Requirements 9.1, 9.2, 9.3**

  - [x] 12.10 Implement issue filtering
    - Filter by severity
    - Filter by type
    - _Requirements: 9.4_

  - [ ]* 12.11 Write property test for issue filtering
    - **Property 20: Issue Filtering**
    - **Validates: Requirements 9.4**

  - [x] 12.12 Implement issue counting by category
    - Group and count issues
    - _Requirements: 9.5_

- [x] 13. Checkpoint - Ensure CodeAnalyzer tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 14. Implement Puppetfile analysis
  - [x] 14.1 Implement Puppetfile parsing
    - Extract module names, versions, sources
    - Handle forge and git modules
    - _Requirements: 10.1_

  - [ ]* 14.2 Write property test for Puppetfile parsing
    - **Property 21: Puppetfile Parsing**
    - **Validates: Requirements 10.1**

  - [x] 14.3 Implement module update detection
    - Query Puppet Forge for latest versions
    - Compare with current versions
    - _Requirements: 10.2_

  - [ ]* 14.4 Write property test for module update detection
    - **Property 22: Module Update Detection**
    - **Validates: Requirements 10.2, 10.3**

  - [x] 14.5 Implement security advisory detection
    - Check for security advisories on modules
    - _Requirements: 10.4_

  - [x] 14.6 Implement Puppetfile error handling
    - Return descriptive errors for parse failures
    - _Requirements: 10.5_

- [x] 15. Implement usage statistics
  - [x] 15.1 Implement class usage counting
    - Count class usage across nodes
    - Rank by frequency
    - _Requirements: 11.1_

  - [x] 15.2 Implement code counting
    - Count manifests, classes, defined types, functions
    - Calculate lines of code
    - _Requirements: 11.2, 11.3_

  - [ ]* 15.3 Write property test for code statistics
    - **Property 23: Code Statistics Accuracy**
    - **Validates: Requirements 11.1, 11.2, 11.3**

  - [x] 15.4 Implement most used items ranking
    - Rank classes by usage
    - Rank resources by count
    - _Requirements: 11.5_

- [ ] 16. Checkpoint - Ensure statistics tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 17. Implement HieraPlugin
  - [x] 17.1 Create HieraPlugin class extending BasePlugin
    - Implement InformationSourcePlugin interface
    - Wire up HieraService and CodeAnalyzer
    - _Requirements: 1.4_

  - [x] 17.2 Implement control repository validation
    - Validate path exists and is accessible
    - Validate expected Puppet structure
    - _Requirements: 1.2, 1.3_

  - [ ]* 17.3 Write property test for repository validation
    - **Property 2: Control Repository Validation**
    - **Validates: Requirements 1.2, 1.3**

  - [x] 17.4 Implement health check
    - Check control repo accessibility
    - Check hiera.yaml validity
    - Report integration status
    - _Requirements: 13.2, 13.3_

  - [x] 17.5 Implement enable/disable functionality
    - Support disabling without removing config
    - _Requirements: 13.5_

  - [ ]* 17.6 Write property test for enable/disable persistence
    - **Property 25: Integration Enable/Disable Persistence**
    - **Validates: Requirements 13.5**

  - [x] 17.7 Implement hot reload
    - Reload control repo data on config change
    - _Requirements: 1.6_

- [x] 18. Implement API routes
  - [x] 18.1 Create Hiera API routes file
    - Set up Express router
    - Add authentication middleware
    - _Requirements: 14.1-14.6_

  - [x] 18.2 Implement key discovery endpoints
    - GET /api/integrations/hiera/keys
    - GET /api/integrations/hiera/keys/search
    - GET /api/integrations/hiera/keys/{key}
    - _Requirements: 14.1_

  - [x] 18.3 Implement node-specific endpoints
    - GET /api/integrations/hiera/nodes/{nodeId}/data
    - GET /api/integrations/hiera/nodes/{nodeId}/keys
    - GET /api/integrations/hiera/nodes/{nodeId}/keys/{key}
    - _Requirements: 14.2, 14.3_

  - [x] 18.4 Implement global key lookup endpoint
    - GET /api/integrations/hiera/keys/{key}/nodes
    - _Requirements: 14.2_

  - [x] 18.5 Implement code analysis endpoints
    - GET /api/integrations/hiera/analysis
    - GET /api/integrations/hiera/analysis/unused
    - GET /api/integrations/hiera/analysis/lint
    - GET /api/integrations/hiera/analysis/modules
    - GET /api/integrations/hiera/analysis/statistics
    - _Requirements: 14.4, 14.5_

  - [x] 18.6 Implement status and reload endpoints
    - GET /api/integrations/hiera/status
    - POST /api/integrations/hiera/reload
    - _Requirements: 13.2_

  - [x] 18.7 Implement error handling for unconfigured integration
    - Return 503 with setup guidance
    - _Requirements: 14.6_

  - [ ]* 18.8 Write property test for API response correctness
    - **Property 26: API Response Correctness**
    - **Validates: Requirements 14.1, 14.2, 14.3, 14.4, 14.5**

  - [ ]* 18.9 Write property test for API error handling
    - **Property 27: API Error Handling**
    - **Validates: Requirements 14.6**

  - [x] 18.10 Implement pagination for large result sets
    - Add pagination parameters
    - Return pagination metadata
    - _Requirements: 15.6_

  - [ ]* 18.11 Write property test for pagination correctness
    - **Property 30: Pagination Correctness**
    - **Validates: Requirements 15.6**

- [ ] 19. Checkpoint - Ensure API tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 20. Implement frontend NodeHieraTab component
  - [x] 20.1 Create NodeHieraTab.svelte component
    - Set up component structure
    - Add to NodeDetailPage tabs
    - _Requirements: 6.1_

  - [x] 20.2 Implement key list display
    - Display searchable list of all keys
    - Show values from each hierarchy level
    - _Requirements: 6.2, 6.3_

  - [x] 20.3 Implement resolved value highlighting
    - Highlight the resolved value
    - Show visual indicator for used keys
    - _Requirements: 6.4, 6.5_

  - [x] 20.4 Implement key filtering
    - Filter by used/unused status
    - _Requirements: 6.6_

  - [x] 20.5 Implement expert mode details
    - Show lookup method, source file paths
    - Show interpolation details
    - _Requirements: 6.7_

- [x] 21. Implement frontend GlobalHieraTab component
  - [x] 21.1 Create GlobalHieraTab.svelte component
    - Set up component structure
    - Add to PuppetPage tabs
    - _Requirements: 7.1_

  - [x] 21.2 Implement key search
    - Add search input
    - Support partial key name matching
    - _Requirements: 7.4_

  - [x] 21.3 Implement results display
    - Show resolved value for each node
    - Show source file info
    - _Requirements: 7.2, 7.3_

  - [x] 21.4 Implement node grouping
    - Group nodes by resolved value
    - Indicate nodes where key is not defined
    - _Requirements: 7.5, 7.6_

- [x] 22. Implement frontend CodeAnalysisTab component
  - [x] 22.1 Create CodeAnalysisTab.svelte component
    - Set up component structure
    - Add to PuppetPage tabs
    - _Requirements: 8.4, 9.3, 10.3, 11.4_

  - [x] 22.2 Implement statistics dashboard
    - Display code statistics
    - Show most used classes
    - _Requirements: 11.4, 11.5_

  - [x] 22.3 Implement unused code section
    - Display unused classes, defined types, keys
    - Show file location and type
    - _Requirements: 8.4_

  - [x] 22.4 Implement lint issues section
    - Display issues with severity, file, line, description
    - Support filtering by severity and type
    - _Requirements: 9.3, 9.4_

  - [x] 22.5 Implement module updates section
    - Display current and latest versions
    - Indicate security advisories
    - _Requirements: 10.3, 10.4_

- [x] 23. Implement frontend HieraSetupGuide component
  - [x] 23.1 Create HieraSetupGuide.svelte component
    - Set up component structure
    - Add to IntegrationSetupPage
    - _Requirements: 13.1_

  - [x] 23.2 Implement setup instructions
    - Step-by-step configuration guide
    - Control repo path configuration
    - _Requirements: 13.4_

  - [x] 23.3 Implement fact source configuration
    - PuppetDB vs local facts selection
    - Local facts path configuration
    - _Requirements: 3.2_

  - [x] 23.4 Implement catalog compilation toggle
    - Enable/disable toggle
    - Performance implications explanation
    - _Requirements: 12.5_

  - [x] 23.5 Implement connection test
    - Test button to validate configuration
    - Display validation results
    - _Requirements: 1.2_

- [x] 24. Implement IntegrationStatus updates
  - [x] 24.1 Update IntegrationStatus component
    - Add Hiera integration status display
    - Show health status (connected, error, not configured)
    - _Requirements: 13.2_

  - [x] 24.2 Implement error message display
    - Show actionable error messages
    - _Requirements: 13.3_

  - [x] 24.3 Implement expert mode diagnostics
    - Show detailed diagnostic info in expert mode
    - _Requirements: 13.6_

- [x] 25. Wire up integration
  - [x] 25.1 Register HieraPlugin with IntegrationManager
    - Add to plugin registration in server startup
    - _Requirements: 1.4_

  - [x] 25.2 Add Hiera routes to Express app
    - Mount routes at /api/integrations/hiera
    - _Requirements: 14.1-14.6_

  - [x] 25.3 Update Navigation component
    - Add Hiera-related navigation items
    - _Requirements: 6.1, 7.1_

  - [x] 25.4 Update Router component
    - Add routes for new pages/tabs
    - _Requirements: 6.1, 7.1_

- [ ] 26. Final checkpoint - Full integration test
  - Ensure all tests pass, ask the user if questions arise.
  - Test end-to-end flow with sample control repository
  - Verify all UI components render correctly
  - Verify all API endpoints respond correctly

## Notes

- Tasks marked with `*` are optional property-based tests that can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- The implementation follows the existing integration plugin architecture
- Frontend components use Svelte 5 with TypeScript
- Backend uses Express with TypeScript
