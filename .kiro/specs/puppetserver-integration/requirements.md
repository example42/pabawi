# Requirements Document

## Introduction

This document specifies the requirements for version 0.3.0 of Pabawi, which focuses on **fixing critical implementation issues** and **completing the plugin architecture migration** for all integrations. Version 0.3.0 establishes a consistent plugin-based architecture across Bolt, PuppetDB, and Puppetserver, removing legacy 0.1.0 implementation patterns where integrations were not properly abstracted.

### Critical Issues to Address

The current implementation has several critical bugs that prevent core functionality from working:

1. **Bolt Integration**: Still uses legacy 0.1.0 patterns with direct BoltService usage instead of plugin architecture
2. **Inventory View**: Does not show Puppetserver nodes
3. **Node View Issues**:
   - Puppetserver facts don't show up
   - Certificate status returns errors
   - Node status returns "node not found" for existing nodes
   - Catalog compilation shows fake "environment 1" and "environment 2"
   - Environments tab shows no environments
   - Puppet reports from PuppetDB show "0 0 0" for all values
   - Catalog from PuppetDB shows no resources
   - No view of catalog from Puppetserver (should merge catalog tabs)
4. **Events Page**: Hangs indefinitely
5. **Certificates Page**: Shows no certificates

### Version 0.3.0 Goals

1. **Complete Plugin Migration**: Migrate Bolt to use the plugin architecture consistently with PuppetDB and Puppetserver
2. **Fix API Implementations**: Correct PuppetDB and Puppetserver API implementations that are causing data retrieval failures
3. **Fix UI Integration**: Ensure all UI components properly call backend APIs and handle responses
4. **Establish Baseline**: Create a stable, working foundation for all three integrations before adding new features

This version prioritizes **fixing existing functionality** over adding new features, establishing a solid foundation for future enhancements.

## Glossary

- **Pabawi**: A general-purpose remote execution interface that integrates multiple infrastructure management tools (Bolt, PuppetDB, Puppetserver, Ansible, etc.)
- **Puppetserver**: The Puppet server application that compiles catalogs, serves files, and manages the certificate authority
- **Certificate Authority (CA)**: The Puppetserver component that issues, signs, and revokes SSL certificates for Puppet agents
- **Certname**: The unique identifier for a node in Puppet, typically the fully qualified domain name (FQDN)
- **Certificate Request (CSR)**: A request from a Puppet agent to have its certificate signed by the CA
- **Signed Certificate**: A certificate that has been approved and signed by the CA, allowing the node to communicate with Puppetserver
- **Revoked Certificate**: A certificate that has been invalidated and can no longer be used for authentication
- **Puppet Environment**: A isolated branch of Puppet code that can be deployed and tested independently
- **Catalog Compilation**: The process of generating a node-specific catalog from Puppet code for a given environment
- **Node Status**: Information about a node's last Puppet run, including timestamp, success/failure, and catalog version
- **Inventory Source**: A system or service that provides a list of nodes available for remote execution operations
- **Information Source**: A backend system that provides node data (PuppetDB, Puppetserver, cloud APIs, etc.)
- **Node Linking**: The process of associating nodes from different sources based on matching identifiers (e.g., hostname/certname)
- **Integration Plugin**: A modular component that connects Pabawi to an external system following the established plugin architecture

## Requirements

### Requirement 1: Complete Bolt Plugin Migration

**User Story:** As a developer, I want Bolt to be implemented as a proper plugin following the same architecture as PuppetDB and Puppetserver, so that all integrations are consistent and maintainable.

#### Acceptance Criteria

1. WHEN the system initializes THEN Bolt SHALL be registered as a plugin through IntegrationManager using the plugin architecture
2. WHEN Bolt is registered THEN it SHALL implement both ExecutionToolPlugin and InformationSourcePlugin interfaces
3. WHEN routes need Bolt functionality THEN they SHALL access it through IntegrationManager, not direct BoltService instances
4. WHEN Bolt provides inventory THEN it SHALL be accessible through the same getInventory() interface as other information sources
5. WHEN Bolt executes actions THEN it SHALL be accessible through the executeAction() interface like other execution tools

### Requirement 2: Fix Puppetserver Certificate API

**User Story:** As an infrastructure administrator, I want to view all nodes in the Puppetserver certificate authority, so that I can see which nodes have certificates and their certificate status.

#### Acceptance Criteria

1. WHEN the system queries Puppetserver certificates endpoint THEN it SHALL use the correct API path and authentication
2. WHEN Puppetserver returns certificate data THEN the system SHALL correctly parse and transform the response
3. WHEN displaying certificates THEN the system SHALL show the certname, status, fingerprint, and expiration date for each certificate
4. WHEN the certificates page loads THEN it SHALL display all certificates without errors
5. WHEN Puppetserver connection fails THEN the system SHALL display an error message and continue to show data from other available sources

### Requirement 3: Fix Puppetserver Inventory Integration

**User Story:** As an infrastructure administrator, I want to see nodes from Puppetserver CA in the inventory view, so that I can discover and manage nodes that have registered with Puppet.

#### Acceptance Criteria

1. WHEN the inventory page loads THEN it SHALL display nodes from all configured sources including Puppetserver
2. WHEN Puppetserver provides nodes THEN they SHALL be correctly transformed to the normalized Node format
3. WHEN a node exists in multiple sources THEN the system SHALL link them based on matching certname/hostname
4. WHEN displaying inventory THEN each node SHALL show its source(s) clearly
5. WHEN filtering inventory THEN the system SHALL support filtering by source and certificate status

### Requirement 4: Fix Puppetserver Facts API

**User Story:** As an infrastructure administrator, I want to view node facts from Puppetserver on the node detail page, so that I can see current system information.

#### Acceptance Criteria

1. WHEN viewing a node detail page THEN the system SHALL query Puppetserver for node facts using the correct API endpoint
2. WHEN Puppetserver returns facts THEN the system SHALL correctly parse and display them in the Facts tab
3. WHEN facts are available from multiple sources THEN the system SHALL display all sources with timestamps
4. WHEN Puppetserver facts retrieval fails THEN the system SHALL display an error message while preserving facts from other sources
5. WHEN no facts are available THEN the system SHALL display a clear "no facts available" message

### Requirement 5: Fix Puppetserver Node Status API

**User Story:** As an infrastructure administrator, I want to view node status from Puppetserver without errors, so that I can see when nodes last checked in.

#### Acceptance Criteria

1. WHEN viewing a node detail page THEN the system SHALL query Puppetserver status API using the correct endpoint and authentication
2. WHEN Puppetserver returns node status THEN the system SHALL correctly parse and display it without "node not found" errors
3. WHEN a node exists in Puppetserver THEN the status SHALL display last run timestamp, catalog version, and run status
4. WHEN node status is unavailable THEN the system SHALL display a clear message without blocking other functionality
5. WHEN the API call fails THEN the system SHALL log detailed error information for debugging

### Requirement 6: Fix Puppetserver Catalog Compilation

**User Story:** As an infrastructure administrator, I want to compile and view catalogs from Puppetserver with real environments, so that I can see what would be applied to nodes.

#### Acceptance Criteria

1. WHEN viewing the catalog tab THEN the system SHALL display real environments from Puppetserver, not fake "environment 1" and "environment 2"
2. WHEN a user selects an environment THEN the system SHALL call the correct Puppetserver catalog compilation API endpoint
3. WHEN Puppetserver compiles a catalog THEN the system SHALL parse and display resources correctly
4. WHEN displaying a compiled catalog THEN the system SHALL show the environment name, compilation timestamp, and all resources
5. WHEN catalog compilation fails THEN the system SHALL display detailed error messages with actionable information

### Requirement 7: Fix Puppetserver Environments API

**User Story:** As an infrastructure administrator, I want to view real Puppet environments, so that I can understand what code versions are available.

#### Acceptance Criteria

1. WHEN the environments tab loads THEN the system SHALL query Puppetserver environments API using the correct endpoint
2. WHEN Puppetserver returns environments THEN the system SHALL parse and display them correctly
3. WHEN displaying environments THEN the system SHALL show environment names and metadata
4. WHEN no environments are configured THEN the system SHALL display a clear message
5. WHEN the API call fails THEN the system SHALL display an error message with troubleshooting guidance

### Requirement 8: Fix PuppetDB Reports API

**User Story:** As an infrastructure administrator, I want to view Puppet reports with correct metrics, so that I can see resource changes and run statistics.

#### Acceptance Criteria

1. WHEN viewing the reports tab THEN the system SHALL query PuppetDB reports API using the correct endpoint and query format
2. WHEN PuppetDB returns reports THEN the system SHALL correctly parse metrics instead of showing "0 0 0" for all values
3. WHEN displaying reports THEN the system SHALL show changed, unchanged, and failed resource counts accurately
4. WHEN report metrics are missing THEN the system SHALL handle gracefully and display available information
5. WHEN the API call fails THEN the system SHALL display an error message while preserving other node functionality

### Requirement 9: Fix PuppetDB Catalog API

**User Story:** As an infrastructure administrator, I want to view catalog resources from PuppetDB, so that I can see what is currently applied to nodes.

#### Acceptance Criteria

1. WHEN viewing the catalog tab THEN the system SHALL query PuppetDB catalog API using the correct endpoint
2. WHEN PuppetDB returns a catalog THEN the system SHALL correctly parse and display all resources
3. WHEN displaying catalog resources THEN the system SHALL show resource type, title, and parameters
4. WHEN no catalog is available THEN the system SHALL display a clear "no catalog available" message
5. WHEN the API call fails THEN the system SHALL display an error message with troubleshooting information

### Requirement 10: Fix Events Page Performance

**User Story:** As an infrastructure administrator, I want the events page to load without hanging, so that I can view node events.

#### Acceptance Criteria

1. WHEN navigating to the events page THEN the system SHALL query PuppetDB events API efficiently without hanging
2. WHEN PuppetDB returns events THEN the system SHALL parse and display them without blocking the UI
3. WHEN there are many events THEN the system SHALL implement pagination or lazy loading
4. WHEN the API call is slow THEN the system SHALL show a loading indicator and allow cancellation
5. WHEN the API call fails THEN the system SHALL display an error message and allow retry

### Requirement 11: Merge and Fix Catalog Views

**User Story:** As an infrastructure administrator, I want a unified catalog view that shows catalogs from both PuppetDB and Puppetserver, so that I can compare current vs. compiled catalogs.

#### Acceptance Criteria

1. WHEN viewing the catalog tab THEN the system SHALL provide options to view catalog from PuppetDB (current) or compile from Puppetserver
2. WHEN displaying catalogs THEN the system SHALL clearly indicate the source (PuppetDB vs. Puppetserver)
3. WHEN both catalogs are available THEN the system SHALL allow side-by-side comparison
4. WHEN displaying resources THEN the system SHALL use a consistent format regardless of source
5. WHEN either source fails THEN the system SHALL display the available catalog and show an error for the unavailable one

### Requirement 12: Improve Error Handling and Logging

**User Story:** As a developer, I want comprehensive error handling and logging, so that I can quickly diagnose and fix API integration issues.

#### Acceptance Criteria

1. WHEN any API call fails THEN the system SHALL log the full request details (endpoint, method, parameters)
2. WHEN any API call fails THEN the system SHALL log the full response (status code, headers, body)
3. WHEN displaying errors to users THEN the system SHALL provide actionable error messages
4. WHEN network errors occur THEN the system SHALL distinguish between connection failures, timeouts, and authentication errors
5. WHEN errors are transient THEN the system SHALL implement retry logic with exponential backoff

### Requirement 13: Restructure Navigation and Pages

**User Story:** As a user, I want a reorganized navigation structure that groups Puppet-related functionality together, so that I can easily find and access Puppet features.

#### Acceptance Criteria

1. WHEN viewing the top navigation THEN it SHALL display: Home, Inventory, Executions, Puppet
2. WHEN viewing the Home page with PuppetDB active THEN it SHALL display a Puppet reports summary component
3. WHEN navigating to the Puppet page THEN it SHALL display Environments, Reports, and Certificates sections
4. WHEN viewing the Puppet page with Puppetserver active THEN it SHALL display Puppetserver status components
5. WHEN viewing the Puppet page with PuppetDB active THEN it SHALL display PuppetDB admin components

### Requirement 14: Restructure Node Detail Page

**User Story:** As a user, I want a reorganized node detail page that groups related functionality into logical tabs, so that I can efficiently navigate node information.

#### Acceptance Criteria

1. WHEN viewing a node detail page THEN it SHALL display four main tabs: Overview, Facts, Actions, Puppet
2. WHEN viewing the Overview tab THEN it SHALL display general node info, latest Puppet runs, and latest executions
3. WHEN viewing the Facts tab THEN it SHALL display facts from all sources with source attribution and YAML export option
4. WHEN viewing the Actions tab THEN it SHALL display Install software, Execute Commands, Execute Task, and Execution History
5. WHEN viewing the Puppet tab THEN it SHALL display sub-tabs for Certificate Status, Node Status, Catalog Compilation, Reports, Catalog, Events, and Managed Resources

### Requirement 15: Implement Managed Resources View

**User Story:** As a user, I want to view managed resources from PuppetDB, so that I can see all resources managed by Puppet on a node.

#### Acceptance Criteria

1. WHEN viewing the Managed Resources sub-tab THEN the system SHALL query PuppetDB /pdb/query/v4/resources endpoint
2. WHEN displaying managed resources THEN they SHALL be grouped by resource type
3. WHEN viewing resource details THEN the system SHALL use /pdb/query/v4/catalogs for catalog information
4. WHEN no resources are available THEN the system SHALL display a clear message
5. WHEN the API call fails THEN the system SHALL display an error with troubleshooting guidance

### Requirement 16: Implement Expert Mode

**User Story:** As a power user or developer, I want an expert mode that shows detailed technical information, so that I can troubleshoot issues and understand system operations.

#### Acceptance Criteria

1. WHEN expert mode is enabled THEN all components SHALL display detailed error messages and debug information
2. WHEN expert mode is enabled and a command is executed THEN the system SHALL display the exact command used
3. WHEN expert mode is enabled and an API call is made THEN the system SHALL display endpoint info and request/response details
4. WHEN expert mode is enabled THEN components SHALL display troubleshooting hints
5. WHEN expert mode is enabled THEN components SHALL display setup instructions where applicable

### Requirement 17: Add Puppetserver Status Components

**User Story:** As an administrator, I want to view Puppetserver status and metrics, so that I can monitor the health of my Puppet infrastructure.

#### Acceptance Criteria

1. WHEN viewing the Puppet page with Puppetserver active THEN it SHALL display a component for /status/v1/services
2. WHEN viewing the Puppet page with Puppetserver active THEN it SHALL display a component for /status/v1/simple
3. WHEN viewing the Puppet page with Puppetserver active THEN it SHALL display a component for /puppet-admin-api/v1
4. WHEN viewing the Puppet page with Puppetserver active THEN it SHALL display a component for /metrics/v2 with performance warning
5. WHEN Puppetserver is not active THEN these components SHALL not be displayed

### Requirement 18: Add PuppetDB Admin Components

**User Story:** As an administrator, I want to view PuppetDB administrative information, so that I can monitor and manage my PuppetDB instance.

#### Acceptance Criteria

1. WHEN viewing the Puppet page with PuppetDB active THEN it SHALL display a component for /pdb/admin/v1/archive
2. WHEN viewing the Puppet page with PuppetDB active THEN it SHALL display a component for /pdb/admin/v1/summary-stats with performance warning
3. WHEN displaying summary-stats THEN the system SHALL warn users about resource consumption
4. WHEN PuppetDB is not active THEN these components SHALL not be displayed
5. WHEN API calls fail THEN the system SHALL display errors with troubleshooting guidance

## Summary

Version 0.3.0 focuses on **fixing critical bugs** rather than adding new features. The primary goals are:

1. **Complete Plugin Architecture**: Migrate Bolt to use the plugin system consistently
2. **Fix API Implementations**: Correct all PuppetDB and Puppetserver API calls
3. **Fix UI Integration**: Ensure UI components properly call and handle backend responses
4. **Improve Observability**: Add comprehensive logging for debugging

Once these issues are resolved, version 0.3.0 will provide a stable foundation with three working integrations: Bolt, PuppetDB, and Puppetserver.
