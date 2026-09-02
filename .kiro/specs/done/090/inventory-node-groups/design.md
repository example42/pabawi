# Design Document: Inventory Node Groups

## Overview

This design extends Pabawi's inventory system to support node groups as first-class entities alongside individual nodes. The feature enables users to view, filter, and navigate groups from multiple integration sources (Bolt, Ansible, PuppetDB, SSH) in a unified interface.

### Goals

- Add NodeGroup data model to backend with consistent structure across all integration sources
- Extend each integration plugin to extract and provide group information
- Aggregate groups from multiple sources with linking support (similar to nodes)
- Display groups in the frontend inventory page with filtering, sorting, and navigation
- Maintain performance with efficient caching and parallel fetching
- Enable group-based action execution (commands, tasks, plans) targeting all nodes in a group

### Non-Goals

- Group creation or modification through the UI (read-only in this phase)
- Hierarchical group visualization (groups are flattened in initial implementation)
- Real-time group membership updates (uses same polling/refresh as nodes)

### Key Design Decisions

1. **Parallel Architecture**: Groups follow the same pattern as nodes - each integration source provides groups independently, IntegrationManager aggregates them, and the frontend displays them alongside nodes.

2. **Linking Strategy**: Groups with identical names across multiple sources are linked (similar to node linking), with a `linked` boolean and `sources` array to track multi-source groups.

3. **SSH Implicit Groups**: SSH integration creates groups from Host patterns in SSH config files rather than explicit group definitions, enabling pattern-based organization.

4. **Unified Display**: Groups and nodes share the same inventory view with visual differentiation (icons/labels) rather than separate tabs or pages.

5. **Performance**: Group data is fetched in parallel with node data, cached with the same TTL, and supports pagination for large datasets.

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (Svelte)                        │
│  ┌────────────────────────────────────────────────────────┐ │
│  │           InventoryPage.svelte                         │ │
│  │  - Displays nodes and groups in unified view           │ │
│  │  - Filters by source, search query                     │ │
│  │  - Sorts by name, source                               │ │
│  │  - Grid/List view modes                                │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ HTTP GET /api/inventory
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                  Backend (Express/TypeScript)                │
│  ┌────────────────────────────────────────────────────────┐ │
│  │         Inventory Route Handler                        │ │
│  │  - Calls IntegrationManager.getAggregatedInventory()   │ │
│  │  - Applies source filtering                            │ │
│  │  - Returns { nodes, groups, sources }                  │ │
│  └────────────────────────────────────────────────────────┘ │
│                            │                                 │
│  ┌────────────────────────────────────────────────────────┐ │
│  │         IntegrationManager                             │ │
│  │  - Fetches nodes and groups from all sources (parallel)│ │
│  │  - Links groups with same name across sources          │ │
│  │  - Deduplicates group member nodes                     │ │
│  │  - Caches results with TTL                             │ │
│  └────────────────────────────────────────────────────────┘ │
│              │           │           │           │           │
│  ┌───────────┴───┬───────┴───┬───────┴───┬───────┴────────┐ │
│  │ Bolt Plugin   │ Ansible   │ PuppetDB  │ SSH Plugin     │ │
│  │               │ Plugin    │ Plugin    │                │ │
│  │ getGroups()   │getGroups()│getGroups()│ getGroups()    │ │
│  └───────────────┴───────────┴───────────┴────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Frontend Request**: User navigates to inventory page, InventoryPage.svelte calls `/api/inventory`
2. **Backend Aggregation**: Inventory route handler calls `IntegrationManager.getAggregatedInventory()`
3. **Parallel Fetching**: IntegrationManager calls `getGroups()` on all enabled information source plugins in parallel
4. **Group Linking**: IntegrationManager identifies groups with matching names and creates linked group entities
5. **Response**: Backend returns `{ nodes: Node[], groups: NodeGroup[], sources: SourceInfo }`
6. **Frontend Display**: InventoryPage renders groups and nodes in unified view with filtering/sorting

## Components and Interfaces

### Backend Data Models

#### NodeGroup Interface

```typescript
/**
 * Node group from an integration source
 */
export interface NodeGroup {
  /** Unique identifier for the group (format: source:groupName) */
  id: string;
  
  /** Group name as defined in the source */
  name: string;
  
  /** Primary source of the group */
  source: string;
  
  /** All sources where this group exists (for linked groups) */
  sources: string[];
  
  /** True if group exists in multiple sources */
  linked: boolean;
  
  /** Array of node IDs that are members of this group */
  nodes: string[];
  
  /** Optional metadata specific to the source */
  metadata?: {
    description?: string;
    variables?: Record<string, unknown>;
    hierarchy?: string[]; // Parent group names
    [key: string]: unknown;
  };
}
```

#### Updated InformationSourcePlugin Interface

```typescript
export interface InformationSourcePlugin extends IntegrationPlugin {
  type: "information" | "both";

  getInventory(): Promise<Node[]>;
  
  /**
   * Get groups from this source
   * @returns Array of node groups
   */
  getGroups(): Promise<NodeGroup[]>;
  
  getNodeFacts(nodeId: string): Promise<Facts>;
  getNodeData(nodeId: string, dataType: string): Promise<unknown>;
}
```

#### Updated AggregatedInventory Interface

```typescript
export interface AggregatedInventory {
  nodes: Node[];
  
  /** Groups aggregated from all sources */
  groups: NodeGroup[];
  
  sources: Record<
    string,
    {
      nodeCount: number;
      groupCount: number; // Added
      lastSync: string;
      status: "healthy" | "degraded" | "unavailable";
    }
  >;
}
```

### Integration-Specific Group Implementations

#### Bolt Integration

Bolt uses `inventory.yaml` files with explicit group definitions:

```yaml
groups:
  - name: web_servers
    targets:
      - web1.example.com
      - web2.example.com
    config:
      transport: ssh
    vars:
      role: webserver
      
  - name: production
    groups:
      - web_servers
      - db_servers
```

**Implementation**: Parse `inventory.yaml`, extract groups section, map targets to node IDs, include vars as metadata.

#### Ansible Integration

Ansible uses `hosts.yml` or INI format with hierarchical groups:

```yaml
all:
  children:
    webservers:
      hosts:
        web1.example.com:
        web2.example.com:
      vars:
        http_port: 80
    databases:
      hosts:
        db1.example.com:
```

**Implementation**: Parse inventory file, extract group hierarchy, flatten to individual groups with parent references in metadata.

#### PuppetDB Integration

PuppetDB may contain node classifiers or custom groupings through queries:

```sql
-- Example: Group by environment
SELECT certname, catalog_environment 
FROM nodes 
GROUP BY catalog_environment
```

**Implementation**: Query PuppetDB for common grouping patterns (environment, OS family, classes), create synthetic groups from query results.

#### SSH Integration

SSH config uses Host patterns for implicit grouping:

```
Host web-prod-*
    User deploy
    Port 22

Host db-*
    User dbadmin
    Port 2222
```

**Implementation**: Extract Host patterns, create groups from patterns (e.g., "web-prod-*" becomes group "web-prod"), match nodes against patterns using glob matching.

### Frontend Components

#### Updated InventoryPage.svelte

**New State Variables**:

```typescript
let groups = $state<NodeGroup[]>([]);
let groupCountsBySource = $derived.by(() => { /* count groups by source */ });
```

**New Computed Properties**:

```typescript
let filteredGroups = $derived.by(() => {
  // Apply search, source filter, and sorting to groups
});

let combinedResults = $derived.by(() => {
  // Combine groups and nodes for unified display
  // Groups appear first, then nodes
});
```

**Visual Differentiation**:

- Groups display folder icon, nodes display server icon
- Groups show member count badge
- Both show source badges consistently

## Data Models

### NodeGroup Storage

Groups are not persisted in the database - they are computed on-demand from integration sources (same as nodes). This ensures groups always reflect the current state of source systems.

### Group Linking Logic

```typescript
function linkGroups(groupsFromSources: Map<string, NodeGroup[]>): NodeGroup[] {
  const groupsByName = new Map<string, NodeGroup[]>();
  
  // Group by name
  for (const [source, groups] of groupsFromSources) {
    for (const group of groups) {
      if (!groupsByName.has(group.name)) {
        groupsByName.set(group.name, []);
      }
      groupsByName.get(group.name)!.push(group);
    }
  }
  
  // Create linked groups
  const linkedGroups: NodeGroup[] = [];
  for (const [name, groups] of groupsByName) {
    if (groups.length === 1) {
      // Single source group
      linkedGroups.push(groups[0]);
    } else {
      // Multi-source group - merge
      const sources = groups.map(g => g.source);
      const allNodes = [...new Set(groups.flatMap(g => g.nodes))];
      linkedGroups.push({
        id: `linked:${name}`,
        name,
        source: groups[0].source, // Primary source
        sources,
        linked: true,
        nodes: allNodes,
        metadata: {
          // Merge metadata from all sources
          ...groups.reduce((acc, g) => ({ ...acc, ...g.metadata }), {})
        }
      });
    }
  }
  
  return linkedGroups;
}
```

### Node Deduplication in Groups

When a group contains nodes from multiple sources, node IDs are deduplicated to prevent duplicate references. Node IDs follow the format `source:nodeName`, so deduplication is straightforward.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property Reflection

After analyzing all acceptance criteria, I identified several redundancies:

- Properties 8.2, 8.3, 13.1, 13.2, 13.3 all test source badge display - consolidated into comprehensive badge display properties
- Properties 2.2, 3.2, 4.3 all test node reference correctness - consolidated into integration-level property
- Properties 6.2 and 6.3 both test linked group creation - combined into single property
- Properties 9.5, 9.6, 9.7 test sorting - combined into comprehensive sorting property

### Backend Properties

#### Property 1: NodeGroup Structure Validity

*For any* NodeGroup instance created by the system, it must contain all required fields (id, name, source, sources array, linked boolean, nodes array) with correct types, and may optionally contain metadata.

**Validates: Requirements 1.1, 1.2**

#### Property 2: Integration Parsing Round-Trip

*For any* valid integration inventory file (Bolt inventory.yaml, Ansible hosts.yml, SSH config) with group definitions, parsing the file and then serializing the groups back should preserve all group information including names, node memberships, and metadata.

**Validates: Requirements 2.1, 2.3, 3.1, 3.3**

#### Property 3: Node Reference Correctness

*For any* group returned by an integration plugin, all node IDs in the group's nodes array must correspond to actual nodes returned by that same integration's getInventory() method.

**Validates: Requirements 2.2, 3.2, 4.3**

#### Property 4: Hierarchy Preservation

*For any* integration inventory with nested or hierarchical groups (Bolt nested groups, Ansible parent-child), the returned groups must preserve the hierarchy information in the metadata.hierarchy field.

**Validates: Requirements 2.4, 3.4**

#### Property 5: SSH Pattern Matching

*For any* SSH config with Host patterns and any set of nodes, a node should be included in a pattern-based group if and only if the node's name matches the pattern using glob matching rules.

**Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5**

#### Property 6: Group Aggregation Completeness

*For any* set of integration sources providing groups, the IntegrationManager's aggregated result must include all groups from all sources (no groups lost during aggregation).

**Validates: Requirements 6.1**

#### Property 7: Linked Group Creation

*For any* groups with identical names across multiple sources, the IntegrationManager must create a single linked group entity with linked=true, sources array containing all source names, and nodes array containing the union of all member nodes (deduplicated).

**Validates: Requirements 6.2, 6.3, 6.4**

#### Property 8: API Response Structure

*For any* GET request to /api/inventory, the response must include both nodes and groups arrays, and the sources metadata must include accurate nodeCount and groupCount for each source.

**Validates: Requirements 7.1, 7.4**

#### Property 9: Source Filtering

*For any* GET request to /api/inventory with a sources query parameter, the returned groups must only include groups where the group's source is in the specified sources list.

**Validates: Requirements 7.2**

#### Property 10: API Sorting

*For any* GET request to /api/inventory with sortBy parameter set to "name" or "source", the returned groups must be sorted correctly (alphabetically by name or by source name) in the specified order (asc/desc).

**Validates: Requirements 7.3**

#### Property 11: Group Validation

*For any* group missing required fields (id, name, source, nodes), the backend must reject it and not include it in the aggregated inventory, and must log a warning.

**Validates: Requirements 14.1**

#### Property 12: Invalid Node References

*For any* group referencing non-existent node IDs, the backend must still include the group in the aggregated inventory but log a warning about the invalid references.

**Validates: Requirements 14.2**

#### Property 13: Group ID Uniqueness

*For any* set of groups from a single integration source, all group IDs must be unique within that source.

**Validates: Requirements 14.3**

#### Property 14: Group Name Sanitization

*For any* group name containing potentially malicious characters (e.g., HTML tags, SQL injection patterns), the backend must sanitize the name before including it in the response.

**Validates: Requirements 14.4**

#### Property 15: Cache TTL Consistency

*For any* cached group data and cached node data, the TTL (time-to-live) values must be identical to ensure consistent refresh behavior.

**Validates: Requirements 15.3**

### Frontend Properties

#### Property 16: Source Badge Display

*For any* rendered group in grid or list view, the DOM must contain source badge elements for all sources in the group's sources array (one badge per source for linked groups).

**Validates: Requirements 8.2, 8.3, 13.1, 13.2, 13.3**

#### Property 17: Member Count Display

*For any* rendered group, the displayed member count must equal the length of the group's nodes array.

**Validates: Requirements 8.4**

#### Property 18: Search Filtering

*For any* search query string, the filtered groups must only include groups whose name contains the search query (case-insensitive substring match).

**Validates: Requirements 9.2**

#### Property 19: Source Filter Application

*For any* source filter selection, the displayed groups must only include groups where the group's source matches the selected source filter.

**Validates: Requirements 9.1**

#### Property 20: Results Count Accuracy

*For any* filter state (search query, source filter), the displayed results count must equal the sum of filtered groups count and filtered nodes count.

**Validates: Requirements 9.3, 9.4**

#### Property 21: Group Sorting

*For any* sort configuration (field: name/source, order: asc/desc), the displayed groups must be sorted correctly according to the configuration, independently from nodes.

**Validates: Requirements 9.5, 9.6, 9.7, 9.8**

#### Property 22: Navigation with Group ID

*For any* group click event, the navigation route must include the correct group ID from the clicked group.

**Validates: Requirements 10.2**

#### Property 23: Visual Differentiation

*For any* rendered group and node in the same view, the group must have a different icon or label than the node (e.g., folder icon vs server icon).

**Validates: Requirements 11.2**

#### Property 24: Group-First Ordering

*For any* view containing both groups and nodes, all groups must appear before all nodes in the rendered order.

**Validates: Requirements 11.3**

## Error Handling

### Backend Error Scenarios

1. **Integration Source Unavailable**: If an integration source fails during group fetching, log the error and continue with other sources. Return partial results with source status marked as "unavailable".

2. **Invalid Group Data**: If a group is missing required fields, reject it and log a warning with details about which fields are missing. Continue processing other groups.

3. **Parsing Errors**: If an integration inventory file cannot be parsed, log the error with file path and parsing details. Return empty groups array for that source.

4. **Node Reference Errors**: If a group references non-existent nodes, include the group but log a warning. The frontend will handle missing node references gracefully.

5. **Timeout Errors**: If group fetching from a source exceeds timeout, mark that source as "degraded" and return empty groups array for that source.

### Frontend Error Scenarios

1. **API Failure**: If /api/inventory fails, display ErrorAlert component with retry button. Preserve last successful data if available.

2. **Empty Results**: If no groups or nodes match filters, display appropriate empty state message with guidance to adjust filters.

3. **Missing Group Data**: If a group is missing expected fields, log warning to console and skip rendering that group.

4. **Navigation Errors**: If group detail page navigation fails, display toast error and remain on inventory page.

### Error Recovery

- **Automatic Retry**: API calls use exponential backoff retry (max 2 retries) for transient failures
- **Graceful Degradation**: If one integration source fails, others continue to work
- **Cache Fallback**: If fresh data fetch fails, serve stale cached data with warning indicator
- **User Feedback**: All errors display user-friendly messages with actionable guidance

## Testing Strategy

### Dual Testing Approach

This feature requires both unit tests and property-based tests for comprehensive coverage:

- **Unit tests**: Verify specific examples, edge cases, and error conditions
- **Property tests**: Verify universal properties across all inputs using randomized data
- Both approaches are complementary and necessary

### Unit Testing Focus

Unit tests should focus on:

- Specific examples of group parsing (one Bolt inventory, one Ansible inventory, one SSH config)
- Edge cases: empty groups, groups with no nodes, malformed inventory files
- Error conditions: missing required fields, invalid node references, parsing failures
- Integration points: API endpoint responses, frontend component rendering
- Mock integration responses for predictable testing

Avoid writing too many unit tests for scenarios that property tests will cover (e.g., don't write 20 unit tests for different group names - property tests handle that).

### Property-Based Testing

Property-based testing will use **fast-check** (TypeScript/JavaScript property testing library) with minimum 100 iterations per test.

Each property test must:

- Reference its design document property in a comment
- Use appropriate generators for test data
- Verify the property holds for all generated inputs

**Example Property Test Structure**:

```typescript
import fc from 'fast-check';

// Feature: inventory-node-groups, Property 1: NodeGroup Structure Validity
test('NodeGroup instances have all required fields', () => {
  fc.assert(
    fc.property(
      nodeGroupGenerator(), // Custom generator for NodeGroup
      (group) => {
        expect(group).toHaveProperty('id');
        expect(group).toHaveProperty('name');
        expect(group).toHaveProperty('source');
        expect(group).toHaveProperty('sources');
        expect(group).toHaveProperty('linked');
        expect(group).toHaveProperty('nodes');
        expect(Array.isArray(group.sources)).toBe(true);
        expect(typeof group.linked).toBe('boolean');
        expect(Array.isArray(group.nodes)).toBe(true);
      }
    ),
    { numRuns: 100 }
  );
});
```

### Test Data Generators

Create generators for:

- **NodeGroup**: Random groups with valid structure
- **BoltInventory**: Random Bolt inventory.yaml content with groups
- **AnsibleInventory**: Random Ansible hosts.yml content with groups
- **SSHConfig**: Random SSH config with Host patterns
- **Node**: Random nodes for testing group membership

### Integration Testing

- Test complete flow: integration source → IntegrationManager → API → frontend
- Use test fixtures for integration inventory files
- Mock external dependencies (file system, PuppetDB API)
- Verify end-to-end data flow with real component rendering

### Performance Testing

- Test with 100+ groups to verify pagination/lazy loading
- Measure group fetching time with parallel vs sequential fetching
- Verify cache hit rates and TTL behavior
- Test frontend rendering performance with virtual scrolling

### Test Coverage Goals

- Backend: 90%+ line coverage, 100% of critical paths
- Frontend: 80%+ line coverage, all user interactions covered
- Property tests: All 24 properties implemented
- Integration tests: All integration sources covered
