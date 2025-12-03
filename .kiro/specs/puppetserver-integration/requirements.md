# Requirements Document

## Introduction

This document specifies the requirements for version 0.3.0 of Pabawi, which adds Puppetserver as an additional integration to complement the existing PuppetDB integration. Puppetserver provides critical infrastructure management capabilities including certificate authority (CA) management, environment deployment, catalog compilation, and node status tracking. This integration establishes Puppetserver as both an information source for node discovery and a management interface for Puppet infrastructure operations.

The Puppetserver integration will provide visibility into the certificate authority, allowing administrators to manage node certificates and use the CA as an additional inventory source. Nodes discovered through Puppetserver CA will be linked with nodes from PuppetDB when hostnames match, providing a unified view across both systems. Additionally, this integration enables catalog retrieval for different environments, node status monitoring based on last Puppet run, facts retrieval, and environment management capabilities.

This version is designed with extensibility in mind, following the plugin architecture established in version 0.2.0, to accommodate future integrations such as Ansible in version 0.4.0.

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

### Requirement 1

**User Story:** As an infrastructure administrator, I want to view all nodes in the Puppetserver certificate authority, so that I can see which nodes have certificates and their certificate status.

#### Acceptance Criteria

1. WHEN the system is configured with Puppetserver connection details THEN Pabawi SHALL retrieve the list of all certificates from the Puppetserver CA
2. WHEN Puppetserver returns certificate data THEN the system SHALL display certificates with their status (signed, requested, revoked)
3. WHEN displaying certificates THEN the system SHALL show the certname, status, fingerprint, and expiration date for each certificate
4. WHEN the certificate list loads THEN the system SHALL support filtering by certificate status (signed, requested, revoked)
5. WHEN Puppetserver connection fails THEN the system SHALL display an error message and continue to show data from other available sources

### Requirement 2

**User Story:** As an infrastructure administrator, I want to use Puppetserver CA as an inventory source, so that I can discover and manage nodes that have registered with Puppet.

#### Acceptance Criteria

1. WHEN Puppetserver is configured as an inventory source THEN the system SHALL retrieve nodes from the CA and transform them into normalized inventory format
2. WHEN displaying inventory THEN the system SHALL show nodes from Puppetserver CA alongside nodes from other inventory sources with clear source attribution
3. WHEN a node exists in both Puppetserver CA and PuppetDB THEN the system SHALL link the nodes based on matching certname/hostname
4. WHEN displaying linked nodes THEN the system SHALL indicate that data is available from multiple sources
5. WHEN filtering inventory THEN the system SHALL support filtering by certificate status for Puppetserver-sourced nodes

### Requirement 3

**User Story:** As an infrastructure administrator, I want to manage node certificates through the Puppetserver CA, so that I can approve certificate requests and revoke compromised certificates.

#### Acceptance Criteria

1. WHEN viewing a certificate with "requested" status THEN the system SHALL display a sign button to approve the certificate request
2. WHEN a user signs a certificate request THEN the system SHALL call the Puppetserver CA API to sign the certificate
3. WHEN viewing a signed certificate THEN the system SHALL display a revoke button to invalidate the certificate
4. WHEN a user revokes a certificate THEN the system SHALL call the Puppetserver CA API to revoke the certificate and require confirmation
5. WHEN a certificate operation completes THEN the system SHALL refresh the certificate list and display a success or error message

### Requirement 4

**User Story:** As an infrastructure administrator, I want to view node status from Puppetserver, so that I can see when nodes last checked in and whether their runs were successful.

#### Acceptance Criteria

1. WHEN a user navigates to a node detail page THEN the system SHALL query Puppetserver for the node's status information
2. WHEN Puppetserver returns node status THEN the system SHALL display the last run timestamp, catalog version, and run status
3. WHEN displaying node status THEN the system SHALL show whether the node is active, inactive, or has never checked in
4. WHEN a node has not checked in recently THEN the system SHALL highlight the node as potentially problematic based on a configurable threshold
5. WHEN Puppetserver status retrieval fails THEN the system SHALL display an error message while preserving other node detail functionality

### Requirement 5

**User Story:** As an infrastructure administrator, I want to retrieve catalogs for nodes in different environments, so that I can preview what would be applied before promoting code to production.

#### Acceptance Criteria

1. WHEN viewing a node detail page THEN the system SHALL provide an interface to request catalog compilation for any available environment
2. WHEN a user requests a catalog for a specific environment THEN the system SHALL call the Puppetserver catalog compilation API
3. WHEN Puppetserver compiles a catalog THEN the system SHALL display the compiled catalog resources in a structured, browsable format
4. WHEN displaying a compiled catalog THEN the system SHALL show the environment name, compilation timestamp, and catalog version
5. WHEN catalog compilation fails THEN the system SHALL display detailed error messages including compilation errors and line numbers

### Requirement 6

**User Story:** As an infrastructure administrator, I want to view node facts from Puppetserver, so that I can see the most current system information directly from the source.

#### Acceptance Criteria

1. WHEN a user navigates to a node detail page THEN the system SHALL query Puppetserver for the node's facts
2. WHEN Puppetserver returns facts THEN the system SHALL display them in a structured, searchable format with source attribution
3. WHEN facts are available from both Puppetserver and PuppetDB THEN the system SHALL display both with timestamps to show which is more recent
4. WHEN displaying facts THEN the system SHALL organize them by category (system, network, hardware, custom)
5. WHEN Puppetserver fact retrieval fails THEN the system SHALL display an error message while preserving facts from other sources

### Requirement 7

**User Story:** As an infrastructure administrator, I want to view and manage Puppet environments, so that I can understand what code versions are deployed and promote changes through environments.

#### Acceptance Criteria

1. WHEN the system connects to Puppetserver THEN Pabawi SHALL retrieve the list of available environments
2. WHEN displaying environments THEN the system SHALL show environment names and metadata (if available)
3. WHEN viewing an environment THEN the system SHALL display information about the environment including associated nodes
4. WHERE Puppetserver supports environment deployment THEN the system SHALL provide an interface to trigger environment deployment
5. WHEN environment data is displayed THEN the system SHALL show the last deployment timestamp and status

### Requirement 8

**User Story:** As an infrastructure administrator, I want to configure Puppetserver connection settings, so that I can connect Pabawi to my Puppetserver instance securely.

#### Acceptance Criteria

1. WHEN the system starts THEN Pabawi SHALL read Puppetserver connection configuration from environment variables or configuration files
2. WHERE Puppetserver uses HTTPS THEN the system SHALL support SSL certificate validation with options for custom CA certificates
3. WHERE Puppetserver requires authentication THEN the system SHALL support token-based authentication and certificate-based authentication
4. WHEN Puppetserver configuration is invalid THEN the system SHALL log detailed error messages for troubleshooting
5. WHEN Puppetserver is not configured THEN the system SHALL operate normally without Puppetserver features enabled

### Requirement 9

**User Story:** As a developer, I want a well-defined integration architecture for Puppetserver, so that the system can reliably query and process Puppetserver data following the established plugin pattern.

#### Acceptance Criteria

1. WHEN the backend starts THEN the system SHALL initialize the Puppetserver plugin using the established plugin-based architecture
2. WHEN querying Puppetserver THEN the system SHALL use the Puppetserver REST API for data retrieval
3. WHEN integration queries fail THEN the system SHALL implement retry logic with exponential backoff and circuit breaker patterns
4. WHEN processing integration responses THEN the system SHALL validate and transform data into normalized application formats
5. WHEN integration data is cached THEN the system SHALL implement appropriate cache expiration policies with per-source TTL configuration

### Requirement 10

**User Story:** As an infrastructure administrator, I want the node detail page to display Puppetserver data alongside PuppetDB data, so that I have a comprehensive view of each node from multiple authoritative sources.

#### Acceptance Criteria

1. WHEN viewing a node detail page THEN the system SHALL display Puppetserver data in appropriate tabs or sections (Certificate Status, Node Status, Environments)
2. WHEN displaying node information THEN the system SHALL clearly indicate the source of each data type (Puppetserver, PuppetDB, Bolt)
3. WHEN a node exists in multiple sources THEN the system SHALL display a unified view with data from all sources
4. WHEN data conflicts between sources THEN the system SHALL display both values with timestamps to indicate which is more recent
5. WHEN loading node data THEN the system SHALL show loading indicators for each section independently without blocking other sections

### Requirement 11

**User Story:** As an infrastructure administrator, I want to see certificate status on the inventory page, so that I can quickly identify nodes with certificate issues.

#### Acceptance Criteria

1. WHEN viewing the inventory page THEN the system SHALL display certificate status indicators for nodes from Puppetserver CA
2. WHEN a node has a pending certificate request THEN the system SHALL display a visual indicator (badge, icon, or color)
3. WHEN a node has a revoked certificate THEN the system SHALL display a prominent warning indicator
4. WHEN filtering inventory THEN the system SHALL support filtering by certificate status
5. WHEN sorting inventory THEN the system SHALL support sorting by certificate status and last check-in time

### Requirement 12

**User Story:** As an infrastructure administrator, I want to perform bulk certificate operations, so that I can efficiently manage certificates for multiple nodes.

#### Acceptance Criteria

1. WHEN viewing the certificate list THEN the system SHALL provide checkboxes to select multiple certificates
2. WHEN multiple certificates are selected THEN the system SHALL display bulk action buttons (sign all, revoke all)
3. WHEN a user initiates a bulk operation THEN the system SHALL require confirmation showing the list of affected certificates
4. WHEN executing bulk operations THEN the system SHALL process certificates sequentially and display progress
5. WHEN bulk operations complete THEN the system SHALL display a summary showing successful and failed operations

### Requirement 13

**User Story:** As an infrastructure administrator, I want to search and filter certificates, so that I can quickly find specific nodes or certificate issues.

#### Acceptance Criteria

1. WHEN viewing the certificate list THEN the system SHALL provide a search interface to filter by certname
2. WHEN searching certificates THEN the system SHALL support partial matching and case-insensitive search
3. WHEN filtering certificates THEN the system SHALL support filtering by status, expiration date, and fingerprint
4. WHEN applying filters THEN the system SHALL update the certificate list in real-time without page reload
5. WHEN filters are active THEN the system SHALL display the active filters with the ability to clear them

### Requirement 14

**User Story:** As a developer, I want comprehensive error handling for Puppetserver operations, so that users receive clear feedback when operations fail.

#### Acceptance Criteria

1. WHEN a Puppetserver API call fails THEN the system SHALL log detailed error information including endpoint, status code, and response body
2. WHEN displaying errors to users THEN the system SHALL provide actionable error messages with troubleshooting guidance
3. WHEN certificate operations fail THEN the system SHALL display specific error messages (e.g., "Certificate already signed", "Invalid certname")
4. WHEN network errors occur THEN the system SHALL distinguish between connection failures, timeouts, and authentication errors
5. WHEN errors are transient THEN the system SHALL automatically retry with exponential backoff before displaying an error to the user

### Requirement 15

**User Story:** As an infrastructure administrator, I want to see environment-specific catalog differences, so that I can understand what changes will occur when promoting code between environments.

#### Acceptance Criteria

1. WHEN viewing a node detail page THEN the system SHALL provide an interface to compare catalogs between two environments
2. WHEN a user selects two environments for comparison THEN the system SHALL compile catalogs for both environments
3. WHEN catalogs are compiled THEN the system SHALL display a diff view showing added, removed, and modified resources
4. WHEN displaying catalog differences THEN the system SHALL highlight resource parameter changes
5. WHEN catalog comparison fails THEN the system SHALL display detailed error messages for each failed compilation
