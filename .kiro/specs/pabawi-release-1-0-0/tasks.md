# Implementation Plan: Pabawi Release 1.0.0

## Overview

This plan implements six foundational features for Pabawi 1.0.0 in dependency order: database abstraction first (foundational), then service migration, followed by new features (journal, config storage, AWS plugin, Proxmox enhancements, RBAC) that build on the adapter. Each task builds incrementally on previous work. TypeScript is used throughout.

## Tasks

- [x] 1. Database Adapter Interface and Implementations
  - [x] 1.1 Create the DatabaseAdapter interface, factory, and error types
    - Create `backend/src/database/DatabaseAdapter.ts` with the `DatabaseAdapter` interface: `query<T>`, `queryOne<T>`, `execute`, `beginTransaction`, `commit`, `rollback`, `withTransaction<T>`, `initialize`, `close`, `isConnected`, `getDialect`, `getPlaceholder`
    - Create `backend/src/database/errors.ts` with `DatabaseQueryError`, `DatabaseConnectionError` error classes
    - Create `backend/src/database/AdapterFactory.ts` with `createDatabaseAdapter(config)` that returns SQLiteAdapter when DB_TYPE is "sqlite" or unset, PostgresAdapter when DB_TYPE is "postgres", and throws if DB_TYPE is "postgres" without DATABASE_URL
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 4.1, 4.2, 4.3_

  - [x] 1.2 Implement SQLiteAdapter
    - Create `backend/src/database/SQLiteAdapter.ts` implementing all DatabaseAdapter methods using the `sqlite3` package
    - Enable WAL mode on initialize, return `"?"` from getPlaceholder, implement withTransaction with rollback on error, throw error on nested transactions
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 7.1, 7.2, 7.3_

  - [x] 1.3 Implement PostgresAdapter
    - Create `backend/src/database/PostgresAdapter.ts` implementing all DatabaseAdapter methods using the `pg` package
    - Create connection pool from DATABASE_URL on initialize, return `"$N"` from getPlaceholder, implement withTransaction using pool client, throw DatabaseConnectionError if server unreachable
    - Add `pg` and `@types/pg` as dependencies in `backend/package.json`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 7.1, 7.2_

  - [ ]* 1.4 Write property test: Placeholder Dialect Correctness
    - **Property 2: Placeholder Dialect Correctness**
    - For any positive integer N, SQLiteAdapter.getPlaceholder(N) returns "?" and PostgresAdapter.getPlaceholder(N) returns "$N"
    - **Validates: Requirements 1.5, 2.4, 3.3**

  - [ ]* 1.5 Write property test: Transaction Atomicity
    - **Property 3: Transaction Atomicity**
    - For any set of mutations in withTransaction, if callback resolves all mutations are committed; if callback rejects no mutations are visible
    - **Validates: Requirements 7.1, 7.2**

- [ ] 2. Database Migration System Upgrade
  - [ ] 2.1 Refactor MigrationRunner for dialect-aware migrations
    - Modify `backend/src/database/MigrationRunner.ts` to accept a DatabaseAdapter instead of sqlite3.Database
    - Support dialect-specific files (`NNN_name.sqlite.sql`, `NNN_name.postgres.sql`) and shared files (`NNN_name.sql`)
    - Select migration files matching the active dialect, skip already-applied migrations, track applied migrations in a `schema_migrations` table
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [ ]* 2.2 Write property test: Migration Idempotency
    - **Property 4: Migration Idempotency**
    - Running runMigrations() multiple times on the same database produces the same schema state; already-applied migrations are skipped
    - **Validates: Requirements 5.4, 5.5**

  - [ ]* 2.3 Write property test: Migration Dialect Selection
    - **Property 5: Migration Dialect Selection**
    - For any set of migration files with dialect-specific variants, MigrationRunner selects only files matching the active adapter's dialect
    - **Validates: Requirement 5.3**

- [ ] 3. Migrate Existing Services to DatabaseAdapter
  - [ ] 3.1 Migrate UserService and AuthenticationService
    - Replace `private db: Database` with `private db: DatabaseAdapter` in `backend/src/services/UserService.ts`
    - Replace `runQuery/getQuery/allQuery` helpers with `db.execute/db.queryOne/db.query` calls
    - Update constructor to accept DatabaseAdapter instead of sqlite3.Database
    - Apply same migration to `backend/src/services/AuthenticationService.ts`
    - _Requirements: 6.1, 6.4, 6.5_

  - [ ] 3.2 Migrate RoleService, GroupService, and PermissionService
    - Replace sqlite3.Database with DatabaseAdapter in `backend/src/services/RoleService.ts`, `backend/src/services/GroupService.ts`, `backend/src/services/PermissionService.ts`
    - Remove private runQuery/getQuery/allQuery helpers, use adapter methods directly
    - _Requirements: 6.2, 6.3, 6.4, 6.5_

  - [ ] 3.3 Migrate SetupService, AuditLoggingService, and BatchExecutionService
    - Replace sqlite3.Database with DatabaseAdapter in `backend/src/services/SetupService.ts`, `backend/src/services/AuditLoggingService.ts`, `backend/src/services/BatchExecutionService.ts`
    - Remove private runQuery/getQuery/allQuery helpers, use adapter methods directly
    - _Requirements: 6.4, 6.5_

  - [ ] 3.4 Migrate ExecutionRepository, PuppetRunHistoryService, and ReportFilterService
    - Replace sqlite3.Database with DatabaseAdapter in `backend/src/database/ExecutionRepository.ts`, `backend/src/services/PuppetRunHistoryService.ts`, `backend/src/services/ReportFilterService.ts`
    - Remove private runQuery/getQuery/allQuery helpers, use adapter methods directly
    - _Requirements: 6.4, 6.5_

  - [ ] 3.5 Update DatabaseService and server.ts bootstrap
    - Refactor `backend/src/database/DatabaseService.ts` to use AdapterFactory and DatabaseAdapter
    - Update `backend/src/server.ts` to create adapter via `createDatabaseAdapter(config)`, call `initialize()` and `runMigrations()`, then pass adapter to all services
    - Ensure all service constructors receive DatabaseAdapter instead of sqlite3.Database
    - _Requirements: 6.4, 6.5_

- [ ] 4. Checkpoint - Database abstraction complete
  - Ensure all tests pass, ask the user if questions arise.
  - Verify that the application starts with SQLite adapter and all existing functionality works through DatabaseAdapter.

- [ ] 5. RBAC Enhancements — New Permissions and Provisioner Role
  - [ ] 5.1 Create migration for new permissions and Provisioner role
    - Create `backend/src/database/migrations/007_new_permissions_and_provisioner_role.sql` seeding:
      - proxmox permissions: read, lifecycle, provision, destroy, admin
      - aws permissions: read, lifecycle, provision, destroy, admin
      - journal permissions: read, note, admin
      - integration_config permissions: read, configure, admin
      - Provisioner built-in role with appropriate permission assignments
      - Assign all new permissions to the existing Administrator role
    - Preserve all existing permissions and role assignments (backward compatible)
    - _Requirements: 27.1, 27.2, 27.3, 27.4, 27.5, 28.1, 28.2, 28.3, 28.4, 28.5, 29.2, 29.3, 29.4_

  - [ ] 5.2 Update PermissionService with caching for new permission types
    - Add TTL-based cache for permission check results in `backend/src/services/PermissionService.ts`
    - Invalidate cache entries when permissions are added/removed from roles
    - Ensure new action types (provision, destroy, lifecycle, configure, note, export) work in cache lookups
    - Verify existing hasPermission checks (e.g., "proxmox" + "execute") continue to work
    - _Requirements: 29.1, 29.2, 30.1, 30.2, 30.3_

  - [ ]* 5.3 Write property test: Permission Monotonicity
    - **Property 19: Permission Monotonicity**
    - Adding a permission to a role never removes existing permissions; removing a permission never adds new ones
    - **Validates: Requirement 29.2**

- [ ] 6. Journal Service — Data Model and Core Logic
  - [ ] 6.1 Create journal_entries migration and Zod schemas
    - Create `backend/src/database/migrations/008_journal_entries.sql` with the journal_entries table: id, nodeId, nodeUri, eventType, source, action, summary, details (JSON), userId, timestamp
    - Add indexes on nodeId, timestamp DESC, eventType, source, and composite (nodeId, timestamp DESC)
    - Add CHECK constraints for eventType and source validation
    - Create `backend/src/services/journal/types.ts` with JournalEntry, CreateJournalEntry, JournalEventType, JournalSource types and Zod schemas
    - _Requirements: 25.1, 25.2, 25.3, 26.1, 26.2, 26.3, 26.4_

  - [ ] 6.2 Implement JournalService core (recordEvent, addNote, getNodeTimeline)
    - Create `backend/src/services/journal/JournalService.ts` with:
      - `recordEvent(entry)`: validate and insert a journal entry
      - `addNote(nodeId, userId, content)`: create entry with eventType "note" and source "user"
      - `getNodeTimeline(nodeId, options)`: query journal_entries with pagination
      - `searchEntries(query, options)`: full-text search across summary and details
    - Validate source against JournalSource enum (proxmox, aws, bolt, ansible, ssh, puppetdb, user, system)
    - _Requirements: 22.1, 22.2, 22.3, 22.4, 24.1, 24.2, 24.3_

  - [ ] 6.3 Implement JournalService aggregateTimeline with live source merging
    - Add `aggregateTimeline(nodeId, options)` to JournalService
    - Fetch DB-stored events and live-source events (e.g., PuppetDB) in parallel
    - Mark DB events with isLive=false, live events with isLive=true
    - Sort merged results by timestamp descending, apply limit/offset pagination
    - Gracefully skip failed live sources, returning DB events only
    - _Requirements: 23.1, 23.2, 23.3, 23.4, 23.5_

  - [ ]* 6.4 Write property test: Journal Timeline Sort Order
    - **Property 11: Journal Timeline Sort Order**
    - For any set of journal entries, aggregateTimeline returns entries sorted by timestamp descending
    - **Validates: Requirement 23.3**

  - [ ]* 6.5 Write property test: Journal Source Validation
    - **Property 14: Journal Source Validation**
    - For any string not in {proxmox, aws, bolt, ansible, ssh, puppetdb, user, system}, recording fails; for any value in the set, recording succeeds
    - **Validates: Requirements 25.3, 26.3**

  - [ ]* 6.6 Write property test: Journal isLive Flag Correctness
    - **Property 12: Journal isLive Flag Correctness**
    - DB-originated entries have isLive===false, live-fetched entries have isLive===true
    - **Validates: Requirement 23.2**

  - [ ]* 6.7 Write property test: Journal Pagination Bounds
    - **Property 13: Journal Pagination Bounds**
    - For any aggregation with limit L and offset O, result contains at most L entries
    - **Validates: Requirement 23.5**

- [ ] 7. Integration Config Service — Storage, Encryption, and Merge
  - [ ] 7.1 Create integration_configs migration and types
    - Create `backend/src/database/migrations/009_integration_configs.sql` with integration_configs table: id, userId, integrationName, config (JSON), isActive, createdAt, updatedAt
    - Add UNIQUE(userId, integrationName) constraint, FK to users(id) ON DELETE CASCADE
    - Add indexes on userId, integrationName, isActive
    - Create `backend/src/services/IntegrationConfigService.types.ts` with IntegrationConfigRecord interface and Zod schemas
    - _Requirements: 32.1, 32.2, 32.3, 32.4_

  - [ ] 7.2 Implement IntegrationConfigService with encryption
    - Create `backend/src/services/IntegrationConfigService.ts` with:
      - `saveConfig(userId, integrationName, config)`: validate against integration Zod schema, encrypt sensitive fields (matching _token_, _password_, _secret_, _key_) with AES-256-GCM using JWT_SECRET + per-record salt, upsert into DB
      - `getConfig(userId, integrationName)`: retrieve and decrypt sensitive fields
      - `deleteConfig(userId, integrationName)`: remove config record
      - `listConfigs(userId)`: list all configs for a user
      - `getActiveConfigs()`: retrieve all active configs (decrypted)
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5, 20.1, 20.2, 20.3_

  - [ ] 7.3 Implement getEffectiveConfig and rotateEncryptionKey
    - Add `getEffectiveConfig(integrationName)`: merge .env config as base with DB config overriding for non-null keys
    - Add `rotateEncryptionKey(oldKey, newKey)`: re-encrypt all stored configs atomically within a transaction
    - _Requirements: 19.1, 19.2, 19.3, 19.4, 20.4_

  - [ ]* 7.4 Write property test: Encryption Round-Trip
    - **Property 7: Encryption Round-Trip**
    - For any string value v, decrypt(encrypt(v)) === v
    - **Validates: Requirements 18.4, 18.5, 20.3**

  - [ ]* 7.5 Write property test: Config Merge Determinism
    - **Property 6: Config Merge Determinism**
    - For any .env config and DB config, getEffectiveConfig returns merged result where DB values override .env for overlapping non-null keys
    - **Validates: Requirements 19.1, 19.2**

  - [ ]* 7.6 Write property test: Sensitive Field Encryption at Rest
    - **Property 9: Sensitive Field Encryption at Rest**
    - For any config with sensitive fields, raw DB value differs from plaintext after saveConfig
    - **Validates: Requirement 18.4**

  - [ ]* 7.7 Write property test: Integration Config CRUD Round-Trip
    - **Property 8: Integration Config CRUD Round-Trip**
    - Saving then retrieving a config for the same user/integration returns equivalent config with sensitive fields decrypted
    - **Validates: Requirement 18.1**

- [ ] 8. Checkpoint - Core services complete
  - Ensure all tests pass, ask the user if questions arise.
  - Verify RBAC migration seeds correctly, JournalService records and retrieves events, IntegrationConfigService encrypts/decrypts and merges configs.

- [ ] 9. AWS Plugin — Core Implementation
  - [ ] 9.1 Create AWSPlugin skeleton and types
    - Create `backend/src/integrations/aws/` directory
    - Create `backend/src/integrations/aws/types.ts` with AWS-specific types: AWSConfig, InstanceTypeInfo, AMIInfo, VPCInfo, SubnetInfo, SecurityGroupInfo, KeyPairInfo, AWSAuthenticationError
    - Create `backend/src/integrations/aws/AWSPlugin.ts` extending BasePlugin, implementing ExecutionToolPlugin and InformationSourcePlugin with type="both"
    - Register with IntegrationManager using name "aws"
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [ ] 9.2 Implement AWS EC2 inventory and resource discovery
    - Create `backend/src/integrations/aws/AWSService.ts` wrapping @aws-sdk/client-ec2
    - Implement `getInventory()`: list EC2 instances as Node objects with state, type, region, VPC, tags
    - Implement `getGroups()`: group instances by region, VPC, and tags
    - Implement `getNodeFacts(nodeId)`: return instance metadata as Facts
    - Implement resource discovery: `getRegions`, `getInstanceTypes`, `getAMIs`, `getVPCs`, `getSubnets`, `getSecurityGroups`, `getKeyPairs`
    - Add `@aws-sdk/client-ec2` and `@aws-sdk/client-sts` as dependencies
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7_

  - [ ] 9.3 Implement AWS EC2 provisioning and lifecycle actions
    - Implement `executeAction(action)` in AWSPlugin routing to:
      - Provisioning: call EC2 runInstances, return ExecutionResult with instance ID on success
      - Lifecycle: start, stop, reboot, terminate via corresponding EC2 APIs
    - Record journal entry via JournalService on every action completion (success or failure)
    - Throw AWSAuthenticationError on invalid/expired credentials
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 11.1, 11.2, 11.3, 11.4_

  - [ ] 9.4 Implement AWS health check
    - Implement `performHealthCheck()` using STS GetCallerIdentity to validate credentials
    - Return healthy with account details on success, unhealthy with "AWS authentication failed" on invalid credentials
    - Ensure plugin continues accepting config updates when unhealthy
    - _Requirements: 12.1, 12.2, 12.3_

  - [ ]* 9.5 Write property test: AWS Node Field Completeness
    - **Property 16: AWS Node Field Completeness**
    - For any EC2 instance returned by getInventory, the Node includes state, type, region, VPC, and tags
    - **Validates: Requirement 9.4**

  - [ ]* 9.6 Write property test: AWS Instance Grouping Correctness
    - **Property 17: AWS Instance Grouping Correctness**
    - Every instance appears in at least one group; no group contains instances that don't match its criterion
    - **Validates: Requirement 9.2**

  - [ ]* 9.7 Write property test: Plugin Registration Uniqueness
    - **Property 18: Plugin Registration Uniqueness**
    - IntegrationManager never contains two plugins with the same name; duplicate registration throws
    - **Validates: Requirements 31.1, 31.2**

- [ ] 10. Proxmox Enhancements — Compute Type Routing and UI Separation
  - [ ] 10.1 Enhance ProxmoxService with explicit compute type routing
    - Add `createVM(node, params)` and `createLXC(node, params)` methods to `backend/src/integrations/proxmox/ProxmoxService.ts` with type-specific parameter validation
    - Update `getInventory(computeType?)` to support optional "qemu" or "lxc" filter, include `computeType` field ("vm" | "lxc") on every inventory item
    - Update `executeAction` to route lifecycle actions by determining guest type internally
    - Update `getGroups()` to include type-based groups ("Proxmox VMs", "Proxmox Containers")
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 15.1, 15.2, 15.3, 15.4, 16.1, 16.2, 16.3, 16.4_

  - [ ]* 10.2 Write property test: Proxmox Compute Type Partition
    - **Property 15: Proxmox Compute Type Partition**
    - Every inventory item has computeType "vm" or "lxc"; filtering by each produces disjoint sets whose union equals the full inventory
    - **Validates: Requirements 14.3, 14.4, 16.1, 16.2, 16.3**

- [ ] 11. Checkpoint - Plugins complete
  - Ensure all tests pass, ask the user if questions arise.
  - Verify AWS plugin registers, discovers EC2 resources, and records journal events. Verify Proxmox compute type routing works for both VMs and containers.

- [ ] 12. Backend API Routes — Journal, Config, and AWS
  - [ ] 12.1 Create Journal API routes
    - Create `backend/src/routes/journal.ts` with endpoints:
      - `GET /api/journal/:nodeId` — get node timeline (calls aggregateTimeline)
      - `POST /api/journal/:nodeId/notes` — add manual note (calls addNote)
      - `GET /api/journal/search` — search journal entries
    - Add auth middleware with permission checks: "journal:read" for GET, "journal:note" for POST
    - Register routes in server.ts
    - _Requirements: 22.4, 23.1, 24.1, 27.3_

  - [ ] 12.2 Create Integration Config API routes
    - Create `backend/src/routes/integrationConfig.ts` with endpoints:
      - `GET /api/config/integrations/:name` — get effective config
      - `PUT /api/config/integrations/:name` — save config
      - `DELETE /api/config/integrations/:name` — delete config
      - `GET /api/config/integrations` — list user's configs
    - Add auth middleware with permission checks: "integration_config:read" for GET, "integration_config:configure" for PUT/DELETE
    - Register routes in server.ts
    - _Requirements: 18.1, 19.1, 21.2, 27.4_

  - [ ] 12.3 Create AWS integration API routes
    - Create `backend/src/routes/integrations/aws.ts` with endpoints:
      - `GET /api/integrations/aws/inventory` — list EC2 instances
      - `POST /api/integrations/aws/provision` — provision EC2 instance
      - `POST /api/integrations/aws/lifecycle` — lifecycle actions (start/stop/reboot/terminate)
      - `GET /api/integrations/aws/regions` — list regions
      - `GET /api/integrations/aws/instance-types` — list instance types
      - `GET /api/integrations/aws/amis` — list AMIs by region
      - `GET /api/integrations/aws/vpcs` — list VPCs by region
      - `GET /api/integrations/aws/subnets` — list subnets
      - `GET /api/integrations/aws/security-groups` — list security groups
      - `GET /api/integrations/aws/key-pairs` — list key pairs
    - Add auth middleware with permission checks: "aws:read", "aws:provision", "aws:lifecycle"
    - Register routes in server.ts
    - _Requirements: 8.1, 9.1, 10.1, 11.1, 13.1-13.7, 27.2_

- [ ] 13. AWS Plugin Registration and ConfigService Integration
  - [ ] 13.1 Register AWSPlugin in IntegrationManager and update ConfigService
    - Update `backend/src/config/ConfigService.ts` to parse AWS configuration from environment variables (AWS_ENABLED, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_DEFAULT_REGION)
    - Update `backend/src/config/schema.ts` to add AWS config to the Zod schema
    - Update IntegrationManager setup in server.ts to register AWSPlugin when AWS is enabled
    - Wire IntegrationConfigService.getEffectiveConfig into plugin initialization so DB configs override .env
    - _Requirements: 8.2, 8.3, 8.4, 19.1_

  - [ ]* 13.2 Write unit tests for AWS plugin registration
    - Test AWSPlugin registers with name "aws" and type "both"
    - Test IntegrationManager skips registration when AWS is disabled
    - Test duplicate registration throws error
    - _Requirements: 8.2, 8.3, 8.4, 31.1_

- [ ] 14. Frontend — Proxmox UI Separation
  - [ ] 14.1 Split ProxmoxProvisionForm into VM and Container forms
    - Create `frontend/src/components/ProxmoxVMProvisionForm.svelte` with QEMU-specific parameters (ISO images, CPU sockets, BIOS, machine type)
    - Create `frontend/src/components/ProxmoxLXCProvisionForm.svelte` with LXC-specific parameters (OS templates, unprivileged flag, nesting)
    - Both forms submit to the same "proxmox" backend plugin with appropriate computeType metadata
    - Update `frontend/src/pages/ProvisionPage.svelte` to show a compute type selector (VM vs Container) that renders the correct form
    - _Requirements: 17.1, 17.2, 17.3_

- [ ] 15. Frontend — AWS Provisioning and Integration Config UI
  - [ ] 15.1 Create AWS provisioning UI
    - Create `frontend/src/components/AWSProvisionForm.svelte` with EC2 parameters: region, instance type, AMI, VPC, subnet, security group, key pair
    - Add AWS as a provisioning option in `frontend/src/pages/ProvisionPage.svelte`
    - Create `frontend/src/components/AWSSetupGuide.svelte` for AWS configuration guidance
    - Add API client functions in `frontend/src/lib/api.ts` for AWS endpoints
    - _Requirements: 10.1, 13.1-13.7_

  - [ ] 15.2 Create Integration Config management pages
    - Create `frontend/src/pages/IntegrationConfigPage.svelte` listing all registered integrations with config status
    - Add per-integration config forms that call PUT /api/config/integrations/:name
    - Mask sensitive field values by default in the UI, with reveal toggle
    - Add navigation link in `frontend/src/components/Navigation.svelte`
    - _Requirements: 21.1, 21.2, 21.3_

- [ ] 16. Frontend — Journal Timeline UI
  - [ ] 16.1 Create Journal timeline component and integrate into NodeDetailPage
    - Create `frontend/src/components/JournalTimeline.svelte` displaying a paginated, sorted timeline of events with isLive badges, source icons, and event type labels
    - Create `frontend/src/components/JournalNoteForm.svelte` for adding manual notes
    - Add API client functions in `frontend/src/lib/api.ts` for journal endpoints
    - Integrate JournalTimeline into `frontend/src/pages/NodeDetailPage.svelte` as a new tab
    - _Requirements: 23.1, 23.3, 24.1_

- [ ] 17. Frontend — RBAC UI Updates
  - [ ] 17.1 Update role management UI for new permissions
    - Update `frontend/src/components/RoleDetailDialog.svelte` to display and manage new permission resources (proxmox, aws, journal, integration_config) and actions (provision, destroy, lifecycle, configure, note)
    - Update `frontend/src/lib/permissions.ts` with new permission types
    - Show Provisioner role in `frontend/src/pages/RoleManagementPage.svelte`
    - _Requirements: 27.1, 27.2, 27.3, 27.4, 28.1_

- [ ] 18. Checkpoint - Frontend complete
  - Ensure all tests pass, ask the user if questions arise.
  - Verify Proxmox VM/LXC forms render correctly, AWS provisioning form works, journal timeline displays events, and RBAC UI shows new permissions.

- [ ] 19. Wire Journal Events into Plugins
  - [ ] 19.1 Integrate JournalService into ProxmoxIntegration and AWSPlugin
    - Pass JournalService to ProxmoxIntegration and AWSPlugin constructors
    - Record journal entries in ProxmoxService after every provisioning and lifecycle action (success or failure) with source "proxmox"
    - Record journal entries in AWSPlugin after every provisioning and lifecycle action (success or failure) with source "aws"
    - _Requirements: 10.4, 11.4, 22.1, 22.2, 22.3, 25.1, 25.2_

  - [ ]* 19.2 Write property test: Journal Entry Completeness
    - **Property 10: Journal Entry Completeness**
    - For any completed action, exactly one journal entry is recorded with nodeId, nodeUri, eventType, source, action, summary, and timestamp
    - **Validates: Requirements 10.4, 11.4, 22.1, 22.2, 22.3, 22.4**

- [ ] 20. Final Integration and Wiring
  - [ ] 20.1 Update server.ts with complete 1.0.0 bootstrap
    - Ensure server.ts creates DatabaseAdapter via factory, runs migrations, and passes adapter to all services
    - Instantiate JournalService, IntegrationConfigService with adapter
    - Wire IntegrationConfigService effective configs into plugin initialization
    - Register all new routes (journal, integrationConfig, aws)
    - Ensure IntegrationManager enforces plugin name uniqueness (already does, verify)
    - _Requirements: 4.1, 4.2, 6.4, 31.1, 31.2_

- [ ] 21. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
  - Verify end-to-end: database adapter works with SQLite, all services use adapter, AWS plugin registers and discovers, Proxmox routes VM/LXC correctly, journal records events from plugins, config storage encrypts/decrypts, RBAC enforces new permissions.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Database abstraction (tasks 1-4) is foundational and must complete before other features
- The design uses TypeScript throughout — all implementations use TypeScript
