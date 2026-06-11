# Requirements Document

## Introduction

This document specifies the requirements for adding node group support to Pabawi's inventory system. Pabawi is a unified infrastructure management tool that integrates with multiple backend systems (Bolt, PuppetDB, Puppetserver, and Ansible). Currently, the inventory system displays individual nodes from these sources. This feature will extend the system to also display and manage node groups as first-class entities alongside individual nodes.

## Glossary

- **Inventory_System**: The Pabawi component that aggregates and displays nodes and groups from multiple integration sources
- **Node**: An individual infrastructure target (server, container, etc.) that can be managed through Pabawi
- **Node_Group**: A collection of nodes organized together, defined by an integration source (e.g., Bolt inventory groups, Ansible host groups)
- **Integration_Source**: A backend system that provides inventory data (Bolt, Ansible, PuppetDB, Puppetserver, SSH)
- **Source_Badge**: A visual indicator showing which integration source a node or group originates from
- **Linked_Entity**: A node or group that exists in multiple integration sources
- **IntegrationManager**: The backend service that aggregates data from all integration sources
- **InformationSourcePlugin**: A plugin interface for integration sources that provide inventory data
- **Bolt**: Puppet's agentless orchestration tool that uses inventory.yaml files with group definitions
- **Ansible**: Configuration management tool that uses hosts.yml files with hierarchical group structures
- **PuppetDB**: Puppet's data warehouse that may contain node classifiers or custom groupings
- **SSH_Config**: SSH client configuration file that uses Host patterns and Match directives for implicit grouping
- **Frontend**: The Svelte-based user interface that displays inventory data
- **Backend**: The Express/TypeScript API server that provides inventory data

## Requirements

### Requirement 1: Backend Group Data Model

**User Story:** As a backend developer, I want a standardized group data structure, so that all integration sources can provide group information consistently.

#### Acceptance Criteria

1. THE Backend SHALL define a NodeGroup interface with id, name, source, sources array, linked boolean, and nodes array properties
2. THE NodeGroup interface SHALL include optional metadata properties for group-specific information
3. THE Backend SHALL extend the InformationSourcePlugin interface to include a getGroups method
4. THE Backend SHALL extend the AggregatedInventory interface to include a groups array property

### Requirement 2: Bolt Integration Group Support

**User Story:** As a system administrator using Bolt, I want to see my inventory groups from inventory.yaml, so that I can understand my node organization.

#### Acceptance Criteria

1. WHEN Bolt inventory.yaml contains group definitions, THE Bolt_Integration SHALL parse and extract group information
2. THE Bolt_Integration SHALL return groups with their member node references
3. THE Bolt_Integration SHALL include group metadata such as description and variables when present
4. WHEN a Bolt group contains nested groups, THE Bolt_Integration SHALL represent the hierarchy in the group structure

### Requirement 3: Ansible Integration Group Support

**User Story:** As a system administrator using Ansible, I want to see my host groups from hosts.yml, so that I can view my infrastructure organization.

#### Acceptance Criteria

1. WHEN Ansible hosts.yml contains group definitions, THE Ansible_Integration SHALL parse and extract group information
2. THE Ansible_Integration SHALL return groups with their member node references
3. THE Ansible_Integration SHALL include group_vars as metadata when present
4. WHEN Ansible groups have parent-child relationships, THE Ansible_Integration SHALL represent the hierarchy in the group structure

### Requirement 4: PuppetDB Integration Group Support

**User Story:** As a Puppet administrator, I want to see node classifiers or custom groups from PuppetDB, so that I can view logical node groupings.

#### Acceptance Criteria

1. WHERE PuppetDB contains node classifier groups, THE PuppetDB_Integration SHALL extract and return group information
2. WHERE PuppetDB contains custom node groupings, THE PuppetDB_Integration SHALL extract and return group information
3. THE PuppetDB_Integration SHALL return groups with their member node references based on PuppetDB queries
4. IF PuppetDB does not support groups, THEN THE PuppetDB_Integration SHALL return an empty groups array

### Requirement 5: SSH Integration Group Support

**User Story:** As a system administrator using SSH config, I want to see implicit groups based on Host patterns, so that I can understand my SSH access organization.

#### Acceptance Criteria

1. WHEN SSH config contains Host pattern definitions (e.g., `Host web-prod-*`), THE SSH_Integration SHALL extract and create groups from these patterns
2. THE SSH_Integration SHALL create groups from multi-host patterns (e.g., `Host app-* db-* redis-*`)
3. THE SSH_Integration SHALL include nodes that match each pattern in the corresponding group
4. THE SSH_Integration SHALL create groups based on common naming conventions (e.g., environment suffixes like `-prod-`, `-stg-`, `-dev-`)
5. WHEN SSH config contains Match directives, THE SSH_Integration SHALL create groups from Match Host patterns

### Requirement 6: Integration Manager Group Aggregation

**User Story:** As a backend developer, I want the IntegrationManager to aggregate groups from all sources, so that the API can provide unified group data.

#### Acceptance Criteria

1. WHEN multiple integration sources provide groups, THE IntegrationManager SHALL aggregate all groups into a unified collection
2. WHEN a group with the same name exists in multiple sources, THE IntegrationManager SHALL create a linked group entity with sources array populated
3. THE IntegrationManager SHALL set the linked property to true for groups that exist in multiple sources
4. THE IntegrationManager SHALL deduplicate group member nodes to prevent duplicate references

### Requirement 7: Inventory API Group Endpoint

**User Story:** As a frontend developer, I want the inventory API to return groups alongside nodes, so that I can display both entity types.

#### Acceptance Criteria

1. WHEN GET /api/inventory is called, THE Inventory_API SHALL return both nodes and groups in the response
2. THE Inventory_API SHALL apply source filtering to groups when the sources query parameter is provided
3. THE Inventory_API SHALL support sorting groups by name and source
4. THE Inventory_API SHALL include group count in source metadata

### Requirement 8: Frontend Group Display

**User Story:** As a user, I want to see groups displayed in the inventory page, so that I can understand my infrastructure organization.

#### Acceptance Criteria

1. THE Frontend SHALL display groups in both grid and list view modes
2. THE Frontend SHALL show the source badge for each group
3. WHEN a group is linked across multiple sources, THE Frontend SHALL display all source badges
4. THE Frontend SHALL display the member node count for each group

### Requirement 9: Frontend Group Filtering

**User Story:** As a user, I want to filter groups by source and search by name, so that I can find specific groups quickly.

#### Acceptance Criteria

1. WHEN the source filter is changed, THE Frontend SHALL filter groups to show only those from selected sources
2. WHEN text is entered in the search field, THE Frontend SHALL filter groups by name matching the search query
3. THE Frontend SHALL update the results count to reflect filtered groups and nodes
4. THE Frontend SHALL maintain separate counts for nodes and groups in the display

### Requirement 9: Frontend Group Sorting

**User Story:** As a user, I want to sort groups by name or source, so that I can organize the display according to my preferences.

#### Acceptance Criteria

1. WHEN the sort field is set to name, THE Frontend SHALL sort groups alphabetically by name
2. WHEN the sort field is set to source, THE Frontend SHALL sort groups by source name
3. THE Frontend SHALL support both ascending and descending sort order for groups
4. THE Frontend SHALL sort groups independently from nodes while maintaining visual separation

### Requirement 10: Frontend Group Navigation

**User Story:** As a user, I want to click on a group to see its details, so that I can view member nodes and group metadata.

#### Acceptance Criteria

1. WHEN a group is clicked, THE Frontend SHALL navigate to a group detail page
2. THE Frontend SHALL pass the group ID in the navigation route
3. THE Frontend SHALL display a visual hover state for clickable groups
4. THE Frontend SHALL maintain consistent navigation behavior between nodes and groups

### Requirement 11: Group and Node Unified Display

**User Story:** As a user, I want to see both groups and nodes in the same inventory view, so that I have a complete picture of my infrastructure.

#### Acceptance Criteria

1. THE Frontend SHALL display groups and nodes in the same grid or list view
2. THE Frontend SHALL visually distinguish groups from nodes using icons or labels
3. THE Frontend SHALL display groups before nodes when both are present
4. THE Frontend SHALL maintain consistent styling and interaction patterns for both entity types

### Requirement 12: Empty State Handling

**User Story:** As a user, I want clear messaging when no groups are available, so that I understand the system state.

#### Acceptance Criteria

1. WHEN no groups match the current filters, THE Frontend SHALL display an appropriate empty state message
2. WHEN an integration source does not support groups, THE Frontend SHALL display only nodes without error messages
3. THE Frontend SHALL distinguish between "no groups found" and "no groups or nodes found" states
4. THE Frontend SHALL provide actionable guidance in empty state messages

### Requirement 13: Group Source Badge Display

**User Story:** As a user, I want to always see the source badge for each group, so that I know which integration provides the group.

#### Acceptance Criteria

1. THE Frontend SHALL display a source badge for every group in grid view
2. THE Frontend SHALL display a source badge for every group in list view
3. WHEN a group is linked across multiple sources, THE Frontend SHALL display all applicable source badges
4. THE Frontend SHALL use the same badge styling for groups as for nodes

### Requirement 14: Backend Group Validation

**User Story:** As a backend developer, I want group data to be validated, so that invalid group definitions are rejected.

#### Acceptance Criteria

1. WHEN a group is missing required fields, THE Backend SHALL reject the group and log a warning
2. WHEN a group references non-existent nodes, THE Backend SHALL include the group but log a warning
3. THE Backend SHALL validate that group IDs are unique within each source
4. THE Backend SHALL sanitize group names to prevent injection attacks

### Requirement 15: Performance Optimization

**User Story:** As a user, I want the inventory page to load quickly even with many groups, so that the interface remains responsive.

#### Acceptance Criteria

1. WHEN the inventory contains more than 100 groups, THE Backend SHALL implement pagination or lazy loading
2. THE Frontend SHALL render groups efficiently using virtual scrolling for large lists
3. THE Backend SHALL cache group data with the same TTL as node data
4. THE IntegrationManager SHALL fetch groups in parallel from multiple sources
