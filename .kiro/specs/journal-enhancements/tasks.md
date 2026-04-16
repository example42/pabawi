# Implementation Plan: Journal Enhancements

## Overview

This plan implements four enhancements to the Pabawi journal system: Proxmox lifecycle event collection, AWS EC2 state change collection, a global cross-node journal API and page, compact entry display with expand-on-click, and a shared JournalTimeline component. Tasks are ordered so each builds on the previous, starting with backend collectors, then service/route extensions, then frontend work.

## Tasks

- [x] 1. Implement Proxmox Task Collector
  - [x] 1.1 Add `mapProxmoxTaskType` and `collectProxmoxTaskEntries` to `backend/src/services/journal/JournalCollectors.ts`
    - Add `ProxmoxTaskRecord` interface matching the Proxmox VE task API shape (upid, node, starttime, type, status, user, id)
    - Implement `mapProxmoxTaskType(taskType: string): JournalEventType` with the mapping table from the design (qmstart/vzstart→start, qmstop/vzstop/qmshutdown/vzshutdown→stop, qmreboot→reboot, qmsuspend/vzsuspend→suspend, qmresume/vzresume→resume, others→info)
    - Implement `collectProxmoxTaskEntries(proxmoxClient, pveNode, vmid, nodeId)` that calls `proxmoxClient.get(/api2/json/nodes/{pveNode}/tasks?vmid={vmid}&limit=50)`, maps each record to a `JournalEntry` with deterministic ID `proxmox:task:{upid}`, source `"proxmox"`, timestamp from epoch `starttime`, and details containing upid, status, type, node
    - Handle API errors by catching exceptions, logging, and returning `[]`
    - Skip malformed individual records with a warning log
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 1.6_

  - [ ]* 1.2 Write property test for Proxmox task record transformation (Property 1)
    - **Property 1: Proxmox task record transformation preserves required fields**
    - Generate random ProxmoxTaskRecord objects with random task types from the known set, random UPIDs, random epoch timestamps, random statuses
    - Assert eventType matches the mapping, source equals "proxmox", timestamp is derived from starttime, details contains upid/status/type/node
    - **Validates: Requirements 1.2, 1.3**

  - [ ]* 1.3 Write property test for Proxmox entry ID determinism (Property 2)
    - **Property 2: Proxmox entry ID determinism**
    - Generate random ProxmoxTaskRecord objects, run transformation twice with same input
    - Assert both produce identical `id` fields following format `proxmox:task:{upid}`
    - **Validates: Requirements 1.6**

- [x] 2. Implement AWS State Collector
  - [x] 2.1 Add `mapEC2StateToEventType` and `collectAWSStateEntry` to `backend/src/services/journal/JournalCollectors.ts`
    - Implement `mapEC2StateToEventType(state: string): JournalEventType` with the mapping from the design (running→start, stopped→stop, terminated→destroy, pending→provision, shutting-down→stop, stopping→stop)
    - Implement `collectAWSStateEntry(awsService, instanceId, region, db, nodeId)` that calls `DescribeInstances` via `awsService.getNodeFacts()`, extracts current state, queries last recorded state from `journal_entries` where nodeId matches and source="aws", creates a new entry only if state changed
    - Use deterministic ID format `aws:state:{instanceId}:{state}`
    - Include instanceId, region, previousState, currentState, stateTransitionReason in details
    - Handle API errors and DB query failures gracefully (return `[]`)
    - _Requirements: 2.1, 2.2, 2.3, 2.5, 2.6_

  - [ ]* 2.2 Write property test for AWS state change transformation (Property 3)
    - **Property 3: AWS state change transformation preserves required fields**
    - Generate random EC2 state pairs (previous ≠ current) with random instance IDs and regions
    - Assert eventType matches the mapping, source equals "aws", details contains instanceId/region/previousState/currentState/stateTransitionReason
    - **Validates: Requirements 2.2, 2.3**

  - [ ]* 2.3 Write property test for AWS entry ID determinism (Property 4)
    - **Property 4: AWS entry ID determinism**
    - Generate random instanceId and state combinations, run ID generation twice
    - Assert same instanceId+state always produces same `id` following format `aws:state:{instanceId}:{state}`
    - **Validates: Requirements 2.6**

- [x] 3. Checkpoint — Collectors complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Extend JournalService with global timeline methods
  - [x] 4.1 Add `GlobalTimelineFilters` interface, `getGlobalTimeline`, and `getGlobalEntryCount` to `backend/src/services/journal/JournalService.ts`
    - Define `GlobalTimelineFilters` interface with optional nodeIds, eventType, source, startDate, endDate, limit (default 50, max 200), offset (default 0)
    - Implement `getGlobalTimeline(filters?)` that builds a SQL query across all nodes with dynamic WHERE clauses for each active filter, sorts by timestamp DESC, applies limit/offset
    - Implement `getGlobalEntryCount(filters?)` that returns COUNT(*) with the same filter logic
    - Parse JSON details column in returned rows (same pattern as `getNodeTimeline`)
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [ ]* 4.2 Write property test for global timeline filter correctness (Property 5)
    - **Property 5: Global timeline filter correctness**
    - Seed in-memory SQLite with randomly generated journal entries (random nodeIds, eventTypes, sources, timestamps)
    - Generate random filter combinations, call `getGlobalTimeline`, assert every returned entry satisfies all active filters
    - **Validates: Requirements 3.2, 3.4, 3.5, 3.6, 4.1, 4.2**

  - [ ]* 4.3 Write property test for global timeline sort order and pagination (Property 6)
    - **Property 6: Global timeline sort order and pagination**
    - Seed DB with random entries, call `getGlobalTimeline` with random limit/offset
    - Assert results are sorted by timestamp descending and count does not exceed limit
    - **Validates: Requirements 4.3**

  - [ ]* 4.4 Write property test for global entry count consistency (Property 7)
    - **Property 7: Global entry count consistency**
    - Seed DB with random entries, for random filters call both `getGlobalTimeline` (with limit=200) and `getGlobalEntryCount`
    - Assert count equals the number of entries returned when no pagination limit is applied
    - **Validates: Requirements 4.4**

- [x] 5. Extend Journal Router with global stream and collector integration
  - [x] 5.1 Add `GET /api/journal/global/stream` SSE endpoint to `backend/src/routes/journal.ts`
    - Add `GlobalStreamQuerySchema` Zod schema for query params (nodeIds, groupId, startDate, endDate, eventType, source)
    - Add the global stream route before the `/:nodeId` routes to avoid route conflicts
    - Require authentication and `journal:read` RBAC permission
    - Resolve `groupId` to nodeIds via `IntegrationManager.getAggregatedInventory()` (find group by ID in the groups array, extract node names)
    - Call `JournalService.getGlobalTimeline(filters)` and emit results using SSE protocol (init → batch → complete)
    - Handle validation errors (400), group not found (400), and DB errors (500)
    - Accept `IntegrationManager` as a new dependency in `createJournalRouter`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8_

  - [x] 5.2 Integrate Proxmox and AWS collectors into the existing `/:nodeId/stream` endpoint
    - Accept `IntegrationManager` dependency (already added in 5.1)
    - In the `/:nodeId/stream` handler, determine the node's integration source by looking up the node in the aggregated inventory
    - If node belongs to Proxmox: add `"proxmox_tasks"` to activeSources, call `collectProxmoxTaskEntries` with the ProxmoxClient, PVE node name, and VMID extracted from the node config
    - If node belongs to AWS: add `"aws_states"` to activeSources, call `collectAWSStateEntry` with the AWSService, instance ID, region, DB adapter, and nodeId
    - Emit batch/source_error events for each new source following the existing pattern
    - _Requirements: 1.4, 1.5, 2.4, 2.5_

  - [ ]* 5.3 Write unit tests for global stream endpoint
    - Test SSE protocol compliance (init/batch/complete event order)
    - Test authentication and RBAC enforcement (401/403 responses)
    - Test Zod validation for invalid query params (400 response)
    - Test groupId resolution with mocked IntegrationManager
    - Test filter passthrough to JournalService
    - Place in `backend/test/routes/journal-global.test.ts`
    - _Requirements: 3.1, 3.7, 3.8_

- [x] 6. Checkpoint — Backend complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Refactor JournalTimeline to shared component with compact display
  - [x] 7.1 Refactor `frontend/src/components/JournalTimeline.svelte` to support `mode` prop
    - Change Props interface to accept `mode: "node" | "global"`, optional `nodeId`, and optional filter props (nodeIds, groupId, startDate, endDate, eventType, source)
    - In `"node"` mode: connect to `/api/journal/{nodeId}/stream` (existing behavior), show "Add a Note" form
    - In `"global"` mode: connect to `/api/journal/global/stream` with filter query params, hide note form, show node identifier on each entry line
    - Share SSE parsing logic, entry merging, source status tracking, and error handling between modes
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

  - [x] 7.2 Implement compact single-line entry display with expand-on-click
    - Replace the current multi-line entry display with a compact single-line format: color-coded status dot, timestamp, source icon, event type label, summary text
    - Status dot colors: green for start/resume/provision, red for error/destroy, yellow for warning, blue for command_execution/task_execution/puppet_run/info, gray for note
    - Click expands to show full details (details object, action, nodeUri); click again collapses
    - In global mode, show node name/ID on the compact line
    - Preserve all information from the existing display, accessible through expand
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x] 7.3 Update `frontend/src/pages/NodeDetailPage.svelte` to pass `mode="node"` to JournalTimeline
    - Update the JournalTimeline usage to include `mode="node"` prop
    - Verify existing node journal behavior is preserved
    - _Requirements: 7.2_

- [x] 8. Implement Global Journal Page
  - [x] 8.1 Create `frontend/src/pages/GlobalJournalPage.svelte`
    - Build filter bar with: node/group selector, date range picker (start/end date inputs), event type dropdown (populated from JournalEventType values), source dropdown (populated from JournalSource values)
    - Render `<JournalTimeline mode="global" ...filters />` below the filter bar
    - Require authentication to access
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8_

  - [x] 8.2 Register `/journal` route in `frontend/src/App.svelte` and add navigation link
    - Import `GlobalJournalPage` and add `'/journal': { component: GlobalJournalPage, requiresAuth: true }` to the routes object
    - Add "Journal" link to the `Navigation.svelte` component in the main nav bar
    - _Requirements: 5.1_

- [-] 9. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- Property-based tests go in `backend/test/properties/journal-enhancements/` directory
- The design uses TypeScript throughout — all implementation uses TypeScript
