# NodeStatus Component

A Svelte component for displaying Puppetserver node status information, including last run timestamp, catalog version, run status, and activity categorization.

## Features

- Displays last run timestamp with relative time formatting
- Shows run status (unchanged, changed, failed) with visual badges
- Highlights inactive nodes based on configurable threshold
- Shows catalog version and facts update timestamps
- Displays environment information (catalog and report environments)
- Graceful error handling with retry functionality
- Loading states with spinner
- Collapsible additional details section

## Props

```typescript
interface Props {
  status: NodeStatus | null;        // Node status data from Puppetserver API
  loading?: boolean;                 // Loading state (default: false)
  error?: string | null;             // Error message (default: null)
  threshold?: number;                // Inactivity threshold in seconds (default: 3600 = 1 hour)
  onRefresh?: () => void;            // Optional refresh callback
}
```

## NodeStatus Interface

```typescript
interface NodeStatus {
  certname: string;
  latest_report_hash?: string;
  latest_report_status?: 'unchanged' | 'changed' | 'failed';
  latest_report_noop?: boolean;
  latest_report_noop_pending?: boolean;
  cached_catalog_status?: string;
  catalog_timestamp?: string;
  facts_timestamp?: string;
  report_timestamp?: string;
  catalog_environment?: string;
  report_environment?: string;
}
```

## Usage Example

### Basic Usage

```svelte
<script lang="ts">
  import { NodeStatus } from '../components';
  import { get } from '../lib/api';
  import { onMount } from 'svelte';

  let nodeStatus = $state(null);
  let loading = $state(false);
  let error = $state(null);

  async function fetchNodeStatus() {
    loading = true;
    error = null;
    
    try {
      const response = await get(`/api/integrations/puppetserver/nodes/node1.example.com/status`);
      nodeStatus = response.status;
    } catch (err) {
      error = err.message;
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    fetchNodeStatus();
  });
</script>

<NodeStatus 
  status={nodeStatus} 
  loading={loading} 
  error={error}
  onRefresh={fetchNodeStatus}
/>
```

### With Custom Inactivity Threshold

```svelte
<NodeStatus 
  status={nodeStatus} 
  loading={loading} 
  error={error}
  threshold={7200}  <!-- 2 hours -->
  onRefresh={fetchNodeStatus}
/>
```

### In Node Detail Page

```svelte
<script lang="ts">
  import { NodeStatus } from '../components';
  
  // ... other imports and state
  
  let nodeStatus = $state(null);
  let statusLoading = $state(false);
  let statusError = $state(null);

  async function fetchNodeStatus() {
    statusLoading = true;
    statusError = null;
    
    try {
      const response = await get(
        `/api/integrations/puppetserver/nodes/${nodeId}/status`
      );
      nodeStatus = response.status;
    } catch (err) {
      statusError = err.message;
    } finally {
      statusLoading = false;
    }
  }

  // Load on tab switch
  function switchToStatusTab() {
    if (!nodeStatus) {
      fetchNodeStatus();
    }
  }
</script>

<!-- In tab content -->
{#if activeTab === 'node-status'}
  <NodeStatus 
    status={nodeStatus} 
    loading={statusLoading} 
    error={statusError}
    threshold={3600}
    onRefresh={fetchNodeStatus}
  />
{/if}
```

## Activity Status

The component automatically categorizes nodes into three activity states:

- **Active**: Node has checked in within the threshold period (green badge)
- **Inactive**: Node has not checked in within the threshold period (red badge, highlighted)
- **Never Checked In**: Node has never reported to Puppetserver (gray badge)

Inactive nodes are highlighted with a red background to draw attention to potential issues.

## API Integration

The component expects data from the Puppetserver API endpoint:

```
GET /api/integrations/puppetserver/nodes/:certname/status
```

Response format:

```json
{
  "status": {
    "certname": "node1.example.com",
    "latest_report_hash": "abc123...",
    "latest_report_status": "changed",
    "latest_report_noop": false,
    "catalog_timestamp": "2024-01-15T10:30:00Z",
    "facts_timestamp": "2024-01-15T10:29:00Z",
    "report_timestamp": "2024-01-15T10:30:00Z",
    "catalog_environment": "production",
    "report_environment": "production"
  },
  "activityCategory": "active",
  "shouldHighlight": false,
  "secondsSinceLastCheckIn": 300,
  "source": "puppetserver"
}
```

## Styling

The component uses Tailwind CSS classes and follows the existing design system:

- Consistent with other components (StatusBadge, LoadingSpinner, ErrorAlert)
- Dark mode support
- Responsive grid layout
- Proper spacing and typography
- Accessible color contrasts

## Requirements Validation

This component validates the following requirements from the design document:

- **Requirement 4.2**: Display last run timestamp, catalog version, and run status
- **Requirement 4.3**: Show node activity status (active, inactive, never checked in)
- **Requirement 4.4**: Highlight inactive nodes based on configurable threshold
- **Requirement 4.5**: Display error messages while preserving other functionality
