# Implementation Plan for Version 0.3.0

## Overview

Version 0.3.0 focuses on **fixing critical implementation issues** and **completing the plugin architecture migration**. This is a stabilization release that addresses bugs preventing core functionality from working.

## Phase 1: Complete Bolt Plugin Migration (CRITICAL)

- [x] 1. Create BoltPlugin wrapper implementing ExecutionToolPlugin and InformationSourcePlugin
  - Wrap existing BoltService with plugin interfaces
  - Implement initialize(), healthCheck(), getInventory(), executeAction()
  - Ensure backward compatibility with existing BoltService functionality
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [x] 2. Update server initialization to register Bolt as plugin
  - Remove direct BoltService instantiation from routes
  - Register BoltPlugin through IntegrationManager
  - Configure appropriate priority for Bolt
  - _Requirements: 1.1_

- [x] 3. Update routes to access Bolt through IntegrationManager
  - Modify inventory routes to use IntegrationManager.getAggregatedInventory()
  - Modify execution routes to use IntegrationManager.executeAction()
  - Remove direct BoltService dependencies from route handlers
  - _Requirements: 1.3, 1.4, 1.5_

- [x] 4. Test Bolt plugin integration
  - Verify inventory retrieval works through plugin interface
  - Verify command execution works through plugin interface
  - Verify task execution works through plugin interface
  - Verify facts gathering works through plugin interface
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

## Phase 2: Fix Puppetserver API Implementations (CRITICAL)

- [x] 5. Debug and fix Puppetserver certificate API
  - Add detailed logging to PuppetserverClient.getCertificates()
  - Verify correct API endpoint (/puppet-ca/v1/certificate_statuses)
  - Fixed: auth.conf needs regex pattern, not exact path match
  - Verify authentication headers are correct
  - Test with actual Puppetserver instance
  - Fix response parsing if needed
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [x] 6. Debug and fix Puppetserver facts API
  - Add detailed logging to PuppetserverClient.getFacts()
  - Verify correct API endpoint (/puppet/v3/facts/{certname})
  - Test response parsing with actual data
  - Handle missing facts gracefully
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [x] 7. Debug and fix Puppetserver node status API
  - Add detailed logging to PuppetserverClient.getStatus()
  - Verify correct API endpoint (/puppet/v3/status/{certname})
  - Fix "node not found" errors
  - Handle missing status gracefully
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [x] 8. Debug and fix Puppetserver environments API
  - Add detailed logging to PuppetserverClient.getEnvironments()
  - Verify correct API endpoint (/puppet/v3/environments)
  - Test response parsing
  - Handle empty environments list
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [x] 9. Debug and fix Puppetserver catalog compilation API
  - Add detailed logging to PuppetserverClient.compileCatalog()
  - Verify correct API endpoint (/puppet/v3/catalog/{certname})
  - Fix fake "environment 1" and "environment 2" issue
  - Use real environments from environments API
  - Test catalog resource parsing
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

## Phase 3: Fix PuppetDB API Implementations (CRITICAL)

- [x] 10. Debug and fix PuppetDB reports metrics parsing
  - Add detailed logging to PuppetDBService.getNodeReports()
  - Examine actual PuppetDB response structure for metrics
  - Fix metrics parsing to show correct values instead of "0 0 0"
  - Handle missing metrics gracefully
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [x] 11. Debug and fix PuppetDB catalog resources parsing
  - Add detailed logging to PuppetDBService.getNodeCatalog()
  - Examine actual PuppetDB response structure for resources
  - Fix resource parsing to show all resources
  - Handle empty catalogs gracefully
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

- [x] 12. Debug and fix PuppetDB events API
  - Add detailed logging to PuppetDBService.getNodeEvents()
  - Identify why events page hangs
  - Implement pagination or limit results
  - Add timeout handling
  - Test with large event datasets
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

## Phase 4: Fix Inventory Integration (CRITICAL)

- [x] 13. Debug why Puppetserver nodes don't appear in inventory
  - Add logging to IntegrationManager.getAggregatedInventory()
  - Verify Puppetserver plugin is registered and initialized
  - Verify getInventory() is called on Puppetserver plugin
  - Verify node transformation from certificates to Node format
  - Test inventory aggregation with multiple sources
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 14. Implement node linking across sources
  - Verify nodes with matching certnames are linked
  - Display source attribution for each node
  - Show multi-source indicators in UI
  - _Requirements: 3.3, 3.4_

## Phase 5: Restructure UI Navigation and Components (HIGH PRIORITY)

### 5.1 Top Navigation Updates

- [x] 23. Update top navigation links
  - Keep: Home, Inventory, Executions
  - Add: Puppet (new dedicated page)
  - Remove: Certificates from top nav (move to Puppet page)
  - _Requirements: 16.1_

### 5.2 Home Page Enhancements

- [x] 24. Add Puppet reports component to Home page
  - Display when PuppetDB integration is active
  - Show latest reports summary (all/failed/changed/noop)
  - Link to detailed Puppet page
  - _Requirements: 16.2_

### 5.3 New Puppet Page

- [x] 25. Create dedicated Puppet page
  - Move Environments tab from node detail page
  - Add Puppet reports for all nodes
  - Move Certificates page here (previously at top nav)
  - _Requirements: 16.3, 16.4, 16.5_

- [x] 26. Add Puppetserver status components
  - Component for /status/v1/services endpoint
  - Component for /status/v1/simple endpoint
  - Component for /puppet-admin-api/v1 endpoint
  - Component for /metrics/v2 (via Jolokia) with user warning
  - Display only when Puppetserver integration is active
  - _Requirements: 16.6_

- [x] 27. Add PuppetDB admin components
  - Component for /pdb/admin/v1/archive endpoint
  - Component for /pdb/admin/v1/summary-stats (with performance warning)
  - Display only when PuppetDB integration is active
  - _Requirements: 16.7_

### 5.4 Node Detail Page Restructuring

- [x] 28. Reorganize node detail tabs
  - Tab 1: Overview (general info, latest runs, executions)
  - Tab 2: Facts (from all sources)
  - Tab 3: Actions (software install, commands, tasks, execution history)
  - Tab 4: Puppet (certificate, status, catalog, reports, resources)
  - _Requirements: 16.8_

- [x] 29. Implement Overview tab
  - General node info (OS, IP from facts)
  - Latest puppet runs component (if PuppetDB enabled)
  - Latest executions list
  - _Requirements: 16.9_

- [x] 30. Implement Facts tab
  - Display facts from all sources
  - Show source attribution and timestamps
  - YAML export option
  - _Requirements: 16.10_

- [x] 31. Implement Actions tab
  - Rename "Install packages" to "Install software"
  - Move Execute Commands here
  - Move Execute Task here
  - Move Execution History here
  - _Requirements: 16.11_

- [x] 32. Implement Puppet tab
  - Sub-tab: Certificate Status
  - Sub-tab: Node Status
  - Sub-tab: Catalog Compilation
  - Sub-tab: Puppet Reports
  - Sub-tab: Catalog (from PuppetDB)
  - Sub-tab: Events
  - Sub-tab: Managed Resources (new)
  - _Requirements: 16.12_

- [x] 33. Implement Managed Resources sub-tab
  - Use PuppetDB /pdb/query/v4/resources endpoint
  - Show resources grouped by type
  - Use /pdb/query/v4/catalogs for catalog view
  - _Requirements: 16.13_

### 5.5 Expert Mode Implementation

- [x] 34. Review expert mode toggle
  - Global setting accessible from UI
  - Persist user preference
  - _Requirements: 16.14_

- [x] 35. Enhance all components with expert mode
  - Show all errors/output/debug information when enabled
  - Display commands used for operations
  - Show API endpoint info and request/response details
  - Add troubleshooting hints
  - Add setup instructions where needed
  - _Requirements: 16.15_

## Phase 6: Improve Error Handling and Logging (HIGH PRIORITY)

- [x] 23. Add comprehensive API logging
  - Log all API requests (method, endpoint, parameters)
  - Log all API responses (status, headers, body)
  - Log authentication details (without sensitive data)
  - Add request/response correlation IDs
  - _Requirements: 12.1, 12.2_

- [x] 24. Improve error messages
  - Display actionable error messages in UI
  - Include troubleshooting guidance
  - Distinguish between error types (connection, auth, timeout)
  - Show error details in developer console
  - _Requirements: 12.3, 12.4_

- [x] 25. Implement retry logic
  - Add exponential backoff for transient errors
  - Configure retry attempts per integration
  - Log retry attempts
  - Display retry status in UI
  - _Requirements: 12.5_

## Phase 7: Testing and Validation (HIGH PRIORITY)

- [x] 26. Create integration test suite
  - Test Bolt plugin integration
  - Test PuppetDB API calls with mock responses
  - Test Puppetserver API calls with mock responses
  - Test inventory aggregation
  - Test node linking

- [x] 27. Manual testing with real instances
  - Test with real Puppetserver instance
  - Test with real PuppetDB instance
  - Test with real Bolt inventory
  - Verify all UI pages work correctly
  - Document any remaining issues

- [x] 28. Performance testing
  - Test with large inventories (100+ nodes)
  - Test with large event datasets
  - Test with large catalogs
  - Identify and fix performance bottlenecks

## Phase 8: Documentation (MEDIUM PRIORITY)

- [x] 29. Update API documentation
  - Document correct API endpoints for each integration
  - Document authentication requirements
  - Document response formats
  - Document error codes

- [x] 30. Update troubleshooting guide
  - Document common errors and solutions
  - Document how to enable debug logging
  - Document how to test API connectivity
  - Document configuration requirements

- [x] 31. Update architecture documentation
  - Document plugin architecture
  - Document how integrations are registered
  - Document data flow through the system
  - Update diagrams

## Success Criteria

Version 0.3.0 is complete when:

1. ✅ Bolt is fully migrated to plugin architecture
2. ✅ All three integrations (Bolt, PuppetDB, Puppetserver) are registered as plugins
3. ✅ Inventory view shows nodes from all configured sources
4. ✅ Events page loads without hanging
5. ✅ All API calls have comprehensive logging
6. ✅ Error messages are actionable and helpful
7. ✅ Integration tests pass
8. ✅ Manual testing with real instances succeeds
9. ⬜ Navigation restructured with new Puppet page
10. ⬜ Home page shows Puppet reports summary
11. ⬜ Puppet page displays:
    - Environments
    - All node reports
    - Certificates
    - Puppetserver status components
    - PuppetDB admin components
12. ⬜ Node detail page restructured with new tab layout:
    - Overview tab with general info and latest runs
    - Facts tab with multi-source facts
    - Actions tab with all execution operations
    - Puppet tab with all Puppet-specific data
13. ⬜ Managed Resources view implemented
14. ⬜ Expert mode implemented across all components
15. ⬜ All components show appropriate troubleshooting hints

## Out of Scope for 0.3.0

The following features are deferred to future versions:

- Certificate signing/revocation operations
- Bulk certificate operations
- Certificate search and filtering
- Catalog comparison between environments
- Environment deployment
- Advanced node linking features
- Multi-Puppetserver support
- Property-based testing

These will be addressed in version 0.4.0 after the foundation is stable.
