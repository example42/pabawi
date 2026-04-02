# Changelog

## [1.0.0]

### Added

- Read-only Integration Status Dashboard showing enabled integrations and connection health
- "Test Connection" buttons for Proxmox and AWS on the Status Dashboard
- Setup guide `.env` snippet wizards with copy-to-clipboard and sensitive value masking
- Database migration 010 to drop `integration_configs` table
- Comprehensive property-based test coverage using fast-check (ConfigService, IntegrationManager, Status Dashboard, Setup Wizards)
- Unit tests for ConfigService env parsing and Zod schema validation
- Unit tests for IntegrationManager plugin lifecycle and graceful degradation
- Frontend component tests for Integration Status Dashboard and Env Snippet Wizards

### Changed

- Configuration system refactored: `.env` is now the single source of truth for all integration settings
- IntegrationConfigPage converted from CRUD UI to read-only Integration Status Dashboard
- Setup guide components converted from database-saving wizards to `.env` snippet generators
- Test connection endpoints refactored to read config from ConfigService (no request body)
- Proxmox and AWS plugins receive config directly from ConfigService without database merges
- All documentation updated to reflect `.env`-only configuration model
- Docker configurations updated with consistent ENV defaults and migration support
- Version bumped to 1.0.0 across all package.json files, Docker labels, and steering docs

### Removed

- `IntegrationConfigService` and `IntegrationConfigService.types.ts`
- `IntegrationConfigRouter` and `/api/config/integrations` CRUD endpoints
- `integration_configs` database table (dropped via migration 010)
- Frontend API functions: `saveIntegrationConfig`, `getIntegrationConfig`, `getIntegrationConfigs`, `deleteIntegrationConfig`, `saveProxmoxConfig`, `saveAWSConfig`
- `IntegrationConfigRecord` frontend type
- Dead code and unused dependencies related to database-stored config overrides

### Breaking Changes from 0.10.0

- `/api/config/integrations` CRUD endpoints removed — all configuration is now via `.env`
- `integration_configs` database table dropped (migration 010 runs automatically)
- Setup guides no longer save configuration to the database
- Test connection endpoints (`POST /api/integrations/proxmox/test`, `POST /api/integrations/aws/test`) no longer accept config in the request body

## [0.8.0]

### Added

- SSH integration with direct command execution capabilities
- Parallel execution UI with batch processing for multiple nodes
- Initial setup wizard for first-time configuration
- User and group creation dialogs with RBAC support
- Self-registration controls for user management
- JWT support for performance metrics monitoring
- Security hardening across integrations

### Changed

- Improved inventory management with SSH integration
- Enhanced type safety in performance metrics
- Updated secrets baseline with comprehensive test coverage

## [0.7.0]

### Added

- Ansible integration with playbook execution
- Ansible inventory and facts gathering capabilities
- Ansible setup guide and documentation
- Hiera class resource tracking
- Integration architecture reorganization

### Changed

- Moved Bolt files to integrations directory for better organization
- Improved type safety in Ansible facts parsing
- Converted Ansible module args from JSON to key=value format

### Fixed

- Puppet run history date range calculation to include today
- RealtimeOutputViewer rendering with invalid execution IDs
- Unit tests and linting issues
- Package lock file updates

## [0.6.0] - 2026

### Added

- Documentation reorganization and improvements
- Version 1.0 planning documentation

### Changed

- Code refactoring and consolidation
- Updated screenshots and README documentation
- Removed sample Bolt project, enhanced Docker documentation
- Updated .env.docker configuration

### Fixed

- Removed unnecessary type arguments
- Documentation consistency and table of contents

## [0.5.0] - 2026

### Added

- Pages titles
- Pagination and execution list unification
- Comprehensive expert mode testing suite
- Logo and screenshots

### Changed

- Unified logging and route refactoring
- Improved Bolt error handling
- Documentation updates and formatting

### Fixed

- Interface improvements
- Multiple lint fixes

## [0.4.0] - 2026

### Added

- Hiera integration and local Puppet codebase integration

### Changed

- Removed certificate management functionality
- Enhanced Puppetserver integration
- Streamlined integrations and enhanced Hiera capabilities

### Fixed

- Tests and lints
- CI fixes

## [0.3.0] - 2025

### Added

- Puppetserver integration with complete service and API client
- PuppetDB integration completion
- Theme system and integration setup guides
- Phase 5 UI restructuring with Puppet page
- Enhanced error handling
- Puppet API documentation
- Windows Docker compatibility

### Changed

- Version bump and Dockerfile updates

### Fixed

- Tests
- Type comparison issues
- Multiple lint fixes

## [0.2.0] - 2025

### Added

- PuppetDB integration foundation and plugin architecture
- Circuit breaker and retry logic for integrations
- Bolt plugin integration
- Performance improvements (caching, database indexes, execution queue)
- Real-time execution streaming via SSE
- Expert mode with Bolt command visibility
- Task organization by module with dynamic parameter forms
- Database migration support
- Package installation interface
- Comprehensive API documentation
- E2E test suite
- Docker multi-arch support
- Pre-commit hooks
- HOST binding configuration
- Network configuration guide

### Changed

- Improved TypeScript type safety and ESLint compliance
- Simplified executions table and version display
- Ubuntu-based Dockerfile
- Updated dependencies

### Fixed

- XSS vulnerability in CommandOutput component
- Tuple format handling in task list output
- Markdown linting rules
- CI/CD workflows and publish scripts
- Multiple lint and test fixes

## [0.1.0] - 2025

### Added

- Initial project structure
- BoltService CLI integration
- Express API endpoints (inventory, commands, tasks, facts, executions)
- Frontend routing system with Svelte
- Inventory, node detail, and executions pages
- Execution repository with CRUD operations
- Command whitelist service
- Task listing and execution
- Facts gathering
- Error handling and toast notifications
- Database schema and migrations
- GitHub Actions CI/CD workflows
- Devcontainer support

### Changed

- Initial architecture and dependencies setup

### Fixed

- Docker schema.sql copying
- Various initialization and configuration issues
