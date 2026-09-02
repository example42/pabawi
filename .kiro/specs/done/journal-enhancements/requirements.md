# Requirements Document

## Introduction

This feature enhances the Pabawi node journal system with external lifecycle event collection from Proxmox VE and AWS EC2, a global cross-node journal view page, a compact single-line entry display with expand-on-click, and a shared journal component usable in both global and node-specific contexts.

## Glossary

- **Journal_Service**: The backend service (`JournalService`) that records, retrieves, and aggregates journal entries for inventory nodes.
- **Journal_Collector**: A module that fetches events from an external source and converts them into journal entries.
- **Proxmox_Task_Collector**: A collector that retrieves VM/container lifecycle events from the Proxmox VE task history API (`/nodes/{node}/tasks`).
- **AWS_State_Collector**: A collector that detects EC2 instance state changes by polling `DescribeInstances` and recording transitions in the journal database.
- **Journal_Router**: The Express router (`/api/journal`) that exposes journal endpoints including SSE streaming.
- **Global_Journal_Page**: A top-level frontend page at `/journal` that displays journal entries across all nodes with filtering capabilities.
- **Journal_Timeline_Component**: The shared Svelte component that renders journal entries in both global and node-specific modes.
- **Journal_Entry**: A single record in the `journal_entries` table containing nodeId, eventType, source, action, summary, details, and timestamp.
- **SSE_Stream**: A Server-Sent Events connection that delivers journal entries incrementally as each data source responds.
- **Node_Group**: A named collection of inventory nodes used for filtering in the global journal view.

## Requirements

### Requirement 1: Proxmox Lifecycle Event Collection

**User Story:** As an infrastructure engineer, I want Proxmox VM/container lifecycle events (start, stop, reboot, migrate, backup, snapshot) to appear in the node journal automatically, so that I have a complete history of what happened to each guest without relying solely on actions performed through Pabawi.

#### Acceptance Criteria

1. WHEN the Proxmox_Task_Collector runs for a node, THE Proxmox_Task_Collector SHALL query the Proxmox VE API endpoint `/api2/json/nodes/{pveNode}/tasks` filtered by the guest VMID to retrieve task history records.
2. WHEN the Proxmox VE API returns task records, THE Proxmox_Task_Collector SHALL convert each task record into a Journal_Entry with eventType mapped from the Proxmox task type (vzstart/qmstart → start, vzstop/qmstop → stop, vzmigrate/qmmigrate → info, vzdump → info, qmsnapshot/vzsnapshot → info), source set to "proxmox", and timestamp derived from the task starttime.
3. THE Proxmox_Task_Collector SHALL include the Proxmox task UPID, task status (OK, error, running), task type, and PVE node name in the Journal_Entry details field.
4. WHEN the SSE stream is opened for a node that belongs to a Proxmox integration, THE Journal_Router SHALL include "proxmox_tasks" as an active source and emit a batch event containing the collected Proxmox task entries.
5. IF the Proxmox VE API returns an error or is unreachable, THEN THE Proxmox_Task_Collector SHALL return an empty array and THE Journal_Router SHALL emit a source_error SSE event for the "proxmox_tasks" source.
6. THE Proxmox_Task_Collector SHALL deduplicate entries by using a deterministic ID format based on the Proxmox UPID to prevent duplicate journal entries across stream reconnections.

### Requirement 2: AWS EC2 Lifecycle Event Collection

**User Story:** As an infrastructure engineer, I want EC2 instance state changes to appear in the node journal automatically, so that I can track when instances were started, stopped, or terminated regardless of whether the action was performed through Pabawi.

#### Acceptance Criteria

1. WHEN the AWS_State_Collector runs for a node, THE AWS_State_Collector SHALL call the EC2 `DescribeInstances` API for the instance and record the current instance state (running, stopped, terminated, pending, shutting-down, stopping) along with the `StateTransitionReason` and `LaunchTime` fields.
2. WHEN the current instance state differs from the last recorded state for that node in the journal database, THE AWS_State_Collector SHALL create a new Journal_Entry with eventType mapped from the EC2 state (running → start, stopped → stop, terminated → destroy, pending → provision), source set to "aws", and timestamp set to the current time.
3. THE AWS_State_Collector SHALL include the EC2 instance ID, region, previous state, current state, and StateTransitionReason in the Journal_Entry details field.
4. WHEN the SSE stream is opened for a node that belongs to an AWS integration, THE Journal_Router SHALL include "aws_states" as an active source and emit a batch event containing the collected AWS state entry.
5. IF the EC2 API returns an error or credentials are invalid, THEN THE AWS_State_Collector SHALL return an empty array and THE Journal_Router SHALL emit a source_error SSE event for the "aws_states" source.
6. THE AWS_State_Collector SHALL use a deterministic ID format based on the instance ID and state to prevent duplicate entries when the state has not changed since the last collection.

### Requirement 3: Global Journal API Endpoint

**User Story:** As an infrastructure engineer, I want to query journal entries across all nodes through a single API endpoint, so that the global journal page can display a unified timeline.

#### Acceptance Criteria

1. THE Journal_Router SHALL expose a `GET /api/journal/global/stream` SSE endpoint that streams journal entries across all nodes.
2. WHEN a request to the global stream endpoint includes a `nodeIds` query parameter (comma-separated), THE Journal_Router SHALL filter results to include only entries for the specified node IDs.
3. WHEN a request to the global stream endpoint includes a `groupId` query parameter, THE Journal_Router SHALL resolve the group to its member node IDs and filter results accordingly.
4. WHEN a request to the global stream endpoint includes `startDate` and `endDate` query parameters (ISO 8601 format), THE Journal_Router SHALL filter results to include only entries within the specified date range.
5. WHEN a request to the global stream endpoint includes an `eventType` query parameter, THE Journal_Router SHALL filter results to include only entries matching the specified event type.
6. WHEN a request to the global stream endpoint includes a `source` query parameter, THE Journal_Router SHALL filter results to include only entries matching the specified source.
7. THE Journal_Router SHALL require authentication and the "journal:read" RBAC permission for the global stream endpoint.
8. THE global stream endpoint SHALL use the same SSE protocol (init, batch, source_error, complete events) as the existing node-specific stream endpoint.

### Requirement 4: Global Journal Service Query

**User Story:** As a backend developer, I want the Journal_Service to support cross-node queries, so that the global journal endpoint can retrieve entries efficiently.

#### Acceptance Criteria

1. THE Journal_Service SHALL provide a `getGlobalTimeline` method that queries journal entries across all nodes with optional filters for nodeIds, eventType, source, startDate, endDate, limit, and offset.
2. WHEN the `nodeIds` filter is provided, THE Journal_Service SHALL include only entries where nodeId matches one of the specified values.
3. THE `getGlobalTimeline` method SHALL sort results by timestamp descending and apply limit/offset pagination with a default limit of 50 and maximum limit of 200.
4. THE Journal_Service SHALL provide a `getGlobalEntryCount` method that returns the total count of entries matching the provided filters, for pagination support.

### Requirement 5: Global Journal View Page

**User Story:** As an infrastructure engineer, I want a top-level `/journal` page that shows journal entries across all nodes, so that I can monitor activity across my entire infrastructure from a single view.

#### Acceptance Criteria

1. THE Global_Journal_Page SHALL be accessible at the `/journal` route and appear in the main navigation bar.
2. THE Global_Journal_Page SHALL display a node/group filter that allows selecting specific nodes or node groups to narrow the displayed entries.
3. THE Global_Journal_Page SHALL display a date range filter with start and end date inputs to restrict entries to a time interval.
4. THE Global_Journal_Page SHALL display an event type filter dropdown populated with all valid JournalEventType values.
5. THE Global_Journal_Page SHALL display a source filter dropdown populated with all valid JournalSource values.
6. WHEN filters are applied, THE Global_Journal_Page SHALL connect to the `GET /api/journal/global/stream` SSE endpoint with the selected filter parameters and display the streamed entries.
7. THE Global_Journal_Page SHALL display the node name or ID alongside each journal entry so the user can identify which node the entry belongs to.
8. THE Global_Journal_Page SHALL require authentication to access.

### Requirement 6: Compact Journal Entry Display

**User Story:** As an infrastructure engineer, I want each journal entry displayed on a single compact line with key information visible at a glance, so that I can scan through many entries quickly and expand individual entries for full details.

#### Acceptance Criteria

1. THE Journal_Timeline_Component SHALL display each Journal_Entry as a single compact line containing: a color-coded status indicator, the timestamp, a source icon, the event type label, and the summary text.
2. THE status indicator SHALL use distinct colors to represent entry status: green for successful lifecycle events (start, resume, provision), red for errors and failures, yellow for warnings, blue for informational events (command_execution, task_execution, puppet_run, info), and gray for notes.
3. WHEN the user clicks on a compact journal entry line, THE Journal_Timeline_Component SHALL expand the entry to reveal full details including all fields from the details object, the action field, and the nodeUri.
4. WHEN the user clicks on an expanded journal entry, THE Journal_Timeline_Component SHALL collapse the entry back to the compact single-line display.
5. THE compact line display SHALL preserve all information currently shown in the existing journal entry display, accessible through the expand interaction.

### Requirement 7: Shared Journal Component

**User Story:** As a frontend developer, I want a single journal component that works in both global and node-specific contexts, so that I avoid code duplication and maintain consistent behavior.

#### Acceptance Criteria

1. THE Journal_Timeline_Component SHALL accept a `mode` prop with values "global" or "node" to control its behavior.
2. WHEN mode is "node", THE Journal_Timeline_Component SHALL accept a `nodeId` prop and connect to the existing `GET /api/journal/{nodeId}/stream` SSE endpoint.
3. WHEN mode is "global", THE Journal_Timeline_Component SHALL connect to the `GET /api/journal/global/stream` SSE endpoint and accept optional filter props (nodeIds, groupId, startDate, endDate, eventType, source).
4. WHEN mode is "global", THE Journal_Timeline_Component SHALL display the node identifier on each entry line.
5. WHEN mode is "node", THE Journal_Timeline_Component SHALL display the "Add a Note" form above the timeline entries.
6. WHEN mode is "global", THE Journal_Timeline_Component SHALL hide the "Add a Note" form since notes are node-specific.
7. THE Journal_Timeline_Component SHALL use the same SSE parsing logic, entry merging, source status tracking, and error handling in both modes.
