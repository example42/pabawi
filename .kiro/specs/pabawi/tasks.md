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

- [ ] 3. Implement Bolt service for CLI integration
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
  
  - [ ] 3.5 Implement task execution method
    - Execute `bolt task run <task> --targets <node> --params <json> --format json`
    - Parse task results with structured output
    - Handle task not found and parameter validation errors
    - _Requirements: 5.3, 5.4, 5.5_
  
  - [ ] 3.6 Implement task listing method
    - Execute `bolt task show --format json` to list available tasks
    - Parse task metadata including parameters and descriptions
    - Cache task list until server restart
    - _Requirements: 5.1, 5.2_

- [ ] 4. Implement command whitelist service
  - Create CommandWhitelistService class with configuration loading
  - Implement command validation logic with exact and prefix match modes
  - Add isCommandAllowed method that checks against whitelist or allowAll flag
  - Handle empty whitelist with allowAll disabled (reject all commands)
  - _Requirements: 4.6, 4.7, 4.8, 4.9_

- [ ] 5. Implement execution repository for persistence
  - [ ] 5.1 Create ExecutionRepository class with SQLite connection
    - Initialize database connection with proper error handling
    - Implement connection pooling configuration
    - _Requirements: 6.2_
  
  - [ ] 5.2 Implement CRUD operations for executions
    - Create method to insert new execution records
    - Update method to modify execution status and results
    - FindById method to retrieve single execution
    - FindAll method with filtering and pagination support
    - CountByStatus method for summary statistics
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [ ] 6. Implement Express API endpoints
  - [ ] 6.1 Set up Express server with middleware
    - Configure JSON body parser
    - Add CORS middleware for same-origin requests
    - Implement request logging middleware
    - Add global error handling middleware
    - _Requirements: 10.5_
  
  - [ ] 6.2 Implement inventory endpoints
    - GET /api/inventory - return all nodes from Bolt inventory
    - GET /api/nodes/:id - return specific node details
    - Add request validation with Zod schemas
    - _Requirements: 1.1, 1.3, 2.1_
  
  - [ ] 6.3 Implement facts endpoint
    - POST /api/nodes/:id/facts - trigger facts gathering for node
    - Return structured facts data or error response
    - Handle node not found and unreachable errors
    - _Requirements: 3.1, 3.3, 3.4_
  
  - [ ] 6.4 Implement command execution endpoint
    - POST /api/nodes/:id/command - execute command on node
    - Validate command against whitelist before execution
    - Store execution record in database
    - Return execution ID and initial status
    - _Requirements: 4.1, 4.3, 4.5, 4.6, 4.7, 4.8, 4.9_
  
  - [ ] 6.5 Implement task execution endpoint
    - POST /api/nodes/:id/task - execute task on node
    - Validate task name and parameters
    - Store execution record in database
    - Return execution ID and initial status
    - _Requirements: 5.3, 5.4, 5.5_
  
  - [ ] 6.6 Implement task listing endpoint
    - GET /api/tasks - return available Bolt tasks
    - Include task metadata and parameter definitions
    - _Requirements: 5.1_
  
  - [ ] 6.7 Implement execution history endpoints
    - GET /api/executions - return paginated execution list with filters
    - GET /api/executions/:id - return detailed execution results
    - Support filtering by date, status, and target node
    - _Requirements: 6.1, 6.3, 6.4_
  
  - [ ] 6.8 Implement configuration endpoint
    - GET /api/config - return system configuration (whitelist status, allowed commands)
    - Exclude sensitive configuration values
    - _Requirements: 10.1, 10.2_

- [ ] 7. Implement frontend routing and layout
  - Set up Svelte 5 project with TypeScript and Vite
  - Configure Tailwind CSS with custom theme
  - Create main App component with routing (use svelte-routing or similar)
  - Implement navigation layout with links to Inventory, Executions pages
  - Create shared components: LoadingSpinner, ErrorAlert, StatusBadge
  - _Requirements: 8.1, 8.4_

- [ ] 8. Implement Inventory page component
  - [ ] 8.1 Create InventoryPage component with data fetching
    - Fetch inventory from /api/inventory on mount
    - Display loading state during fetch
    - Handle and display errors
    - _Requirements: 1.1, 9.2_
  
  - [ ] 8.2 Implement inventory display with virtual scrolling
    - Render node list with virtual scrolling for performance
    - Display node name, transport type, and URI
    - Support grid and list view toggle
    - _Requirements: 1.2, 1.3, 8.2_
  
  - [ ] 8.3 Add search and filter functionality
    - Implement search input with debouncing (300ms)
    - Filter nodes by name, transport type
    - Update displayed nodes reactively
    - _Requirements: 1.4_
  
  - [ ] 8.4 Implement navigation to node detail
    - Add click handlers to navigate to node detail page
    - Pass node ID as route parameter
    - _Requirements: 1.5_

- [ ] 9. Implement Node Detail page component
  - [ ] 9.1 Create NodeDetailPage component with node loading
    - Extract node ID from route parameters
    - Fetch node details from /api/nodes/:id
    - Display node metadata (name, URI, transport, config)
    - _Requirements: 2.1_
  
  - [ ] 9.2 Implement facts display section
    - Add "Gather Facts" button to trigger facts collection
    - POST to /api/nodes/:id/facts when button clicked
    - Display facts in collapsible tree structure (FactsViewer component)
    - Show loading state during facts gathering
    - _Requirements: 2.2, 3.3_
  
  - [ ] 9.3 Implement command execution form
    - Create form with command input field
    - Add validation for empty commands
    - POST to /api/nodes/:id/command on submit
    - Display execution results with stdout, stderr, exit code
    - Show command whitelist errors clearly
    - _Requirements: 2.3, 4.3, 4.4, 9.2, 9.3_
  
  - [ ] 9.4 Implement task execution form
    - Fetch available tasks from /api/tasks
    - Create dropdown to select task
    - Dynamically generate parameter inputs based on task definition
    - POST to /api/nodes/:id/task with task name and parameters
    - Display task execution results
    - _Requirements: 2.4, 5.1, 5.2, 5.5_
  
  - [ ] 9.5 Display execution history for node
    - Fetch executions filtered by node ID from /api/executions
    - Display recent executions with status and timestamp
    - Link to full execution details
    - _Requirements: 2.5_

- [ ] 10. Implement Executions page component
  - [ ] 10.1 Create ExecutionsPage component with data fetching
    - Fetch executions from /api/executions with pagination
    - Display loading state and handle errors
    - _Requirements: 6.1, 9.2_
  
  - [ ] 10.2 Implement execution list display
    - Render paginated execution list (50 per page)
    - Display execution type, targets, action, status, timestamp
    - Show status with color-coded badges
    - _Requirements: 6.1, 6.3_
  
  - [ ] 10.3 Add filtering controls
    - Implement date range filter
    - Add status filter (all, success, failed, running)
    - Add target node filter
    - Update API request with filter parameters
    - _Requirements: 6.5_
  
  - [ ] 10.4 Implement execution detail view
    - Create modal or detail panel for execution details
    - Display per-node results with stdout/stderr
    - Show execution summary (duration, success/failure counts)
    - _Requirements: 6.4_
  
  - [ ] 10.5 Add summary statistics
    - Fetch execution counts by status
    - Display summary cards at top of page
    - _Requirements: 6.3_

- [ ] 11. Implement shared UI components
  - Create CommandOutput component for formatted stdout/stderr display
  - Create FactsViewer component with collapsible JSON tree
  - Implement StatusBadge with color coding (success=green, failed=red, running=blue)
  - Create ErrorAlert component with retry button support
  - Implement LoadingSpinner component
  - _Requirements: 8.4, 9.2, 9.4_

- [ ] 12. Implement error handling and user feedback
  - Add error boundary components for graceful error handling
  - Implement toast notifications for success/error messages
  - Add retry logic for failed API requests
  - Display actionable error messages with guidance
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

- [ ] 13. Create Docker container configuration
  - [ ] 13.1 Write Dockerfile with multi-stage build
    - Stage 1: Build frontend with Vite
    - Stage 2: Build backend TypeScript
    - Stage 3: Production image with Node.js and Bolt CLI
    - _Requirements: 7.1_
  
  - [ ] 13.2 Configure container runtime
    - Set up volume mounts for Bolt project and database
    - Configure environment variables
    - Expose port 3000
    - Run as non-root user
    - _Requirements: 7.1, 7.2_
  
  - [ ] 13.3 Create docker-compose.yml for local development
    - Define service with volume mounts
    - Set environment variables
    - Configure port mapping
    - _Requirements: 7.1_

- [ ] 14. Create API documentation
  - Write OpenAPI 3.0 specification for all endpoints
  - Document request/response schemas
  - Include error response examples
  - Add authentication placeholders for future versions
  - _Requirements: 10.1, 10.2, 10.3, 10.4_

- [ ] 15. Implement performance optimizations
  - Add inventory caching with 30-second TTL
  - Implement facts caching per node (5-minute TTL)
  - Add database indexes for execution queries
  - Configure concurrent execution limit (default: 5)
  - _Requirements: 1.2, 8.1, 8.2, 8.3_

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

- [ ] 18. Create project documentation
  - Write README with setup instructions
  - Document environment variables and configuration options
  - Create user guide for command whitelist configuration
  - Add troubleshooting section for common issues
  - Document Bolt project requirements (inventory format, etc.)
  - _Requirements: 7.1, 7.4, 7.5_
