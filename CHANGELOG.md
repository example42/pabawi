# Changelog

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
