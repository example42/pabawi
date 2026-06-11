# Requirements Document

## Introduction

This document defines the requirements for Pabawi v0.4.0's Hiera and Local Puppet Codebase Integration feature. This integration enables users to configure a local Puppet control repository directory, providing deep visibility into Hiera data, key resolution, and static code analysis capabilities. The feature integrates seamlessly with existing PuppetDB integration for fact retrieval while supporting standalone operation with local fact files.

## Glossary

- **Hiera**: Puppet's built-in key-value configuration data lookup system
- **Control_Repository**: A Git repository containing Puppet code, modules, and Hiera data
- **Hieradata**: YAML/JSON files containing configuration data organized by hierarchy levels
- **Hiera_Level**: A layer in the Hiera hierarchy (e.g., node-specific, environment, common)
- **Lookup_Method**: Hiera data retrieval strategy (first, unique, hash, deep)
- **Lookup_Options**: Per-key configuration defining merge behavior and lookup strategy
- **Fact**: A piece of system information collected by Puppet agent
- **Catalog**: Compiled Puppet configuration for a specific node
- **Puppetfile**: File defining external modules and their versions
- **Integration_Manager**: Pabawi's system for managing external service connections
- **Expert_Mode**: Advanced UI mode showing additional technical details

## Requirements

### Requirement 1: Control Repository Configuration

**User Story:** As a Puppet administrator, I want to configure a local control repository directory, so that Pabawi can analyze my Puppet codebase and Hiera data.

#### Acceptance Criteria

1. THE Configuration_Service SHALL accept a filesystem path to a Puppet control repository
2. WHEN a control repository path is configured, THE Configuration_Service SHALL validate the directory contains expected Puppet structure (hiera.yaml, hieradata directory, manifests)
3. IF the configured path does not exist or is inaccessible, THEN THE Configuration_Service SHALL return a descriptive error message
4. WHEN the control repository is valid, THE Integration_Manager SHALL register the Hiera integration as available
5. THE Configuration_Service SHALL support configuring multiple environment directories within the control repository
6. WHEN configuration changes, THE Hiera_Service SHALL reload the control repository data without requiring application restart

### Requirement 2: Hiera Configuration Parsing

**User Story:** As a Puppet administrator, I want Pabawi to parse my hiera.yaml configuration, so that it understands my hierarchy structure and lookup behavior.

#### Acceptance Criteria

1. THE Hiera_Parser SHALL parse hiera.yaml files in Hiera 5 format
2. WHEN parsing hiera.yaml, THE Hiera_Parser SHALL extract all hierarchy levels with their paths and data providers
3. THE Hiera_Parser SHALL support yaml, json, and eyaml data backends
4. WHEN lookup_options are defined in hieradata, THE Hiera_Parser SHALL extract and apply them during lookups
5. IF hiera.yaml contains syntax errors, THEN THE Hiera_Parser SHALL return a descriptive error with line number
6. THE Hiera_Parser SHALL support variable interpolation in hierarchy paths using facts and other variables

### Requirement 3: Fact Source Configuration

**User Story:** As a Puppet administrator, I want to configure how facts are retrieved for Hiera resolution, so that I can use PuppetDB or local fact files.

#### Acceptance Criteria

1. WHEN PuppetDB integration is available, THE Fact_Service SHALL retrieve node facts from PuppetDB by default
2. THE Configuration_Service SHALL accept a filesystem path to a directory containing local fact files
3. WHEN local fact files are configured, THE Fact_Service SHALL parse JSON files named by node hostname
4. THE Fact_Service SHALL support the Puppetserver fact file format with "name" and "values" structure
5. IF both PuppetDB and local facts are available for a node, THE Fact_Service SHALL prefer PuppetDB facts
6. IF facts cannot be retrieved for a node, THEN THE Fact_Service SHALL return an empty fact set with a warning

### Requirement 4: Hiera Key Discovery

**User Story:** As a Puppet administrator, I want to see all Hiera keys present in my hieradata, so that I can understand what configuration data is available.

#### Acceptance Criteria

1. THE Hiera_Scanner SHALL recursively scan all hieradata files and extract unique keys
2. WHEN scanning hieradata, THE Hiera_Scanner SHALL track which file and hierarchy level each key appears in
3. THE Hiera_Scanner SHALL support nested keys using dot notation (e.g., "profile::nginx::port")
4. WHEN a key appears in multiple hierarchy levels, THE Hiera_Scanner SHALL list all occurrences with their values
5. THE Hiera_Scanner SHALL provide a searchable index of all discovered keys
6. WHEN hieradata files change, THE Hiera_Scanner SHALL update the key index

### Requirement 5: Hiera Key Resolution

**User Story:** As a Puppet administrator, I want to resolve Hiera keys for specific nodes, so that I can see the actual values that would be used during Puppet runs.

#### Acceptance Criteria

1. THE Hiera_Resolver SHALL resolve key values using the configured hierarchy and node facts
2. WHEN resolving a key, THE Hiera_Resolver SHALL apply the appropriate lookup method (first, unique, hash, deep)
3. THE Hiera_Resolver SHALL honor lookup_options defined in hieradata for merge behavior
4. WHEN resolving, THE Hiera_Resolver SHALL track which hierarchy level provided the final value
5. THE Hiera_Resolver SHALL support variable interpolation in values using facts
6. IF a key cannot be resolved, THEN THE Hiera_Resolver SHALL indicate no value found

### Requirement 6: Node Hiera Tab

**User Story:** As a Puppet administrator, I want a Hiera tab in the node detail view, so that I can see all Hiera data relevant to a specific node.

#### Acceptance Criteria

1. WHEN viewing a node, THE Node_Detail_Page SHALL display a Hiera tab
2. THE Hiera_Tab SHALL display a searchable list of all Hiera keys
3. WHEN displaying a key, THE Hiera_Tab SHALL show values from each hierarchy level where the key exists
4. THE Hiera_Tab SHALL highlight the resolved value that would be used for the node
5. WHEN a key is used by classes included on the node, THE Hiera_Tab SHALL indicate this with visual highlighting
6. THE Hiera_Tab SHALL support filtering keys by usage status (used/unused by node classes)
7. WHEN Expert_Mode is enabled, THE Hiera_Tab SHALL show additional resolution details including lookup method and source file paths

### Requirement 7: Global Hiera Search Tab

**User Story:** As a Puppet administrator, I want a global Hiera tab in the Puppet page, so that I can search for any key and see its value across all nodes.

#### Acceptance Criteria

1. THE Puppet_Page SHALL include a Hiera tab for global key search
2. WHEN searching for a key, THE Global_Hiera_Tab SHALL display the resolved value for each node
3. THE Global_Hiera_Tab SHALL show which hieradata file provides the value for each node
4. THE Global_Hiera_Tab SHALL support searching by partial key name
5. WHEN displaying results, THE Global_Hiera_Tab SHALL group nodes by their resolved value
6. THE Global_Hiera_Tab SHALL indicate nodes where the key is not defined

### Requirement 8: Code Analysis - Unused Code Detection

**User Story:** As a Puppet administrator, I want to identify unused code in my control repository, so that I can clean up and maintain my codebase.

#### Acceptance Criteria

1. THE Code_Analyzer SHALL identify classes that are not included by any node
2. THE Code_Analyzer SHALL identify defined types that are not instantiated
3. THE Code_Analyzer SHALL identify Hiera keys that are not referenced in any manifest
4. WHEN displaying unused code, THE Code_Analysis_Page SHALL show the file location and type
5. THE Code_Analyzer SHALL support excluding specific patterns from unused code detection

### Requirement 9: Code Analysis - Puppet Lint Integration

**User Story:** As a Puppet administrator, I want to see Puppet lint and syntax issues, so that I can improve code quality.

#### Acceptance Criteria

1. THE Code_Analyzer SHALL detect Puppet syntax errors in manifests
2. THE Code_Analyzer SHALL identify common Puppet lint issues (style violations, deprecated syntax)
3. WHEN displaying issues, THE Code_Analysis_Page SHALL show severity, file, line number, and description
4. THE Code_Analysis_Page SHALL support filtering issues by severity and type
5. THE Code_Analyzer SHALL provide issue counts grouped by category

### Requirement 10: Code Analysis - Module Updates

**User Story:** As a Puppet administrator, I want to see which modules in my Puppetfile can be updated, so that I can keep dependencies current.

#### Acceptance Criteria

1. THE Code_Analyzer SHALL parse the Puppetfile and extract module dependencies with versions
2. WHEN a module has a newer version available on Puppet Forge, THE Code_Analyzer SHALL indicate the update
3. THE Code_Analysis_Page SHALL display current version and latest available version for each module
4. THE Code_Analysis_Page SHALL indicate modules with security advisories if available
5. IF the Puppetfile cannot be parsed, THEN THE Code_Analyzer SHALL return a descriptive error

### Requirement 11: Code Analysis - Usage Statistics

**User Story:** As a Puppet administrator, I want to see usage statistics for my Puppet code, so that I can understand my codebase composition.

#### Acceptance Criteria

1. THE Code_Analyzer SHALL count and rank classes by usage frequency across nodes
2. THE Code_Analyzer SHALL count total manifests, classes, defined types, and functions
3. THE Code_Analyzer SHALL calculate lines of code and complexity metrics
4. THE Code_Analysis_Page SHALL display statistics in a dashboard format
5. THE Code_Analysis_Page SHALL show most frequently used classes and resources

### Requirement 12: Catalog Compilation Mode

**User Story:** As a Puppet administrator, I want to optionally enable catalog compilation for Hiera resolution, so that I can resolve keys that depend on Puppet code variables.

#### Acceptance Criteria

1. THE Configuration_Service SHALL support a catalog compilation mode setting (enabled/disabled)
2. WHEN catalog compilation is disabled (default), THE Hiera_Resolver SHALL only use facts for variable interpolation
3. WHEN catalog compilation is enabled, THE Hiera_Resolver SHALL attempt to compile a catalog to resolve code-defined variables
4. IF catalog compilation fails, THEN THE Hiera_Resolver SHALL fall back to fact-only resolution with a warning
5. THE Configuration_UI SHALL explain the performance implications of enabling catalog compilation
6. WHEN catalog compilation is enabled, THE Hiera_Resolver SHALL cache compiled catalogs to improve performance

### Requirement 13: Integration Setup and Status

**User Story:** As a Puppet administrator, I want clear setup instructions and status indicators for the Hiera integration, so that I can configure and troubleshoot it easily.

#### Acceptance Criteria

1. THE Integration_Setup_Page SHALL include a Hiera integration section with setup instructions
2. THE Integration_Status_Component SHALL display Hiera integration health (connected, error, not configured)
3. WHEN the integration has errors, THE Integration_Status_Component SHALL display actionable error messages
4. THE Setup_Instructions SHALL include examples for common control repository structures
5. THE Integration_Manager SHALL support enabling/disabling the Hiera integration without removing configuration
6. WHEN Expert_Mode is enabled, THE Integration_Status_Component SHALL show detailed diagnostic information

### Requirement 14: API Endpoints

**User Story:** As a developer, I want REST API endpoints for Hiera and code analysis data, so that I can integrate with other tools.

#### Acceptance Criteria

1. THE API SHALL provide an endpoint to list all discovered Hiera keys
2. THE API SHALL provide an endpoint to resolve a Hiera key for a specific node
3. THE API SHALL provide an endpoint to get Hiera data for a node (all keys with resolved values)
4. THE API SHALL provide an endpoint to get code analysis results
5. THE API SHALL provide an endpoint to get Puppetfile module update information
6. WHEN the integration is not configured, THE API SHALL return appropriate error responses with setup guidance

### Requirement 15: Performance and Caching

**User Story:** As a Puppet administrator, I want the Hiera integration to perform efficiently, so that it doesn't slow down the application.

#### Acceptance Criteria

1. THE Hiera_Service SHALL cache parsed hieradata to avoid repeated file reads
2. THE Hiera_Service SHALL implement file watching to invalidate cache when hieradata changes
3. THE Code_Analyzer SHALL cache analysis results with configurable TTL
4. WHEN scanning large control repositories, THE Hiera_Scanner SHALL provide progress indication
5. THE Hiera_Resolver SHALL cache resolved values per node with appropriate invalidation
6. THE API SHALL support pagination for endpoints returning large result sets
