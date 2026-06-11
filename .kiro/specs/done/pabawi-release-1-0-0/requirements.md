# Requirements Document

## Introduction

This document specifies requirements for Pabawi release 1.0.0, a major release introducing six foundational feature areas: full database abstraction (SQLite + PostgreSQL), an AWS EC2 plugin, improved Proxmox VM/container provisioning, local database storage for integration configurations, a nodes journal for event tracking, and improved RBAC with fine-grained permissions. These requirements are derived from the approved technical design document.

## Glossary

- **Pabawi**: The web application for infrastructure management, inventory, and remote execution
- **DatabaseAdapter**: Interface abstracting database operations, with SQLiteAdapter and PostgresAdapter implementations
- **SQLiteAdapter**: DatabaseAdapter implementation for SQLite databases
- **PostgresAdapter**: DatabaseAdapter implementation for PostgreSQL databases
- **AWSPlugin**: Plugin integrating AWS EC2 into Pabawi, extending BasePlugin
- **ProxmoxIntegration**: Single plugin managing both Proxmox VMs and containers
- **ProxmoxService**: Backend service handling Proxmox API communication with explicit compute type routing
- **IntegrationConfigService**: Service for storing and retrieving integration configurations in the database per user
- **JournalService**: Service for recording and retrieving a unified timeline of node events
- **JournalEntry**: A single event record in the nodes journal
- **JournalSource**: Origin of a journal event (proxmox, aws, bolt, ansible, ssh, puppetdb, user, system)
- **PermissionService**: Service for checking user permissions against resource-action pairs
- **IntegrationManager**: Registry managing all integration plugins
- **BasePlugin**: Abstract base class for all integration plugins
- **ConfigService**: Service loading and validating application configuration from environment and database
- **Provisioner_Role**: New built-in role for infrastructure provisioning and lifecycle management
- **Effective_Config**: The merged result of .env file values and database-stored config values
- **Compute_Type**: Classification of a Proxmox guest as "vm" (QEMU) or "lxc" (container)
- **Node**: A managed infrastructure resource (VM, container, or instance)
- **Node_URI**: Unique identifier for a node within a specific integration (e.g., "aws:us-east-1:i-abc123")
- **Migration**: A versioned SQL script that modifies the database schema
- **MigrationRunner**: Component that selects and executes dialect-appropriate migration files

## Requirements

### Requirement 1: Database Adapter Interface

**User Story:** As a developer, I want a unified database interface that abstracts SQLite and PostgreSQL, so that all services can operate against either database without code changes.

#### Acceptance Criteria

1. THE DatabaseAdapter SHALL expose query, queryOne, and execute methods that accept SQL strings and parameter arrays
2. THE DatabaseAdapter SHALL expose beginTransaction, commit, rollback, and withTransaction methods for transaction support
3. THE DatabaseAdapter SHALL expose initialize and close methods for connection lifecycle management
4. THE DatabaseAdapter SHALL expose a getDialect method returning "sqlite" or "postgres"
5. THE DatabaseAdapter SHALL expose a getPlaceholder method that returns "?" for SQLite and "$N" for PostgreSQL
6. WHEN a service calls DatabaseAdapter.query with valid SQL and parameters, THE DatabaseAdapter SHALL return an array of typed rows
7. WHEN a service calls DatabaseAdapter.queryOne, THE DatabaseAdapter SHALL return a single row or null

### Requirement 2: SQLite Adapter Implementation

**User Story:** As a developer, I want an SQLiteAdapter that implements DatabaseAdapter using the sqlite3 package, so that existing SQLite databases continue to work.

#### Acceptance Criteria

1. THE SQLiteAdapter SHALL implement all DatabaseAdapter interface methods using the sqlite3 package
2. WHEN SQLiteAdapter.initialize is called, THE SQLiteAdapter SHALL open the database file at the configured path
3. WHEN SQLiteAdapter.initialize is called, THE SQLiteAdapter SHALL enable WAL mode for concurrent read performance
4. WHEN SQLiteAdapter.getPlaceholder is called, THE SQLiteAdapter SHALL return "?" regardless of the index parameter
5. WHEN SQLiteAdapter.close is called, THE SQLiteAdapter SHALL close the database connection and release resources

### Requirement 3: PostgreSQL Adapter Implementation

**User Story:** As a developer, I want a PostgresAdapter that implements DatabaseAdapter using the pg package, so that Pabawi can scale to PostgreSQL for production deployments.

#### Acceptance Criteria

1. THE PostgresAdapter SHALL implement all DatabaseAdapter interface methods using the pg package
2. WHEN PostgresAdapter.initialize is called, THE PostgresAdapter SHALL create a connection pool using the DATABASE_URL environment variable
3. WHEN PostgresAdapter.getPlaceholder is called with index N, THE PostgresAdapter SHALL return "$N"
4. WHEN PostgresAdapter.close is called, THE PostgresAdapter SHALL drain the connection pool and release all connections
5. IF the PostgreSQL server is unreachable during initialize, THEN THE PostgresAdapter SHALL throw a DatabaseConnectionError with a descriptive message

### Requirement 4: Database Adapter Factory

**User Story:** As a developer, I want a factory function that creates the correct adapter based on configuration, so that the database backend is selected at startup without service changes.

#### Acceptance Criteria

1. WHEN DB_TYPE environment variable is "postgres", THE AdapterFactory SHALL create a PostgresAdapter
2. WHEN DB_TYPE environment variable is "sqlite" or unset, THE AdapterFactory SHALL create an SQLiteAdapter
3. IF DB_TYPE is "postgres" and DATABASE_URL is not set, THEN THE AdapterFactory SHALL throw a configuration error

### Requirement 5: Database Migration Support

**User Story:** As a developer, I want dialect-aware migrations, so that schema changes work correctly on both SQLite and PostgreSQL.

#### Acceptance Criteria

1. THE MigrationRunner SHALL support dialect-specific migration files using the naming convention NNN_name.sqlite.sql and NNN_name.postgres.sql
2. THE MigrationRunner SHALL support shared migration files using the naming convention NNN_name.sql for SQL compatible with both dialects
3. WHEN runMigrations is called, THE MigrationRunner SHALL select migration files matching the active dialect
4. WHEN runMigrations is called, THE MigrationRunner SHALL skip migrations that have already been applied
5. WHEN runMigrations is called multiple times on the same database, THE MigrationRunner SHALL produce the same schema state

### Requirement 6: Service Migration to DatabaseAdapter

**User Story:** As a developer, I want all existing services migrated from direct sqlite3.Database usage to DatabaseAdapter, so that the entire backend is database-agnostic.

#### Acceptance Criteria

1. THE UserService SHALL accept a DatabaseAdapter instead of sqlite3.Database in its constructor
2. THE RoleService SHALL accept a DatabaseAdapter instead of sqlite3.Database in its constructor
3. THE PermissionService SHALL accept a DatabaseAdapter instead of sqlite3.Database in its constructor
4. FOR ALL services currently using sqlite3.Database (UserService, RoleService, GroupService, PermissionService, SetupService, ExecutionRepository, AuthenticationService, AuditLoggingService, BatchExecutionService, PuppetRunHistoryService, ReportFilterService), THE Pabawi SHALL replace direct sqlite3 usage with DatabaseAdapter calls
5. WHEN services are migrated to DatabaseAdapter, THE Pabawi SHALL remove the private runQuery, getQuery, and allQuery helper methods from each service

### Requirement 7: Transaction Support

**User Story:** As a developer, I want reliable transaction support across both database backends, so that multi-step operations are atomic.

#### Acceptance Criteria

1. WHEN withTransaction is called and the callback resolves, THE DatabaseAdapter SHALL commit all mutations
2. WHEN withTransaction is called and the callback rejects, THE DatabaseAdapter SHALL rollback all mutations
3. IF a transaction is already active in SQLiteAdapter, THEN THE SQLiteAdapter SHALL throw an error indicating nested transactions are not supported

### Requirement 8: AWS Plugin Registration

**User Story:** As a system administrator, I want an AWS plugin that integrates with Pabawi's plugin architecture, so that AWS EC2 resources appear alongside other infrastructure.

#### Acceptance Criteria

1. THE AWSPlugin SHALL extend BasePlugin and implement both ExecutionToolPlugin and InformationSourcePlugin interfaces
2. THE AWSPlugin SHALL register with IntegrationManager using the name "aws"
3. WHEN AWSPlugin is registered, THE IntegrationManager SHALL treat the AWSPlugin as a single plugin handling all AWS services
4. WHEN AWS configuration is disabled, THE IntegrationManager SHALL skip AWSPlugin registration

### Requirement 9: AWS EC2 Inventory

**User Story:** As a system administrator, I want to see EC2 instances in Pabawi's inventory, so that I can manage AWS resources alongside on-premise infrastructure.

#### Acceptance Criteria

1. WHEN AWSPlugin.getInventory is called, THE AWSPlugin SHALL return all EC2 instances as Node objects
2. WHEN AWSPlugin.getGroups is called, THE AWSPlugin SHALL group instances by region, VPC, and tags
3. WHEN AWSPlugin.getNodeFacts is called with a valid instance ID, THE AWSPlugin SHALL return instance metadata as a Facts object
4. THE AWSPlugin SHALL include instance state, type, region, VPC, and tags in each Node object

### Requirement 10: AWS EC2 Provisioning

**User Story:** As a system administrator, I want to provision new EC2 instances from Pabawi, so that I can manage AWS infrastructure without switching tools.

#### Acceptance Criteria

1. WHEN a provision action is executed on AWSPlugin, THE AWSPlugin SHALL call the EC2 runInstances API with the specified parameters
2. WHEN provisioning succeeds, THE AWSPlugin SHALL return an ExecutionResult with status "success" and the new instance ID
3. IF provisioning fails, THEN THE AWSPlugin SHALL return an ExecutionResult with status "failed" and a descriptive AWS error message
4. WHEN provisioning completes (success or failure), THE AWSPlugin SHALL record a journal entry via JournalService

### Requirement 11: AWS EC2 Lifecycle Actions

**User Story:** As a system administrator, I want to start, stop, reboot, and terminate EC2 instances from Pabawi, so that I can manage instance lifecycle centrally.

#### Acceptance Criteria

1. WHEN a lifecycle action (start, stop, reboot, terminate) is executed on AWSPlugin, THE AWSPlugin SHALL call the corresponding EC2 API
2. WHEN a lifecycle action succeeds, THE AWSPlugin SHALL return an ExecutionResult with status "success"
3. IF AWS credentials are invalid or expired, THEN THE AWSPlugin SHALL throw an AWSAuthenticationError with a descriptive message
4. WHEN a lifecycle action completes, THE AWSPlugin SHALL record a journal entry via JournalService

### Requirement 12: AWS Plugin Health Check

**User Story:** As a system administrator, I want AWS health status visible in Pabawi, so that I can monitor connectivity to AWS services.

#### Acceptance Criteria

1. WHEN AWSPlugin.performHealthCheck is called with valid credentials, THE AWSPlugin SHALL return healthy status with AWS account details
2. IF AWS credentials are invalid, THEN THE AWSPlugin SHALL return unhealthy status with message "AWS authentication failed"
3. WHEN AWSPlugin reports unhealthy status, THE AWSPlugin SHALL continue to accept configuration updates without crashing

### Requirement 13: AWS Resource Discovery

**User Story:** As a system administrator, I want to browse available AWS regions, instance types, AMIs, VPCs, subnets, security groups, and key pairs, so that I can configure provisioning parameters.

#### Acceptance Criteria

1. WHEN AWSPlugin.getRegions is called, THE AWSPlugin SHALL return available AWS regions
2. WHEN AWSPlugin.getInstanceTypes is called, THE AWSPlugin SHALL return available EC2 instance types
3. WHEN AWSPlugin.getAMIs is called with a region, THE AWSPlugin SHALL return available AMIs for that region
4. WHEN AWSPlugin.getVPCs is called with a region, THE AWSPlugin SHALL return available VPCs
5. WHEN AWSPlugin.getSubnets is called with a region, THE AWSPlugin SHALL return available subnets
6. WHEN AWSPlugin.getSecurityGroups is called with a region, THE AWSPlugin SHALL return available security groups
7. WHEN AWSPlugin.getKeyPairs is called with a region, THE AWSPlugin SHALL return available key pairs

### Requirement 14: Proxmox Single Plugin Architecture

**User Story:** As a developer, I want Proxmox to remain a single plugin handling both VMs and containers internally, so that the integration model stays consistent and avoids plugin proliferation.

#### Acceptance Criteria

1. THE ProxmoxIntegration SHALL register with IntegrationManager using the single name "proxmox"
2. THE ProxmoxIntegration SHALL handle both VM (QEMU) and container (LXC) operations within the same plugin instance
3. WHEN ProxmoxIntegration.getInventory is called, THE ProxmoxIntegration SHALL return both VMs and containers in a single result set
4. FOR ALL inventory items returned by ProxmoxIntegration, THE ProxmoxIntegration SHALL include a computeType field with value "vm" or "lxc"

### Requirement 15: Proxmox Compute Type Routing

**User Story:** As a system administrator, I want Proxmox provisioning to route to the correct API endpoint based on compute type, so that VMs and containers are created correctly.

#### Acceptance Criteria

1. WHEN a provisioning action with computeType "vm" is received, THE ProxmoxService SHALL call the Proxmox QEMU API endpoint
2. WHEN a provisioning action with computeType "lxc" is received, THE ProxmoxService SHALL call the Proxmox LXC API endpoint
3. THE ProxmoxService SHALL expose separate createVM and createLXC methods with type-specific parameter validation
4. WHEN a lifecycle action is executed, THE ProxmoxService SHALL determine the guest type internally and route to the correct API

### Requirement 16: Proxmox Inventory Filtering

**User Story:** As a system administrator, I want to filter Proxmox inventory by compute type, so that I can view VMs and containers separately.

#### Acceptance Criteria

1. WHEN ProxmoxService.getInventory is called with computeType "qemu", THE ProxmoxService SHALL return only VMs
2. WHEN ProxmoxService.getInventory is called with computeType "lxc", THE ProxmoxService SHALL return only containers
3. WHEN ProxmoxService.getInventory is called without a computeType filter, THE ProxmoxService SHALL return all guests
4. THE ProxmoxIntegration SHALL include type-based groups ("Proxmox VMs", "Proxmox Containers") in getGroups results

### Requirement 17: Proxmox UI Separation

**User Story:** As a system administrator, I want separate provisioning forms for VMs and containers in the UI, so that I see only the relevant configuration options for each compute type.

#### Acceptance Criteria

1. WHEN the user selects VM provisioning, THE Pabawi frontend SHALL display a VM-specific provisioning form with QEMU parameters
2. WHEN the user selects container provisioning, THE Pabawi frontend SHALL display a container-specific provisioning form with LXC parameters
3. THE Pabawi frontend SHALL submit both VM and container provisioning requests to the same "proxmox" backend plugin

### Requirement 18: Integration Config Storage

**User Story:** As a system administrator, I want to store integration configurations in the database per user, so that I can manage settings through the UI without editing .env files.

#### Acceptance Criteria

1. THE IntegrationConfigService SHALL support saving, retrieving, updating, and deleting integration configs per user
2. THE IntegrationConfigService SHALL enforce a unique constraint of one active config per integration per user
3. WHEN IntegrationConfigService.saveConfig is called, THE IntegrationConfigService SHALL validate the config against the integration-specific Zod schema
4. WHEN IntegrationConfigService.saveConfig is called, THE IntegrationConfigService SHALL encrypt sensitive fields (matching patterns: *token*, *password*, *secret*, *key*) using AES-256-GCM before storage
5. WHEN IntegrationConfigService.getConfig is called, THE IntegrationConfigService SHALL decrypt sensitive fields before returning the config

### Requirement 19: Config Merge Strategy

**User Story:** As a system administrator, I want database configs to override .env values, so that UI-configured settings take precedence over file-based defaults.

#### Acceptance Criteria

1. WHEN IntegrationConfigService.getEffectiveConfig is called, THE IntegrationConfigService SHALL merge .env values as base with database values overriding
2. WHEN a database config value is non-null for a key, THE IntegrationConfigService SHALL use the database value over the .env value
3. WHEN no database config exists for an integration, THE IntegrationConfigService SHALL return the .env config only
4. WHEN no .env config exists for an integration, THE IntegrationConfigService SHALL return the database config only

### Requirement 20: Config Encryption

**User Story:** As a system administrator, I want sensitive configuration values encrypted at rest, so that credentials are protected in the database.

#### Acceptance Criteria

1. THE IntegrationConfigService SHALL encrypt sensitive fields using AES-256-GCM with a key derived from JWT_SECRET plus a per-record salt
2. THE IntegrationConfigService SHALL store encrypted values in the integration_configs table config column
3. FOR ALL config values, decrypting an encrypted value SHALL produce the original plaintext value
4. WHEN IntegrationConfigService.rotateEncryptionKey is called, THE IntegrationConfigService SHALL re-encrypt all stored configs atomically within a transaction

### Requirement 21: Integration Config UI

**User Story:** As a system administrator, I want UI pages for managing integration configurations, so that I can configure integrations without server access.

#### Acceptance Criteria

1. THE Pabawi frontend SHALL provide configuration pages for each registered integration
2. WHEN a user saves an integration config through the UI, THE Pabawi SHALL call IntegrationConfigService.saveConfig with the user's ID
3. WHEN displaying stored configs, THE Pabawi frontend SHALL mask sensitive field values by default

### Requirement 22: Journal Event Recording

**User Story:** As a system administrator, I want all provisioning events, lifecycle actions, and execution results recorded in a journal, so that I have a complete audit trail for each node.

#### Acceptance Criteria

1. WHEN a provisioning action completes (success or failure), THE JournalService SHALL record exactly one journal entry
2. WHEN a lifecycle action completes, THE JournalService SHALL record exactly one journal entry
3. WHEN an execution result is produced by any plugin, THE JournalService SHALL record exactly one journal entry
4. FOR ALL journal entries, THE JournalService SHALL include nodeId, nodeUri, eventType, source, action, summary, timestamp, and optionally userId and details

### Requirement 23: Journal Timeline Aggregation

**User Story:** As a system administrator, I want a unified timeline combining stored events and live PuppetDB data, so that I see the complete history of a node in one view.

#### Acceptance Criteria

1. WHEN JournalService.aggregateTimeline is called, THE JournalService SHALL fetch both database-stored events and live-source events
2. WHEN aggregating events, THE JournalService SHALL mark database events with isLive false and live-fetched events with isLive true
3. THE JournalService SHALL sort the aggregated timeline by timestamp in descending order
4. IF a live source fails during aggregation, THEN THE JournalService SHALL return database events and skip the failed source
5. WHEN options include limit and offset, THE JournalService SHALL apply pagination to the merged result

### Requirement 24: Journal Manual Notes

**User Story:** As a system administrator, I want to add manual notes to nodes in the journal, so that I can document observations and decisions alongside automated events.

#### Acceptance Criteria

1. WHEN JournalService.addNote is called with a nodeId, userId, and content, THE JournalService SHALL create a journal entry with eventType "note" and source "user"
2. THE JournalService SHALL include the userId of the note author in the journal entry
3. WHEN searching journal entries, THE JournalService SHALL include manual notes in search results

### Requirement 25: Journal Source Naming

**User Story:** As a developer, I want journal sources to use integration-level names, so that the journal model is consistent with the single-plugin architecture.

#### Acceptance Criteria

1. THE JournalService SHALL use "proxmox" as the source for all Proxmox events (both VM and container)
2. THE JournalService SHALL use "aws" as the source for all AWS events
3. THE JournalService SHALL validate that the source field matches one of the defined JournalSource values (proxmox, aws, bolt, ansible, ssh, puppetdb, user, system)

### Requirement 26: Journal Data Model

**User Story:** As a developer, I want a well-defined journal entries table, so that events are stored consistently and queryable.

#### Acceptance Criteria

1. THE journal_entries table SHALL include columns: id, nodeId, nodeUri, eventType, source, action, summary, details (JSON), userId, and timestamp
2. THE journal_entries table SHALL have indexes on nodeId, timestamp (descending), eventType, source, and a composite index on (nodeId, timestamp descending)
3. THE journal_entries table SHALL enforce that eventType is one of the defined JournalEventType values
4. THE journal_entries table SHALL enforce that timestamp is in ISO 8601 format

### Requirement 27: New Permission Resources and Actions

**User Story:** As a system administrator, I want fine-grained permissions for new features, so that I can control access to provisioning, lifecycle, journal, and config operations independently.

#### Acceptance Criteria

1. THE Pabawi SHALL add permission resource "proxmox" with actions: read, lifecycle, provision, destroy, admin
2. THE Pabawi SHALL add permission resource "aws" with actions: read, lifecycle, provision, destroy, admin
3. THE Pabawi SHALL add permission resource "journal" with actions: read, note, admin
4. THE Pabawi SHALL add permission resource "integration_config" with actions: read, configure, admin
5. THE Pabawi SHALL seed new permissions via a database migration

### Requirement 28: Provisioner Built-in Role

**User Story:** As a system administrator, I want a Provisioner built-in role, so that I can grant infrastructure provisioning access without full admin privileges.

#### Acceptance Criteria

1. THE Pabawi SHALL create a built-in "Provisioner" role via database migration
2. THE Provisioner_Role SHALL include read, provision, destroy, and lifecycle permissions for proxmox and aws resources
3. THE Provisioner_Role SHALL include read and note permissions for the journal resource
4. THE Provisioner_Role SHALL include read permission for the integration_config resource
5. THE Provisioner_Role SHALL be marked as isBuiltIn and protected from deletion

### Requirement 29: RBAC Backward Compatibility

**User Story:** As a system administrator, I want existing permission checks to continue working after the upgrade, so that current users are not disrupted.

#### Acceptance Criteria

1. WHEN existing code checks hasPermission with resource "proxmox" and action "execute", THE PermissionService SHALL continue to return the correct result
2. THE Pabawi SHALL add new granular permissions (provision, destroy, lifecycle, configure, note, export) without removing existing permissions (read, write, execute, admin)
3. FOR ALL existing built-in roles (Viewer, Operator, Administrator), THE Pabawi SHALL preserve their current permission assignments
4. THE Administrator role SHALL receive all new permissions in addition to existing ones

### Requirement 30: Permission Check Performance

**User Story:** As a developer, I want permission checks to be fast, so that authorization does not add noticeable latency to API requests.

#### Acceptance Criteria

1. THE PermissionService SHALL cache permission check results with a configurable TTL
2. WHEN a permission is added to or removed from a role, THE PermissionService SHALL invalidate the relevant cache entries
3. THE PermissionService SHALL support the new permission types (provision, destroy, lifecycle, configure, note, export) in cache lookups

### Requirement 31: Plugin Registration Uniqueness

**User Story:** As a developer, I want the IntegrationManager to prevent duplicate plugin names, so that plugin identity is unambiguous.

#### Acceptance Criteria

1. WHEN a plugin is registered with a name that already exists, THE IntegrationManager SHALL throw an error
2. THE IntegrationManager SHALL enforce that each registered plugin has a unique name

### Requirement 32: Integration Config Database Table

**User Story:** As a developer, I want a well-defined integration_configs table, so that configs are stored consistently with proper constraints.

#### Acceptance Criteria

1. THE integration_configs table SHALL include columns: id, userId, integrationName, config (JSON), isActive, createdAt, updatedAt
2. THE integration_configs table SHALL enforce a UNIQUE constraint on (userId, integrationName)
3. THE integration_configs table SHALL have a foreign key from userId to users(id) with ON DELETE CASCADE
4. THE integration_configs table SHALL have indexes on userId, integrationName, and isActive
