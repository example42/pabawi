# Implementation Plan

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

- [ ] 14. Create comprehensive API documentation
  - [ ] 14.1 Write OpenAPI 3.0 specification document
    - Document all API endpoints with paths and methods
    - Define request/response schemas for all endpoints
    - Include error response examples for each endpoint
    - Add authentication placeholders for future versions
    - Document query parameters and pagination
    - _Requirements: 10.1, 10.2, 10.3, 10.4_
  
  - [ ] 14.2 Add API documentation to docs directory
    - Create docs/api.md with endpoint descriptions
    - Include example requests and responses
    - Document error codes and their meanings
    - Add usage examples for common workflows
    - _Requirements: 10.1, 10.2_

- [ ] 15. Implement performance optimizations
  - [ ] 15.1 Add caching layer for inventory and facts
    - Implement inventory caching with 30-second TTL
    - Implement facts caching per node (5-minute TTL)
    - Add cache invalidation mechanism
    - Use in-memory cache (Map) with timestamp tracking
    - _Requirements: 1.2, 8.1, 8.2, 8.3_
  
  - [ ] 15.2 Optimize database queries
    - Add database indexes for execution queries (status, started_at, target_nodes)
    - Verify indexes are created in schema.sql
    - Test query performance with large datasets
    - _Requirements: 6.3, 6.5_
  
  - [ ] 15.3 Add concurrent execution limiting
    - Implement execution queue with configurable limit (default: 5)
    - Add queue status endpoint to monitor pending executions
    - Handle queue overflow gracefully
    - _Requirements: 8.1, 8.2_

- [ ]* 16. Write integration tests
  - [ ]* 16.1 Test API endpoints with Supertest
    - Test inventory endpoint with mock Bolt CLI
    - Test command execution with whitelist validation
    - Test task execution with parameter validation
    - Test execution history endpoints with pagination
    - _Requirements: 4.6, 4.7, 4.8, 5.3, 6.3_
  
  - [ ]* 16.2 Test Bolt service integration
    - Mock child_process for Bolt CLI execution
    - Test output parsing for various Bolt responses
    - Test error handling for Bolt failures
    - Test timeout handling
    - _Requirements: 3.1, 3.3, 4.3, 5.5_

- [ ]* 17. Write end-to-end tests
  - [ ]* 17.1 Test critical user flows with Playwright
    - Test inventory view → node detail → command execution flow
    - Test inventory view → node detail → facts gathering flow
    - Test inventory view → node detail → task execution flow
    - Test executions page filtering and detail view
    - _Requirements: 1.1, 1.5, 2.1, 4.1, 5.3, 6.1_

- [ ] 18. Implement expert mode feature
  - [x] 18.1 Add expert mode toggle to main navigation
    - Create toggle switch component in Navigation component
    - Store expert mode state in localStorage for persistence
    - Add visual indicator when expert mode is active
    - _Requirements: 8.4, 9.4_
  
  - [x] 18.2 Modify backend to include Bolt command in responses
    - Update BoltService to capture the exact Bolt CLI command being executed
    - Add `boltCommand` field to ExecutionResult interface
    - Include Bolt command in API responses for command, task, and facts operations
    - _Requirements: 4.1, 5.3, 10.2_
  
  - [x] 18.3 Display Bolt commands in frontend when expert mode is enabled
    - Update CommandOutput component to display Bolt command when available
    - Show Bolt command in execution results on Node Detail page
    - Display Bolt command in execution history on Executions page
    - Format command display with monospace font and copy-to-clipboard button
    - _Requirements: 2.3, 2.4, 6.4, 9.4_
  
  - [x] 18.4 Add expert mode indicator to execution records
    - Store whether expert mode was enabled during execution in database
    - Display expert mode badge on execution history items
    - _Requirements: 6.1, 6.3_

- [ ] 19. Enhance project documentation
  - [ ] 19.1 Expand README with comprehensive setup instructions
    - Add detailed prerequisites section
    - Document installation steps for all platforms
    - Add quick start guide
    - Document development workflow
    - Add production deployment instructions
    - _Requirements: 7.1, 7.4, 7.5_
  
  - [ ] 19.2 Create configuration guide
    - Document all environment variables and their defaults
    - Create user guide for command whitelist configuration
    - Document Bolt project requirements (inventory format, bolt-project.yaml)
    - Add examples for different deployment scenarios
    - _Requirements: 7.4, 7.5, 10.1_
  
  - [ ] 19.3 Create troubleshooting guide
    - Add troubleshooting section for common issues
    - Document error messages and their solutions
    - Add debugging tips for Bolt integration issues
    - Include FAQ section
    - _Requirements: 9.1, 9.2, 9.5_
  
  - [ ] 19.4 Create user guide
    - Document how to use the web interface
    - Add screenshots or diagrams for key features
    - Document command execution workflow
    - Document task execution workflow
    - Document facts gathering workflow
    - Document expert mode feature and its benefits
    - _Requirements: 1.1, 2.1, 3.1, 4.1, 5.1_
