# Implementation Plan: SSH Integration

## Overview

This implementation plan breaks down the SSH integration feature into discrete coding tasks. The implementation follows a bottom-up approach, starting with core utilities and data models, then building the connection and execution layers, and finally integrating with Pabawi's plugin architecture. Each task builds incrementally, with checkpoints to validate functionality before proceeding.

## Tasks

- [x] 1. Set up project structure and core types
  - Create directory structure: `backend/src/integrations/ssh/`
  - Define TypeScript interfaces and types in `types.ts`
  - Set up test directory structure with unit and property test files
  - Install dependencies: `ssh2`, `@types/ssh2`, `fast-check`
  - _Requirements: 1.1, 2.5, 3.2, 10.1-10.11_

- [x] 2. Implement configuration management
  - [x] 2.1 Create configuration parser for environment variables
    - Parse all SSH_* environment variables
    - Apply default values for optional configuration
    - Validate required configuration values
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9, 10.10, 10.11_
  
  - [x]* 2.2 Write property test for configuration parsing
    - **Property 2: Configuration Parsing Completeness**
    - **Validates: Requirements 10.1-10.10**
  
  - [x]* 2.3 Write property test for configuration validation
    - **Property 3: Configuration Validation Failure**
    - **Validates: Requirements 10.11**
  
  - [x]* 2.4 Write unit tests for configuration edge cases
    - Test missing required values
    - Test invalid timeout ranges
    - Test default value application
    - _Requirements: 10.11_

- [x] 3. Implement PackageManagerDetector
  - [x] 3.1 Create PackageManagerDetector class with detection methods
    - Implement detection for apt, yum, dnf, zypper, pacman
    - Implement command generation for install/remove/update operations
    - Add caching for detection results per host
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.9_
  
  - [ ]* 3.2 Write property test for package manager command generation
    - **Property 13: Package Manager Command Generation**
    - **Validates: Requirements 7.2, 7.9**
  
  - [ ]* 3.3 Write property test for unsupported package manager error
    - **Property 14: Unsupported Package Manager Error**
    - **Validates: Requirements 7.10**
  
  - [ ]* 3.4 Write unit tests for each package manager
    - Test command generation for apt, yum, dnf, zypper, pacman
    - Test detection logic for each package manager
    - _Requirements: 7.3, 7.4, 7.5, 7.6, 7.7_

- [x] 4. Implement ConnectionPool
  - [x] 4.1 Create ConnectionPool class with connection lifecycle management
    - Implement acquire/release/remove methods
    - Implement LRU eviction when pool reaches max size
    - Implement idle connection cleanup with periodic interval
    - Add connection health monitoring
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_
  
  - [ ]* 4.2 Write property test for connection reuse
    - **Property 6: Connection Reuse**
    - **Validates: Requirements 4.2**
  
  - [ ]* 4.3 Write property test for pool size limit
    - **Property 7: Connection Pool Size Limit**
    - **Validates: Requirements 4.5, 4.6**
  
  - [ ]* 4.4 Write property test for connection pool error handling
    - **Property 8: Connection Pool Error Handling**
    - **Validates: Requirements 4.7**
  
  - [ ]* 4.5 Write unit tests for connection pool operations
    - Test connection acquisition and release
    - Test idle timeout cleanup
    - Test max connections per host limit
    - _Requirements: 4.3, 4.4_

- [x] 5. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement SSHService core functionality
  - [x] 6.1 Create SSHService class with connection management
    - Implement connect/disconnect/testConnection methods
    - Integrate with ConnectionPool for connection reuse
    - Implement SSH authentication (key-based and password)
    - Add host key verification logic
    - Handle connection timeouts and errors
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 13.1, 13.2, 13.3, 13.5, 13.6_
  
  - [ ]* 6.2 Write property test for timeout configuration bounds
    - **Property 9: Timeout Configuration Bounds**
    - **Validates: Requirements 3.6, 5.5**
  
  - [ ]* 6.3 Write unit tests for connection establishment
    - Test key-based authentication
    - Test password authentication
    - Test host key verification
    - Test connection timeout handling
    - _Requirements: 3.2, 3.3, 3.4, 3.6, 3.7_

- [x] 7. Implement command execution in SSHService
  - [x] 7.1 Implement executeCommand method
    - Execute commands via SSH connection
    - Capture stdout, stderr, and exit code
    - Implement command timeout enforcement
    - Record execution timing (start, end, duration)
    - Return CommandResult with all required fields
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.8, 5.9_
  
  - [ ]* 7.2 Write property test for timeout enforcement
    - **Property 10: Timeout Enforcement**
    - **Validates: Requirements 5.6**
  
  - [ ]* 7.3 Write property test for execution result completeness
    - **Property 11: Execution Result Completeness**
    - **Validates: Requirements 5.8, 5.9, 14.2, 14.3**
  
  - [ ]* 7.4 Write unit tests for command execution
    - Test stdout/stderr capture
    - Test exit code handling
    - Test command timeout
    - Test execution timing
    - _Requirements: 5.2, 5.3, 5.4, 5.5, 5.8_

- [x] 8. Implement privilege escalation in SSHService
  - [x] 8.1 Implement sudo command wrapping
    - Create wrapWithSudo method
    - Support configurable sudo command prefix
    - Support run-as user configuration
    - Handle passwordless and password-based sudo
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_
  
  - [ ]* 8.2 Write property test for sudo command wrapping
    - **Property 12: Sudo Command Wrapping**
    - **Validates: Requirements 6.1, 6.2, 6.5**
  
  - [ ]* 8.3 Write unit tests for privilege escalation
    - Test sudo command generation
    - Test run-as user flag
    - Test sudo error handling
    - _Requirements: 6.2, 6.5, 6.6_

- [x] 9. Implement package management in SSHService
  - [x] 9.1 Implement package management methods
    - Implement installPackage, removePackage, updatePackage methods
    - Integrate with PackageManagerDetector
    - Use detected package manager for command generation
    - Return CommandResult for each operation
    - _Requirements: 7.1, 7.2, 7.8, 7.9, 7.10_
  
  - [ ]* 9.2 Write unit tests for package operations
    - Test package installation
    - Test package removal
    - Test package update
    - Test unsupported package manager error
    - _Requirements: 7.8, 7.9, 7.10_

- [x] 10. Implement concurrent execution in SSHService
  - [x] 10.1 Implement executeOnMultipleHosts method
    - Execute commands in parallel across multiple hosts
    - Implement configurable concurrency limit
    - Queue commands when limit is reached
    - Return individual results for each host
    - Continue execution on remaining hosts if one fails
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_
  
  - [ ]* 10.2 Write property test for concurrent execution limit
    - **Property 18: Concurrent Execution Limit**
    - **Validates: Requirements 12.2, 12.3**
  
  - [ ]* 10.3 Write property test for parallel execution independence
    - **Property 19: Parallel Execution Independence**
    - **Validates: Requirements 12.4, 12.5**
  
  - [ ]* 10.4 Write unit tests for concurrent execution
    - Test parallel execution across multiple hosts
    - Test concurrency limit enforcement
    - Test command queuing
    - Test failure isolation
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_

- [x] 11. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Implement SSH config file management in SSHPlugin
  - [x] 12.1 Create SSH config file parser
    - Implement parseSSHConfig for OpenSSH config format
    - Parse Host directives with HostName, User, Port, IdentityFile keywords
    - Extract host aliases from Host patterns
    - Parse custom group metadata from comments (# Groups: group1,group2)
    - Handle syntax errors gracefully
    - _Requirements: 2.1, 2.2, 2.3, 2.5, 2.6, 2.7_
  
  - [ ]* 12.2 Write property test for SSH config file round trip
    - **Property 1: SSH Config File Round Trip**
    - **Validates: Requirements 2.2, 2.3, 2.5**
  
  - [ ]* 12.3 Write property test for SSH config file error recovery
    - **Property 5: SSH Config File Error Recovery**
    - **Validates: Requirements 2.7**
  
  - [ ]* 12.4 Write unit tests for SSH config parsing
    - Test Host directive parsing
    - Test keyword parsing (HostName, User, Port, IdentityFile)
    - Test host alias extraction
    - Test group metadata parsing from comments
    - Test syntax error handling
    - _Requirements: 2.2, 2.3, 2.6, 2.7_

- [x] 13. Implement SSH config file watching in SSHPlugin
  - [x] 13.1 Implement SSH config file watching
    - Use fs.watch() to monitor SSH config file changes
    - Implement debouncing (1 second) to avoid multiple reloads
    - Reload configuration on file modification
    - Maintain last valid configuration on parse errors
    - Log reload events
    - _Requirements: 2.4, 2.7_
  
  - [ ]* 13.2 Write unit tests for SSH config file watching
    - Test file modification detection
    - Test debouncing behavior
    - Test error recovery
    - _Requirements: 2.4, 2.7_

- [x] 14. Implement SSHPlugin core functionality
  - [x] 14.1 Create SSHPlugin class extending BasePlugin
    - Implement constructor with dependency injection
    - Implement performInitialization method
    - Load configuration from environment variables
    - Initialize SSHService with configuration
    - Load SSH config from configured path
    - Start SSH config file watching
    - Validate configuration and set initialized flag
    - _Requirements: 1.1, 1.5, 10.11_
  
  - [ ]* 14.2 Write unit tests for plugin initialization
    - Test successful initialization
    - Test initialization failure with missing config
    - Test SSH config loading
    - _Requirements: 1.5, 10.11_

- [x] 15. Implement ExecutionToolPlugin interface in SSHPlugin
  - [x] 15.1 Implement executeAction method
    - Parse action parameters (host, command, options)
    - Route to SSHService.executeCommand or executeOnMultipleHosts
    - Convert CommandResult to ExecutionResult format
    - Include tool name "ssh" in result
    - Support re-execution from execution history
    - _Requirements: 5.9, 14.1, 14.2, 14.3, 14.4, 14.5_
  
  - [x] 15.2 Implement listCapabilities method
    - Return list of supported capabilities
    - Include command execution, package management, concurrent execution
    - _Requirements: 1.2_
  
  - [ ]* 15.3 Write property test for execution result re-execution
    - **Property 22: Execution Result Re-execution**
    - **Validates: Requirements 14.4, 14.5**
  
  - [ ]* 15.4 Write unit tests for executeAction
    - Test single host execution
    - Test multiple host execution
    - Test result format conversion
    - Test re-execution from history
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5_

- [x] 16. Implement InformationSourcePlugin interface in SSHPlugin
  - [x] 16.1 Implement getInventory method
    - Return all hosts from loaded inventory
    - Tag each node with source "ssh"
    - Include all required properties: name, uri, alias, groups, connection_parameters
    - _Requirements: 8.1, 8.2, 8.3, 8.5_
  
  - [x] 16.2 Implement getNodeFacts and getNodeData methods
    - Implement placeholder methods for future extension
    - Return empty facts and null data for now
    - _Requirements: 8.4_
  
  - [ ]* 16.3 Write property test for inventory source attribution
    - **Property 15: Inventory Source Attribution**
    - **Validates: Requirements 8.2, 8.3, 8.5**
  
  - [ ]* 16.4 Write unit tests for inventory methods
    - Test getInventory returns all hosts
    - Test source tagging
    - Test property inclusion
    - _Requirements: 8.1, 8.2, 8.3_

- [x] 17. Implement health check in SSHPlugin
  - [x] 17.1 Implement performHealthCheck method
    - Verify inventory file accessibility
    - Test SSH connections to subset of hosts
    - Determine status: healthy (all succeed), degraded (some fail), unhealthy (none succeed)
    - Complete within 30 seconds
    - Cache results according to TTL
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7_
  
  - [ ]* 17.2 Write property test for health status determination
    - **Property 16: Health Status Determination**
    - **Validates: Requirements 9.3, 9.4, 9.5**
  
  - [ ]* 17.3 Write property test for health check caching
    - **Property 17: Health Check Caching**
    - **Validates: Requirements 9.7**
  
  - [ ]* 17.4 Write unit tests for health check
    - Test healthy status
    - Test degraded status
    - Test unhealthy status
    - Test timeout enforcement
    - _Requirements: 9.3, 9.4, 9.5, 9.6_

- [x] 18. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 19. Implement error handling and logging
  - [x] 19.1 Add comprehensive error handling
    - Handle connection errors with detailed messages
    - Handle command execution errors
    - Handle configuration errors
    - Handle resource errors (pool exhausted)
    - Format error results consistently
    - _Requirements: 11.1, 11.2, 11.3, 11.6_
  
  - [x] 19.2 Add structured logging throughout
    - Log plugin initialization events
    - Log inventory reload events
    - Log connection pool operations (debug level)
    - Log command executions
    - Log all errors with context
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_
  
  - [x] 19.3 Implement sensitive data obfuscation
    - Obfuscate passwords in logs
    - Obfuscate private keys in logs
    - Replace with "[REDACTED]" or "[PRIVATE_KEY]" placeholders
    - _Requirements: 11.7, 13.7_
  
  - [ ]* 19.4 Write property test for sensitive data obfuscation
    - **Property 20: Sensitive Data Obfuscation**
    - **Validates: Requirements 11.7, 13.7**
  
  - [ ]* 19.5 Write unit tests for error handling
    - Test connection error formatting
    - Test command error formatting
    - Test configuration error handling
    - _Requirements: 11.1, 11.2, 11.6_

- [x] 20. Implement security features
  - [x] 20.1 Add private key permission validation
    - Check file permissions on private key files
    - Log warning if permissions are more permissive than 0600
    - _Requirements: 13.3, 13.4_
  
  - [x] 20.2 Implement host key verification
    - Validate host fingerprints against known_hosts
    - Support disabling verification via configuration
    - _Requirements: 3.4, 3.5, 13.6_
  
  - [x] 20.3 Add command injection protection
    - Validate and sanitize command inputs
    - Escape special characters appropriately
    - _Requirements: 13.7_
  
  - [ ]* 20.4 Write property test for private key permission validation
    - **Property 21: Private Key Permission Validation**
    - **Validates: Requirements 13.3**
  
  - [ ]* 20.5 Write unit tests for security features
    - Test private key permission checks
    - Test host key verification
    - Test command sanitization
    - _Requirements: 13.3, 13.4, 13.6_

- [x] 21. Implement plugin registration with IntegrationManager
  - [x] 21.1 Register SSHPlugin with IntegrationManager
    - Register as ExecutionToolPlugin
    - Register as InformationSourcePlugin
    - Set configurable priority value
    - Support enable/disable via SSH_ENABLED environment variable
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_
  
  - [ ]* 21.2 Write property test for priority-based deduplication
    - **Property 4: Priority-Based Deduplication**
    - **Validates: Requirements 1.4**
  
  - [ ]* 21.3 Write unit tests for plugin registration
    - Test registration in both maps
    - Test priority configuration
    - Test enable/disable functionality
    - _Requirements: 1.3, 1.4, 1.5_

- [ ] 22. Create integration tests
  - [ ]* 22.1 Set up Docker test environment
    - Create Dockerfile for SSH test server
    - Configure SSH server with test users and keys
    - Set up multiple Linux distributions for package manager testing
  
  - [ ]* 22.2 Write integration tests for SSH execution
    - Test real SSH connections
    - Test command execution with real output
    - Test connection pooling with real connections
    - Test concurrent execution across multiple containers
  
  - [ ]* 22.3 Write integration tests for package management
    - Test package manager detection on different distributions
    - Test package installation/removal/update operations
    - Test sudo execution with real privilege escalation
  
  - [ ]* 22.4 Write integration tests for SSH config loading
    - Test SSH config file watching with real file system
    - Test configuration reload on file modification
    - Test error recovery with invalid files

- [x] 23. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 24. Create documentation and examples
  - [x] 24.1 Create README for SSH integration
    - Document configuration options
    - Provide SSH config file examples
    - Include usage examples
    - Document security best practices
    - _Requirements: All_
  
  - [x] 24.2 Add inline code documentation
    - Document all public methods with JSDoc comments
    - Include parameter descriptions and return types
    - Add usage examples in comments
    - _Requirements: All_

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at key milestones
- Property tests validate universal correctness properties from the design
- Unit tests validate specific examples and edge cases
- Integration tests verify actual SSH functionality with real connections
- The implementation uses TypeScript with the ssh2 library
- All sensitive data (passwords, private keys) must be obfuscated in logs
- Connection pooling is critical for performance with multiple hosts
- Security features (host key verification, permission checks) should be enabled by default
