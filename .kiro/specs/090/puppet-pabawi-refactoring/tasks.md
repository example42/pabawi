# Implementation Plan: Puppet-Pabawi Refactoring

## Overview

This implementation plan refactors the puppet-pabawi module to introduce a consistent settings hash pattern across all integration classes, add SSH integration support, and relocate command whitelist parameters to the classes that actually use them. The refactoring separates Pabawi application configuration (written to .env file) from Puppet infrastructure management (package installation, file deployment, git repository cloning).

## Tasks

- [ ] 1. Create SSH integration class
  - [x] 1.1 Implement manifests/integrations/ssh.pp with settings hash pattern
    - Create class with enabled and settings parameters
    - Implement concat fragment for .env file with SSH_ prefix
    - Use concat fragment order 25
    - Write SSH_ENABLED when enabled is true
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_
  
  - [ ]* 1.2 Write unit tests for SSH integration
    - Test class parameter interface
    - Test concat fragment creation and ordering
    - Test SSH_ENABLED environment variable
    - Test settings hash prefix application
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_
  
  - [ ]* 1.3 Write property test for SSH settings transformation
    - **Property 1: Settings Hash to Environment Variable Transformation**
    - **Property 2: Settings Hash Prefix Application**
    - **Validates: Requirements 1.5, 9.1, 9.2, 9.3, 9.4, 9.5**

- [ ] 2. Refactor Ansible integration class
  - [x] 2.1 Update manifests/integrations/ansible.pp with settings hash pattern
    - Add settings hash parameter
    - Rename source parameters (inventory_source, playbook_source)
    - Implement git repository cloning with vcsrepo
    - Create parent directory exec resources before vcsrepo
    - Update concat fragment to use settings hash with ANSIBLE_ prefix
    - Maintain concat fragment order 24
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10_
  
  - [ ]* 2.2 Write unit tests for Ansible integration
    - Test settings hash parameter interface
    - Test git repository cloning with inventory_source and playbook_source
    - Test parent directory creation
    - Test concat fragment with ANSIBLE_ prefix
    - Test manage_package parameter
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10_
  
  - [ ]* 2.3 Write property tests for Ansible integration
    - **Property 3: Git Repository Cloning with Source Parameters**
    - **Property 4: Git Repository Resource Dependencies**
    - **Validates: Requirements 3.7, 3.8, 10.1, 10.2, 10.3, 10.4, 10.5**

- [ ] 3. Refactor Bolt integration class
  - [x] 3.1 Update manifests/integrations/bolt.pp with settings hash pattern
    - Add settings hash parameter
    - Remove command_whitelist and command_whitelist_allow_all parameters
    - Rename project_path_source parameter
    - Implement git repository cloning with vcsrepo
    - Create parent directory exec resource before vcsrepo
    - Update concat fragment to use settings hash with BOLT_ prefix
    - Maintain concat fragment order 20
    - _Requirements: 2.1, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8_
  
  - [ ]* 3.2 Write unit tests for Bolt integration
    - Test settings hash parameter interface
    - Test git repository cloning with project_path_source
    - Test parent directory creation
    - Test concat fragment with BOLT_ prefix
    - Verify command_whitelist parameters are removed
    - _Requirements: 2.1, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8_
  
  - [ ]* 3.3 Write property tests for Bolt integration
    - **Property 3: Git Repository Cloning with Source Parameters**
    - **Property 4: Git Repository Resource Dependencies**
    - **Validates: Requirements 4.6, 10.1, 10.2, 10.3, 10.4, 10.5**

- [ ] 4. Refactor Hiera integration class
  - [x] 4.1 Update manifests/integrations/hiera.pp with settings hash pattern
    - Add settings hash parameter
    - Rename control_repo_source parameter
    - Implement git repository cloning with vcsrepo
    - Create parent directory exec resource before vcsrepo
    - Update concat fragment to use settings hash with HIERA_ prefix
    - Maintain concat fragment order 23
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8_
  
  - [ ]* 4.2 Write unit tests for Hiera integration
    - Test settings hash parameter interface
    - Test git repository cloning with control_repo_source
    - Test parent directory creation
    - Test concat fragment with HIERA_ prefix
    - Test array settings transformation (environments)
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8_
  
  - [ ]* 4.3 Write property tests for Hiera integration
    - **Property 3: Git Repository Cloning with Source Parameters**
    - **Property 4: Git Repository Resource Dependencies**
    - **Validates: Requirements 5.6, 10.1, 10.2, 10.3, 10.4, 10.5**

- [x] 5. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Refactor PuppetDB integration class
  - [x] 6.1 Update manifests/integrations/puppetdb.pp with settings hash pattern
    - Add settings hash parameter
    - Add ssl_ca_source, ssl_cert_source, ssl_key_source parameters
    - Implement SSL certificate deployment with file resources
    - Support file://, https://, and local path formats for SSL sources
    - Update concat fragment to use settings hash with PUPPETDB_ prefix
    - Maintain concat fragment order 21
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10_
  
  - [ ]* 6.2 Write unit tests for PuppetDB integration
    - Test settings hash parameter interface
    - Test SSL certificate deployment with various source formats
    - Test file permissions (0644 for ca/cert, 0600 for key)
    - Test concat fragment with PUPPETDB_ prefix
    - Test boolean settings transformation (ssl_enabled, ssl_reject_unauthorized)
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10_
  
  - [ ]* 6.3 Write property tests for PuppetDB integration
    - **Property 5: SSL Certificate Deployment**
    - **Property 6: SSL Certificate File Permissions**
    - **Validates: Requirements 6.7, 6.8**

- [ ] 7. Refactor PuppetServer integration class
  - [x] 7.1 Update manifests/integrations/puppetserver.pp with settings hash pattern
    - Add settings hash parameter
    - Add ssl_ca_source, ssl_cert_source, ssl_key_source parameters
    - Implement SSL certificate deployment with file resources
    - Support file://, https://, and local path formats for SSL sources
    - Update concat fragment to use settings hash with PUPPETSERVER_ prefix
    - Maintain concat fragment order 22
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9, 7.10_
  
  - [ ]* 7.2 Write unit tests for PuppetServer integration
    - Test settings hash parameter interface
    - Test SSL certificate deployment with various source formats
    - Test file permissions (0644 for ca/cert, 0600 for key)
    - Test concat fragment with PUPPETSERVER_ prefix
    - Test integer settings transformation (timeouts, thresholds)
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9, 7.10_
  
  - [ ]* 7.3 Write property tests for PuppetServer integration
    - **Property 5: SSL Certificate Deployment**
    - **Property 6: SSL Certificate File Permissions**
    - **Validates: Requirements 7.7, 7.8**

- [ ] 8. Update Docker class with command whitelist parameters
  - [x] 8.1 Update manifests/install/docker.pp to add command whitelist parameters
    - Add command_whitelist Array parameter with default empty array
    - Add command_whitelist_allow_all Boolean parameter with default false
    - Update concat fragment to write COMMAND_WHITELIST as JSON array
    - Update concat fragment to write COMMAND_WHITELIST_ALLOW_ALL as boolean
    - Maintain concat fragment order 10
    - _Requirements: 2.2, 2.3, 2.6, 2.7_
  
  - [ ]* 8.2 Write unit tests for Docker class command whitelist
    - Test command_whitelist parameter interface
    - Test command_whitelist_allow_all parameter interface
    - Test COMMAND_WHITELIST JSON array transformation
    - Test COMMAND_WHITELIST_ALLOW_ALL boolean transformation
    - _Requirements: 2.2, 2.3, 2.6, 2.7_
  
  - [ ]* 8.3 Write property test for command whitelist transformation
    - **Property 1: Settings Hash to Environment Variable Transformation**
    - **Validates: Requirements 2.6, 2.7, 9.1, 9.2**

- [ ] 9. Update Nginx class with command whitelist parameters
  - [x] 9.1 Update manifests/proxy/nginx.pp to add command whitelist parameters
    - Add command_whitelist Array parameter with default empty array
    - Add command_whitelist_allow_all Boolean parameter with default false
    - Update nginx configuration template to use command whitelist
    - _Requirements: 2.4, 2.5, 2.8_
  
  - [ ]* 9.2 Write unit tests for Nginx class command whitelist
    - Test command_whitelist parameter interface
    - Test command_whitelist_allow_all parameter interface
    - Test nginx configuration template includes whitelist
    - _Requirements: 2.4, 2.5, 2.8_

- [x] 10. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 11. Implement settings validation across all integration classes
  - [x] 11.1 Add validation logic to all integration classes
    - Implement validation for required settings when enabled is true
    - Implement source-path consistency validation
    - Implement SSL configuration validation (all three SSL sources together)
    - Generate descriptive error messages with integration name and setting key
    - Ensure validation occurs before resource creation
    - _Requirements: 8.1, 8.2, 8.3, 8.4_
  
  - [ ]* 11.2 Write unit tests for settings validation
    - Test validation errors for missing required settings
    - Test error message format includes integration name and setting key
    - Test validation occurs before resource creation
    - Test source-path consistency validation
    - Test SSL configuration validation
    - _Requirements: 8.1, 8.2, 8.3, 8.4_
  
  - [ ]* 11.3 Write property test for validation error messages
    - **Property 7: Settings Validation with Descriptive Errors**
    - **Validates: Requirements 8.1, 8.2, 8.3, 8.4**

- [ ] 12. Implement universal property tests for all integrations
  - [ ]* 12.1 Write property test for enabled parameter behavior
    - **Property 8: Enabled Integration Environment Variable**
    - Test across all integration classes (SSH, Ansible, Bolt, Hiera, PuppetDB, PuppetServer)
    - **Validates: Requirements 1.4, 3.5, 4.4, 5.4, 6.5, 7.5**
  
  - [ ]* 12.2 Write property test for concat fragment ordering
    - **Property 9: Concat Fragment Ordering Consistency**
    - Test all integration classes use correct order numbers
    - **Validates: Requirements 1.6, 3.10, 4.8, 5.8, 6.10, 7.10**
  
  - [ ]* 12.3 Write property test for settings hash transformation across all integrations
    - **Property 1: Settings Hash to Environment Variable Transformation**
    - **Property 2: Settings Hash Prefix Application**
    - Test with various data types (String, Integer, Boolean, Array, undef)
    - Test across all integration classes
    - **Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5**

- [x] 13. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at reasonable breaks
- Property tests validate universal correctness properties across all integrations
- Unit tests validate specific examples, edge cases, and integration-specific behavior
- All integration classes follow the same settings hash pattern for consistency
- Git repository cloning requires parent directory creation first (Property 4)
- SSL certificate deployment supports multiple source formats (Property 5)
- Settings hash values are transformed based on type when written to .env (Property 1)
