# Implementation Plan

## Status Summary

**Core Features: ✅ Complete**

- All backend services and API endpoints implemented
- All frontend components and pages implemented
- Expert mode with detailed error output and command visibility
- Realtime streaming of execution output via SSE
- Performance optimizations (caching, concurrent execution limiting)
- Docker deployment configuration

**Testing: ⚠️ Partial (Optional tasks)**

- Unit tests exist for core backend services
- Integration tests marked as optional (not implemented)
- E2E tests marked as optional (not implemented)

**Documentation: ⚠️ Partial**

- ✅ README with setup and deployment instructions
- ✅ API documentation (docs/api.md and OpenAPI spec)
- ❌ Configuration guide (docs/configuration.md) - **NEEDED**
- ❌ Troubleshooting guide (docs/troubleshooting.md) - **NEEDED**
- ❌ User guide (docs/user-guide.md) - **NEEDED**

## Tasks

- [x] 1. Initialize project structure and dependencies
  - Create monorepo structure with frontend and backend directories
  - Initialize package.json for both frontend (Svelte + Vite) and backend (Node.js + TypeScript)
  - Configure TypeScript for both projects with appropriate compiler options
  - Set up Tailwind CSS configuration for frontend
  - Install core dependencies: Express, SQLite3, Zod for backend; Svelte 5, Vite for frontend
  - _Requirements: 7.1, 7.2, 7.3_

- [x] 2. Implement backend configuration and initialization
  - Create configuration service to load settings from environment variables and .env file
  - Implement configuration schema with Zod validation
  - Create database initialization script for SQLite schema
  - Add startup validation for Bolt configuration files
  - _Requirements: 7.1, 7.4, 7.5, 10.1_

- [x] 3. Implement Bolt service for CLI integration
  - [x] 3.1 Create BoltService class with child process execution wrapper
    - Implement command execution with timeout handling
    - Add JSON output parsing from Bolt CLI
    - Implement stderr capture for error messages
    - _Requirements: 4.1, 4.2, 5.2, 7.2_
  
  - [x] 3.2 Implement inventory retrieval method
    - Execute `bolt inventory show --format json` command
    - Parse and transform inventory JSON to Node model
    - Handle inventory file not found errors
    - _Requirements: 1.1, 7.1_
  
  - [x] 3.3 Implement facts gathering method
    - Execute `bolt task run facts --targets <node> --format json`
    - Parse facts output and structure as Facts model
    - Handle node unreachable errors
    - _Requirements: 3.1, 3.2, 3.3_
  
  - [x] 3.4 Implement command execution method
    - Execute `bolt command run <cmd> --targets <node> --format json`
    - Parse execution results including stdout, stderr, exit code
    - Handle execution failures and timeouts
    - _Requirements: 4.1, 4.2, 4.3_
  
  - [x] 3.5 Implement task execution method
    - Execute `bolt task run <task> --targets <node> --params <json> --format json`
    - Parse task results with structured output
    - Handle task not found and parameter validation errors
    - _Requirements: 5.3, 5.4, 5.5_
  
  - [x] 3.6 Implement task listing method
    - Execute `bolt task show --format json` to list available tasks
    - Parse task metadata including parameters and descriptions
    - Cache task list until server restart
    - _Requirements: 5.1, 5.2_

- [x] 4. Implement command whitelist service
  - Create CommandWhitelistService class with configuration loading
  - Implement command validation logic with exact and prefix match modes
  - Add isCommandAllowed method that checks against whitelist or allowAll flag
  - Handle empty whitelist with allowAll disabled (reject all commands)
  - _Requirements: 4.6, 4.7, 4.8, 4.9_

- [x] 5. Implement execution repository for persistence
  - [x] 5.1 Create ExecutionRepository class with SQLite connection
    - Initialize database connection with proper error handling
    - Implement connection pooling configuration
    - _Requirements: 6.2_
  
  - [x] 5.2 Implement CRUD operations for executions
    - Create method to insert new execution records
    - Update method to modify execution status and results
    - FindById method to retrieve single execution
    - FindAll method with filtering and pagination support
    - CountByStatus method for summary statistics
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [x] 6. Implement Express API endpoints
  - [x] 6.1 Set up Express server with middleware
    - Configure JSON body parser
    - Add CORS middleware for same-origin requests
    - Implement request logging middleware
    - Add global error handling middleware
    - _Requirements: 10.5_
  
  - [x] 6.2 Implement inventory endpoints
    - GET /api/inventory - return all nodes from Bolt inventory
    - GET /api/nodes/:id - return specific node details
    - Add request validation with Zod schemas
    - _Requirements: 1.1, 1.3, 2.1_
  
  - [x] 6.3 Implement facts endpoint
    - POST /api/nodes/:id/facts - trigger facts gathering for node
    - Return structured facts data or error response
    - Handle node not found and unreachable errors
    - _Requirements: 3.1, 3.3, 3.4_
  
  - [x] 6.4 Implement command execution endpoint
    - POST /api/nodes/:id/command - execute command on node
    - Validate command against whitelist before execution
    - Store execution record in database
    - Return execution ID and initial status
    - _Requirements: 4.1, 4.3, 4.5, 4.6, 4.7, 4.8, 4.9_
  
  - [x] 6.5 Implement task execution endpoint
    - POST /api/nodes/:id/task - execute task on node
    - Validate task name and parameters
    - Store execution record in database
    - Return execution ID and initial status
    - _Requirements: 5.3, 5.4, 5.5_
  
  - [x] 6.6 Implement task listing endpoint
    - GET /api/tasks - return available Bolt tasks
    - Include task metadata and parameter definitions
    - _Requirements: 5.1_
  
  - [x] 6.7 Implement execution history endpoints
    - GET /api/executions - return paginated execution list with filters
    - GET /api/executions/:id - return detailed execution results
    - Support filtering by date, status, and target node
    - _Requirements: 6.1, 6.3, 6.4_
  
  - [x] 6.8 Implement configuration endpoint
    - GET /api/config - return system configuration (whitelist status, allowed commands)
    - Exclude sensitive configuration values
    - _Requirements: 10.1, 10.2_

- [x] 7. Implement frontend routing and layout
  - Set up Svelte 5 project with TypeScript and Vite
  - Configure Tailwind CSS with custom theme
  - Create main App component with routing (use svelte-routing or similar)
  - Implement navigation layout with links to Inventory, Executions pages
  - Create shared components: LoadingSpinner, ErrorAlert, StatusBadge
  - _Requirements: 8.1, 8.4_

- [x] 8. Implement Inventory page component
  - [x] 8.1 Create InventoryPage component with data fetching
    - Fetch inventory from /api/inventory on mount
    - Display loading state during fetch
    - Handle and display errors
    - _Requirements: 1.1, 9.2_
  
  - [x] 8.2 Implement inventory display with virtual scrolling
    - Render node list with virtual scrolling for performance
    - Display node name, transport type, and URI
    - Support grid and list view toggle
    - _Requirements: 1.2, 1.3, 8.2_
  
  - [x] 8.3 Add search and filter functionality
    - Implement search input with debouncing (300ms)
    - Filter nodes by name, transport type
    - Update displayed nodes reactively
    - _Requirements: 1.4_
  
  - [x] 8.4 Implement navigation to node detail
    - Add click handlers to navigate to node detail page
    - Pass node ID as route parameter
    - _Requirements: 1.5_

- [x] 9. Implement Node Detail page component
  - [x] 9.1 Create NodeDetailPage component with node loading
    - Extract node ID from route parameters
    - Fetch node details from /api/nodes/:id
    - Display node metadata (name, URI, transport, config)
    - _Requirements: 2.1_
  
  - [x] 9.2 Implement facts display section
    - Add "Gather Facts" button to trigger facts collection
    - POST to /api/nodes/:id/facts when button clicked
    - Display facts in collapsible tree structure (FactsViewer component)
    - Show loading state during facts gathering
    - _Requirements: 2.2, 3.3_
  
  - [x] 9.3 Implement command execution form
    - Create form with command input field
    - Add validation for empty commands
    - POST to /api/nodes/:id/command on submit
    - Display execution results with stdout, stderr, exit code
    - Show command whitelist errors clearly
    - _Requirements: 2.3, 4.3, 4.4, 9.2, 9.3_
  
  - [x] 9.4 Implement task execution form
    - Fetch available tasks from /api/tasks
    - Create dropdown to select task
    - Dynamically generate parameter inputs based on task definition
    - POST to /api/nodes/:id/task with task name and parameters
    - Display task execution results
    - _Requirements: 2.4, 5.1, 5.2, 5.5_
  
  - [x] 9.5 Display execution history for node
    - Fetch executions filtered by node ID from /api/executions
    - Display recent executions with status and timestamp
    - Link to full execution details
    - _Requirements: 2.5_

- [x] 10. Implement Executions page component
  - [x] 10.1 Create ExecutionsPage component with data fetching
    - Fetch executions from /api/executions with pagination
    - Display loading state and handle errors
    - _Requirements: 6.1, 9.2_
  
  - [x] 10.2 Implement execution list display
    - Render paginated execution list (50 per page)
    - Display execution type, targets, action, status, timestamp
    - Show status with color-coded badges
    - _Requirements: 6.1, 6.3_
  
  - [x] 10.3 Add filtering controls
    - Implement date range filter
    - Add status filter (all, success, failed, running)
    - Add target node filter
    - Update API request with filter parameters
    - _Requirements: 6.5_
  
  - [x] 10.4 Implement execution detail view
    - Create modal or detail panel for execution details
    - Display per-node results with stdout/stderr
    - Show execution summary (duration, success/failure counts)
    - _Requirements: 6.4_
  
  - [x] 10.5 Add summary statistics
    - Fetch execution counts by status
    - Display summary cards at top of page
    - _Requirements: 6.3_

- [x] 11. Implement shared UI components
  - Create CommandOutput component for formatted stdout/stderr display
  - Create FactsViewer component with collapsible JSON tree
  - Implement StatusBadge with color coding (success=green, failed=red, running=blue)
  - Create ErrorAlert component with retry button support
  - Implement LoadingSpinner component
  - _Requirements: 8.4, 9.2, 9.4_

- [x] 12. Implement error handling and user feedback
  - Add error boundary components for graceful error handling
  - Implement toast notifications for success/error messages
  - Add retry logic for failed API requests
  - Display actionable error messages with guidance
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

- [x] 13. Create Docker container configuration
  - [x] 13.1 Write Dockerfile with multi-stage build
    - Stage 1: Build frontend with Vite
    - Stage 2: Build backend TypeScript
    - Stage 3: Production image with Node.js and Bolt CLI
    - Install Bolt CLI in production image
    - Copy built frontend to public directory
    - Copy built backend and node_modules
    - _Requirements: 7.1_
  
  - [x] 13.2 Create .dockerignore file
    - Exclude node_modules, dist, build artifacts
    - Exclude development files and documentation
    - _Requirements: 7.1_
  
  - [x] 13.3 Configure container runtime
    - Set up volume mounts for Bolt project and database
    - Configure environment variables
    - Expose port 3000
    - Run as non-root user with proper permissions
    - _Requirements: 7.1, 7.2_
  
  - [x] 13.4 Create docker-compose.yml for local development
    - Define service with volume mounts
    - Set environment variables from .env file
    - Configure port mapping (3000:3000)
    - Add healthcheck configuration
    - _Requirements: 7.1_

- [x] 14. Implement task organization by module
  - [x] 14.1 Add module extraction to BoltService
    - Implement extractModuleName function to parse module from task name (e.g., "psick::puppet_agent" → "psick")
    - Implement groupTasksByModule function to organize tasks by module
    - Add GET /api/tasks/by-module endpoint to return tasks grouped by module
    - _Requirements: 1.1, 1.2_
  
  - [x] 14.2 Create TaskRunInterface component
    - Create component with collapsible module sections
    - **CRITICAL: Display modules in multiple columns (grid layout) for better space utilization**
    - **CRITICAL: Show task details on mouseover/hover instead of requiring click**
    - Display tasks organized by module with search/filter
    - Implement task selection to show task details
    - _Requirements: 1.1, 1.3_
  
  - [x] 14.3 Implement dynamic task parameter form
    - Create TaskParameterForm component for dynamic form generation
    - Generate appropriate input types based on parameter schema (String, Integer, Boolean, Array, Hash)
    - Implement parameter validation (required fields, type checking)
    - Add JSON editor for Array and Hash parameters
    - _Requirements: 1.2, 1.3, 1.5_
  
  - [x] 14.4 Implement task execution from TaskRunInterface
    - Add execute button with loading state
    - POST to /api/nodes/:id/task with selected task and parameters
    - Display execution results with success/error status
    - Show execution history for each task
    - _Requirements: 1.4, 1.6, 1.7_

- [x] 15. Implement Puppet run interface in node detail page
  - [x] 15.1 Add Puppet run section to NodeDetailPage
    - Create PuppetRunInterface component
    - Add "Run Puppet" collapsible section to node detail page
    - Position section prominently in node detail layout
    - _Requirements: 2.1_
  
  - [x] 15.2 Implement Puppet run configuration controls
    - Add tags input with multi-select or comma-separated values
    - Add environment dropdown or text input
    - **CRITICAL: Move noop mode, no-noop mode, and debug mode toggles inside "Show advanced options" section**
    - Add expandable section for additional options
    - _Requirements: 2.2, 2.4, 2.5, 2.6, 2.7, 2.8_
  
  - [x] 15.3 Implement Puppet run execution
    - Add runPuppetAgent method to BoltService
    - Construct psick::puppet_agent task parameters from configuration
    - Add POST /api/nodes/:id/puppet-run endpoint
    - Execute Bolt task with configured parameters
    - _Requirements: 2.3_
  
  - [x] 15.4 Implement Puppet run results display
    - Parse Puppet output for resource changes
    - Extract metrics (changed, failed, skipped resources)
    - Create PuppetOutputViewer component with syntax highlighting
    - Display resource changes with status indicators
    - Show execution time and summary metrics
    - _Requirements: 2.9, 2.10_

- [x] 16. Implement expert mode for detailed error output and command visibility
  - [x] 16.1 Create expert mode state management
    - Add expert mode toggle to navigation or settings
    - Implement localStorage persistence for expert mode preference
    - Create global state accessible to all components
    - Add visual indicator when expert mode is active
    - _Requirements: 3.1, 3.5_
  
  - [x] 16.2 Implement ErrorHandlingService in backend
    - Create ErrorHandlingService class for error formatting
    - Implement formatError method with expert mode parameter
    - Add request ID generation for error correlation
    - Capture stack traces and execution context
    - **CRITICAL: Capture and include the full Bolt CLI command being executed in all responses**
    - _Requirements: 3.2, 3.6_
  
  - [x] 16.3 Update API error middleware for expert mode
    - Check X-Expert-Mode header in error middleware
    - Include stack traces in expert mode responses
    - Add request ID, timestamp, and execution context
    - Capture raw Bolt CLI output for expert mode
    - **CRITICAL: Always include the full Bolt command in error responses when expert mode is enabled**
    - Sanitize sensitive data even in expert mode
    - _Requirements: 3.2, 3.3_
  
  - [x] 16.4 Update frontend to send expert mode header
    - Modify API client to include X-Expert-Mode header when enabled
    - Update all API request functions to check expert mode state
    - _Requirements: 3.6_
  
  - [x] 16.5 Create DetailedErrorDisplay component
    - Create component for expert mode error display
    - Show basic error message always
    - Add expandable sections for stack trace, raw response, context
    - **CRITICAL: Display the full Bolt CLI command prominently in expert mode**
    - Implement JSON viewer for raw API responses
    - Add copy-to-clipboard for error details and Bolt commands
    - _Requirements: 3.2, 3.3, 3.4_
  
  - [x] 16.6 Update ErrorAlert component for expert mode
    - Modify ErrorAlert to use DetailedErrorDisplay when expert mode enabled
    - Show simplified errors when expert mode disabled
    - Add toggle to expand/collapse detailed information
    - _Requirements: 3.2, 3.4_
  
  - [x] 16.7 Display Bolt commands in all execution contexts
    - **CRITICAL: In expert mode, always show the full Bolt command in ANY place where a command or task is run**
    - Update CommandOutput component to display Bolt command when expert mode is enabled
    - Show Bolt command in command execution results on Node Detail page
    - Show Bolt command in task execution results on Node Detail page
    - Show Bolt command in facts gathering results on Node Detail page
    - Show Bolt command in Puppet run results on Node Detail page
    - Display Bolt command in execution history on Executions page
    - Display Bolt command in execution detail modal/panel
    - Format command display with monospace font, syntax highlighting, and copy-to-clipboard button
    - Position Bolt command prominently at the top of execution results
    - _Requirements: 2.3, 2.4, 3.1, 4.1, 5.3, 6.4, 9.4_

- [x] 17. Implement package installation interface in node detail page
  - [x] 17.1 Add package installation section to NodeDetailPage
    - Create PackageInstallInterface component
    - Add "Install Packages" collapsible section to node detail page
    - Position section in node detail layout
    - _Requirements: 2.1_
  
  - [x] 17.2 Implement configurable package installation task
    - Add PACKAGE_INSTALL_TASK configuration variable (default: "tp::install")
    - Add PACKAGE_INSTALL_MODULE configuration variable (default: "example42/tp")
    - Load configuration from environment variables
    - Validate task availability on startup
    - _Requirements: 7.4, 10.1_
  
  - [x] 17.3 Create package installation form
    - Add package name input field (required)
    - Add package version input field (optional)
    - Add ensure dropdown (present/absent/latest)
    - Add settings textarea for additional parameters (JSON format)
    - Add validation for package name format
    - _Requirements: 1.2, 1.3_
  
  - [x] 17.4 Implement package installation execution
    - Add installPackage method to BoltService
    - Construct task parameters from form inputs (app, ensure, settings)
    - Add POST /api/nodes/:id/install-package endpoint
    - Execute configured Bolt task with parameters
    - Handle task not found errors gracefully
    - _Requirements: 2.3, 5.3_
  
  - [x] 17.5 Display package installation results
    - Parse task output for installation status
    - Show success/failure status with details
    - Display any warnings or errors from package manager
    - Show installed package version
    - Add to execution history
    - _Requirements: 2.9, 6.1_
  
  - [x] 17.6 Add package installation history
    - Display recent package installations for the node
    - Show package name, version, status, and timestamp
    - Link to full execution details
    - Filter execution history by package installation type
    - _Requirements: 2.5, 6.3_
  
  - [x] 17.7 Implement expert mode for package installations
    - Display full Bolt command in expert mode
    - Show raw task output in expert mode
    - Include task parameters in execution details
    - _Requirements: 3.1, 3.6_

- [x] 18. Create comprehensive API documentation
  - [x] 18.1 Write OpenAPI 3.0 specification document
    - Document all API endpoints with paths and methods (inventory, nodes, facts, commands, tasks, puppet-run,
      install-package, executions, streaming)
    - Define request/response schemas for all endpoints
    - Include error response examples for each endpoint with expert mode fields
    - Add authentication placeholders for future versions
    - Document query parameters and pagination
    - Document expert mode header (X-Expert-Mode) and its effects
    - Document streaming endpoints and SSE event types
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 13.1_
  
  - [x] 18.2 Add API documentation to docs directory
    - Create docs/api.md with endpoint descriptions
    - Include example requests and responses for all endpoints
    - Document error codes and their meanings
    - Add usage examples for common workflows (command execution, task execution, Puppet runs,
      package installation)
    - Document expert mode feature and how to enable it
    - Document streaming execution output via SSE
    - _Requirements: 10.1, 10.2, 13.1_

- [x] 19. Implement performance optimizations
  - [x] 19.1 Add caching layer for inventory and facts
    - Implement inventory caching with 30-second TTL in BoltService
    - Implement facts caching per node (5-minute TTL) in BoltService
    - Add cache invalidation mechanism
    - Use in-memory cache (Map) with timestamp tracking
    - Add configuration options for cache TTL values
    - _Requirements: 1.2, 11.1, 11.2, 11.3_
  
  - [x] 19.2 Optimize database queries
    - Verify database indexes exist for execution queries (status, started_at, target_nodes) in schema.sql
    - Add any missing indexes
    - Test query performance with large datasets (1000+ executions)
    - Document index strategy in schema.sql comments
    - _Requirements: 9.3, 9.5_
  
  - [x] 19.3 Add concurrent execution limiting
    - Implement execution queue with configurable limit (default: 5) in backend
    - Add queue status endpoint GET /api/executions/queue to monitor pending executions
    - Handle queue overflow gracefully with appropriate error messages
    - Add configuration option CONCURRENT_EXECUTION_LIMIT
    - _Requirements: 11.1, 11.2_

- [x] 20. Write integration tests
  - [x] 20.1 Test API endpoints with Supertest
    - Test inventory endpoint with mock Bolt CLI
    - Test command execution with whitelist validation
    - Test task execution with parameter validation
    - Test execution history endpoints with pagination
    - _Requirements: 4.6, 4.7, 4.8, 5.3, 6.3_
  
  - [x] 20.2 Test Bolt service integration
    - Mock child_process for Bolt CLI execution
    - Test output parsing for various Bolt responses
    - Test error handling for Bolt failures
    - Test timeout handling
    - _Requirements: 3.1, 3.3, 4.3, 5.5_

- [x] 21. Write end-to-end tests
  - [x] 21.1 Test critical user flows with Playwright
    - Test inventory view → node detail → command execution flow
    - Test inventory view → node detail → facts gathering flow
    - Test inventory view → node detail → task execution flow
    - Test executions page filtering and detail view
    - _Requirements: 1.1, 1.5, 2.1, 4.1, 5.3, 6.1_

- [x] 22. Implement expert mode feature (legacy - superseded by task 16)
  - [x] 22.1 Add expert mode toggle to main navigation
    - Create toggle switch component in Navigation component
    - Store expert mode state in localStorage for persistence
    - Add visual indicator when expert mode is active
    - _Requirements: 11.4_
  
  - [x] 22.2 Modify backend to include Bolt command in responses
    - Update BoltService to capture the exact Bolt CLI command being executed
    - Add `boltCommand` field to ExecutionResult interface
    - Include Bolt command in API responses for command, task, and facts operations
    - _Requirements: 7.1, 8.1, 13.2_
  
  - [x] 22.3 Display Bolt commands in frontend when expert mode is enabled
    - Update CommandOutput component to display Bolt command when available
    - Show Bolt command in execution results on Node Detail page
    - Display Bolt command in execution history on Executions page
    - Format command display with monospace font and copy-to-clipboard button
    - _Requirements: 5.1, 5.3, 9.4, 12.3_
  
  - [x] 22.4 Add expert mode indicator to execution records
    - Store whether expert mode was enabled during execution in database
    - Display expert mode badge on execution history items
    - _Requirements: 9.1, 9.3_

- [x] 23. Enhance project documentation
  - [x] 23.1 Expand README with comprehensive setup instructions
    - Add detailed prerequisites section (Node.js, Bolt CLI, Docker optional)
    - Document installation steps for all platforms (macOS, Linux, Windows)
    - Add quick start guide with minimal steps to get running
    - Document development workflow (running frontend and backend separately)
    - Add production deployment instructions (Docker, standalone)
    - Document how to configure Bolt project path
    - _Requirements: 10.1, 10.5_
  
  - [x] 23.2 Create configuration guide in docs/configuration.md
    - Document all environment variables and their defaults (PORT, BOLT_PROJECT_PATH, COMMAND_WHITELIST_*,
      EXECUTION_TIMEOUT, DATABASE_PATH, PACKAGE_INSTALL_*, STREAMING_*, CONCURRENT_EXECUTION_LIMIT)
    - Create user guide for command whitelist configuration with examples
    - Document Bolt project requirements (inventory.yaml format, bolt-project.yaml structure)
    - Add examples for different deployment scenarios (development, production, Docker)
    - Document package installation configuration (PACKAGE_INSTALL_TASK, PACKAGE_INSTALL_MODULE)
    - Document expert mode configuration and usage
    - Document streaming configuration options
    - Document caching configuration (inventory TTL, facts TTL)
    - _Requirements: 10.1, 10.2_
  
  - [x] 23.3 Create troubleshooting guide in docs/troubleshooting.md
    - Add troubleshooting section for common issues (Bolt not found, inventory errors, connection failures)
    - Document error messages and their solutions with examples
    - Add debugging tips for Bolt integration issues
    - Include FAQ section covering common questions
    - Document how to use expert mode for debugging
    - Add section on interpreting Bolt command output
    - Document streaming connection issues and solutions
    - Add troubleshooting for database permission errors
    - _Requirements: 12.1, 12.2, 12.5_
  
  - [x] 23.4 Create user guide in docs/user-guide.md
    - Document how to use the web interface with step-by-step instructions
    - Add screenshots or diagrams for key features (inventory view, node detail, task execution)
    - Document command execution workflow with examples
    - Document task execution workflow with parameter configuration
    - Document facts gathering workflow
    - Document Puppet run workflow with configuration options
    - Document package installation workflow
    - Document expert mode feature and its benefits for troubleshooting
    - Document execution history and filtering
    - Document realtime streaming output feature
    - _Requirements: 4.1, 5.1, 1.1, 2.1, 3.1_

- [x] 24. Implement realtime streaming of command/task output in expert mode
  - [x] 24.1 Add Server-Sent Events (SSE) support to backend
    - Create SSE middleware for streaming responses
    - Add SSE endpoint for execution streaming: GET /api/executions/:id/stream
    - Implement connection management and cleanup
    - Add heartbeat mechanism to keep connections alive
    - _Requirements: 3.1, 11.1_
  
  - [x] 24.2 Modify BoltService to support streaming output
    - **CRITICAL: Modify executeCommand to accept optional callback for streaming stdout/stderr**
    - Add streamingCallback parameter to executeCommand method
    - Emit stdout/stderr chunks in real-time as they arrive from child process
    - Maintain backward compatibility with non-streaming executions
    - Include command string in streaming events
    - _Requirements: 3.1, 7.1, 8.1_
  
  - [x] 24.3 Update command and task execution routes for streaming
    - Modify command execution route to support streaming when expert mode is enabled
    - Modify task execution route to support streaming when expert mode is enabled
    - Modify Puppet run route to support streaming when expert mode is enabled
    - Modify package installation route to support streaming when expert mode is enabled
    - Store execution ID before starting execution for stream subscription
    - Emit streaming events during execution (stdout, stderr, status updates, command)
    - Emit completion event when execution finishes
    - _Requirements: 5.1, 5.3, 7.1, 8.1_
  
  - [x] 24.4 Create StreamingExecutionManager service
    - Implement in-memory execution stream registry
    - Track active streaming connections per execution ID
    - Provide methods to emit events to all subscribers of an execution
    - Handle connection cleanup when clients disconnect
    - Implement event types: 'start', 'stdout', 'stderr', 'status', 'complete', 'error', 'command'
    - _Requirements: 11.1, 11.2_
  
  - [x] 24.5 Create frontend SSE client utility
    - Create useExecutionStream Svelte 5 utility in frontend/src/lib/
    - Implement EventSource connection management
    - Parse SSE events and update reactive state
    - Handle reconnection on connection loss
    - Provide cleanup on component unmount
    - _Requirements: 11.4_
  
  - [x] 24.6 Create RealtimeOutputViewer component
    - Create Svelte component for displaying streaming output in frontend/src/components/
    - **CRITICAL: Display Bolt command at the top when expert mode is enabled**
    - Show stdout and stderr in separate sections with syntax highlighting
    - Auto-scroll to bottom as new output arrives
    - Add toggle to pause auto-scrolling
    - Display execution status (running, success, failed)
    - Show elapsed time during execution
    - Add copy-to-clipboard for full output
    - _Requirements: 3.1, 3.4, 11.4_
  
  - [x] 24.7 Integrate RealtimeOutputViewer in Node Detail page
    - Replace static CommandOutput with RealtimeOutputViewer when expert mode is enabled and execution is running
    - Show RealtimeOutputViewer for command execution results
    - Show RealtimeOutputViewer for task execution results
    - Show RealtimeOutputViewer for Puppet run results
    - Show RealtimeOutputViewer for package installation results
    - Fall back to static output when expert mode is disabled or execution is complete
    - _Requirements: 5.1, 5.3, 3.1, 11.4_
  
  - [x] 24.8 Add streaming support to Executions page
    - Show realtime indicator for running executions in execution list
    - Allow viewing streaming output from execution history
    - Display RealtimeOutputViewer in execution detail modal when expert mode is enabled and execution is running
    - _Requirements: 9.4, 11.4_
  
  - [x] 24.9 Implement error handling for streaming
    - Handle SSE connection errors gracefully in frontend
    - Show connection status indicator (connected, disconnected, reconnecting)
    - Display error messages when streaming fails
    - Fall back to polling execution status if streaming is unavailable
    - _Requirements: 12.1, 12.2_
  
  - [x] 24.10 Add streaming performance optimizations
    - Implement output buffering to reduce event frequency (100ms buffer) in StreamingExecutionManager
    - Limit maximum output size per execution (configurable, default 10MB)
    - Truncate very long lines in streaming output
    - Add configuration for streaming buffer size and limits (STREAMING_BUFFER_MS, STREAMING_MAX_OUTPUT_SIZE)
    - _Requirements: 11.1, 11.2, 11.3_
