# ManageTab Lifecycle Actions - End-to-End Flow Analysis

## Error Context

```
Error: "No provisioning provider found for node ID: almalinux10.test.example42.com"
Debug: nodeType=unknown, currentStatus=unknown, provider=undefined, 
       providerData.id=undefined, metadata.type=undefined, metadata.status=undefined
```

## Complete Flow Trace

### 1. Frontend API Client (frontend/src/lib/api.ts)

Function: fetchLifecycleActions(nodeId: string)

- Location: Lines ~1100-1110 (in provisioning API section)
- Endpoint: GET /api/nodes/{nodeId}/lifecycle-actions
- Retry Logic: 2 retries with 1000ms delay
- Returns: { provider: string; actions: LifecycleAction[] }

### 2. ManageTab Component (frontend/src/components/ManageTab.svelte)

Props Received:

- nodeId: string - The node identifier (e.g., "proxmox:node:vmid" or "aws:region:instanceId")
- nodeType?: 'vm' | 'lxc' | 'unknown' - Type of node (defaults to 'unknown')
- currentStatus?: string - Current node status (defaults to 'unknown')
- onStatusChange?: () => void - Callback when status changes

Key Function: fetchAvailableActions()

- Calls fetchLifecycleActions(nodeId)
- Sets provider and availableActions from response
- Problem: ManageTab receives nodeId but doesn't validate it has the correct format

### 3. NodeDetailPage (frontend/src/pages/NodeDetailPage.svelte)

Where ManageTab is Used: In the "manage" tab (line ~1800+)

- nodeId comes from route params: params?.id || ''
- node is fetched via GET /api/nodes/{nodeId}
- Node data should contain provider metadata, but it's not being extracted

Issue: The node detail page fetches node data but doesn't extract or pass provider information to ManageTab. The nodeId passed to ManageTab is the raw route parameter, which may be a hostname instead of a provider-prefixed ID.

### 4. Backend Route Handler (backend/src/routes/inventory.ts)

Endpoint: GET /api/nodes/:id/lifecycle-actions

- Location: Lines ~1100-1150
- Authentication: Required (via authMiddleware)
- RBAC: Required (provisioning:read permission)

Handler Logic:

1. Parse nodeId from params
2. Call getExecutionToolForNode(nodeId, res)
3. Get capabilities from tool
4. Build lifecycle action definitions
5. Return { provider, actions }

### 5. Provider Resolution (backend/src/routes/inventory.ts)

Function: resolveProvider(nodeId: string): string | null

- Location: Lines ~1050-1060
- Logic: Extracts prefix from nodeId (before first colon)
- Supported Prefixes: "proxmox", "aws"

Function: getExecutionToolForNode(nodeId: string, res: Response)

- Location: Lines ~1065-1090
- Returns: { tool: ExecutionToolPlugin; provider: string } | null
- Error Cases:
  1. Integration manager not initialized → 503 "INTEGRATION_NOT_AVAILABLE"
  2. Provider prefix not recognized → 400 "UNSUPPORTED_PROVIDER" ← THIS IS THE ERROR
  3. Provider not configured → 503 "PROVIDER_NOT_CONFIGURED"

### 6. Node Data Fetching (backend/src/routes/inventory.ts)

Endpoint: GET /api/nodes/:id

- Location: Lines ~800-950
- Returns: Node object with metadata

Problem: The node endpoint returns node data but doesn't include provider information. The frontend receives a node object without the provider-prefixed ID format needed by the lifecycle actions endpoint.

## Root Cause Analysis

Why the Error Occurs:

1. Node ID Format Mismatch:
   - Frontend receives nodeId from route params (e.g., "almalinux10.test.example42.com")
   - This is a hostname, not a provider-prefixed ID (e.g., "proxmox:node:vmid")
   - Backend's resolveProvider() looks for a colon prefix and finds none
   - Returns null, triggering the error

2. Missing Provider Metadata:
   - Node data fetched from GET /api/nodes/:id doesn't include provider information
   - Frontend can't determine which provider manages the node
   - ManageTab receives nodeId as a plain hostname

3. No Node Linking:
   - The system has a NodeLinkingService (mentioned in structure) that should map nodes across integrations
   - But the node detail page doesn't use it to resolve provider information
   - Frontend doesn't know which integration owns the node

## Data Flow Diagram

Frontend Route Params
    ↓
    nodeId = "almalinux10.test.example42.com" (hostname)
    ↓
NodeDetailPage
    ↓
    Fetches: GET /api/nodes/{nodeId}
    ↓
    Returns: { id, name, uri, transport, config }
    ↓
    Passes to ManageTab: nodeId (still hostname), nodeType='unknown', currentStatus='unknown'
    ↓
ManageTab.fetchAvailableActions()
    ↓
    Calls: GET /api/nodes/{nodeId}/lifecycle-actions
    ↓
Backend resolveProvider()
    ↓
    Looks for prefix before colon in "almalinux10.test.example42.com"
    ↓
    Finds: "almalinux10" (not a valid provider)
    ↓
    Returns: null
    ↓
    Error: "No provisioning provider found for node ID: almalinux10.test.example42.com"

## What Should Happen

1. Node Linking: When fetching node details, the backend should:
   - Identify which integration(s) manage this node
   - Return provider information in the node object
   - Include provider-prefixed node ID for provisioning operations

2. Frontend Extraction: NodeDetailPage should:
   - Extract provider information from node data
   - Pass provider-prefixed nodeId to ManageTab
   - Pass actual nodeType and currentStatus from node metadata

3. ManageTab Usage: ManageTab should:
   - Receive provider-prefixed nodeId (e.g., "proxmox:node:vmid")
   - Validate nodeId format before calling API
   - Show appropriate error if nodeId format is invalid

## Missing Pieces

In Backend:

- Node endpoint doesn't return provider information
- No mechanism to link a hostname to a provider-prefixed ID
- NodeLinkingService exists but isn't used in node detail endpoint

In Frontend:

- NodeDetailPage doesn't extract provider metadata
- ManageTab doesn't validate nodeId format
- No fallback for nodes without provider information

## Related Code Locations

- Frontend API: pabawi/frontend/src/lib/api.ts (lines ~1100-1110)
- ManageTab Component: pabawi/frontend/src/components/ManageTab.svelte (entire file)
- NodeDetailPage: pabawi/frontend/src/pages/NodeDetailPage.svelte (lines ~1-50, ~1800+)
- Backend Route: pabawi/backend/src/routes/inventory.ts (lines ~800-1150)
- Provider Resolution: pabawi/backend/src/routes/inventory.ts (lines ~1050-1090)
- Integration Manager: pabawi/backend/src/integrations/IntegrationManager.ts
- Node Linking Service: pabawi/backend/src/integrations/NodeLinkingService.ts

## Lifecycle Actions Endpoint Details

GET /api/nodes/:id/lifecycle-actions

Request:
GET /api/nodes/proxmox:node:100/lifecycle-actions
Authorization: Bearer {token}

Success Response (200):
{
  "provider": "proxmox",
  "actions": [
    {
      "name": "start",
      "displayName": "Start",
      "description": "Start the VM",
      "requiresConfirmation": false,
      "destructive": false,
      "availableWhen": ["stopped"]
    },
    {
      "name": "stop",
      "displayName": "Stop",
      "description": "Stop the VM",
      "requiresConfirmation": false,
      "destructive": false,
      "availableWhen": ["running"]
    },
    {
      "name": "destroy",
      "displayName": "Destroy",
      "description": "Permanently delete the VM",
      "requiresConfirmation": true,
      "destructive": true,
      "availableWhen": ["stopped", "running", "suspended", "unknown"]
    }
  ]
}

Error Response (400):
{
  "error": {
    "code": "UNSUPPORTED_PROVIDER",
    "message": "No provisioning provider found for node ID: almalinux10.test.example42.com"
  }
}

## Summary

The error occurs because:

1. Frontend passes a hostname as nodeId to ManageTab
2. Backend expects a provider-prefixed ID (e.g., "proxmox:node:vmid")
3. Provider resolution fails because hostname doesn't have a colon prefix
4. Backend returns 400 error with the message shown

Fix Required: Backend node endpoint must return provider information so frontend can construct the correct provider-prefixed nodeId for lifecycle actions.
