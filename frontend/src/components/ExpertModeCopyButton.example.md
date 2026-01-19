# ExpertModeCopyButton Component Examples

This document demonstrates the various ways to use the `ExpertModeCopyButton` component with different configuration options.

## Basic Usage

```svelte
<script lang="ts">
  import ExpertModeCopyButton from './ExpertModeCopyButton.svelte';
  import type { DebugInfo } from '../lib/api';

  const debugInfo: DebugInfo = {
    timestamp: '2024-01-15T10:30:00.000Z',
    requestId: 'req_123456',
    operation: 'GET /api/inventory',
    duration: 250,
    integration: 'bolt',
    cacheHit: false,
  };

  const responseData = {
    nodes: ['node1', 'node2'],
    count: 2,
  };
</script>

<ExpertModeCopyButton 
  data={responseData} 
  debugInfo={debugInfo} 
/>
```

## With Custom Label

```svelte
<ExpertModeCopyButton 
  data={responseData} 
  debugInfo={debugInfo}
  label="Copy Troubleshooting Info"
/>
```

## Including Performance Metrics

```svelte
<ExpertModeCopyButton 
  data={responseData} 
  debugInfo={debugInfo}
  includePerformance={true}
/>
```

This will include backend performance metrics such as:
- Memory usage
- CPU usage
- Active connections
- Cache statistics (hit rate, hits, misses, size)
- Request statistics (total, avg duration, P95, P99)

## Including Browser Information

```svelte
<ExpertModeCopyButton 
  data={responseData} 
  debugInfo={debugInfo}
  includeBrowserInfo={true}
/>
```

This will automatically collect and include:
- Browser platform
- Browser language
- Viewport dimensions
- User agent string

## Including Cookies

```svelte
<ExpertModeCopyButton 
  data={responseData} 
  debugInfo={debugInfo}
  includeCookies={true}
/>
```

This will automatically collect all cookies from `document.cookie` and include them in the debug output.

**Note:** Be cautious when sharing debug info with cookies enabled, as they may contain sensitive session information.

## Including Storage (localStorage and sessionStorage)

```svelte
<ExpertModeCopyButton 
  data={responseData} 
  debugInfo={debugInfo}
  includeStorage={true}
/>
```

This will automatically collect and include:
- All localStorage items
- All sessionStorage items

Long values (>100 characters) are automatically truncated for readability.

**Note:** Be cautious when sharing debug info with storage enabled, as it may contain sensitive user data.

## Complete Configuration for Support Requests

```svelte
<ExpertModeCopyButton 
  data={responseData} 
  debugInfo={debugInfo}
  label="Copy Complete Debug Info"
  includeContext={true}
  includePerformance={true}
  includeBrowserInfo={true}
  includeCookies={false}
  includeStorage={false}
/>
```

This configuration is ideal for support requests as it includes:
- Backend debug information (errors, warnings, info, debug messages)
- API call details
- Performance metrics
- Request context (URL, headers, query params)
- Browser information
- Response data

But excludes potentially sensitive information like cookies and storage.

## Minimal Configuration

```svelte
<ExpertModeCopyButton 
  data={responseData} 
  debugInfo={debugInfo}
  includeContext={false}
  includePerformance={false}
  includeBrowserInfo={false}
/>
```

This will only include:
- Basic debug information (timestamp, request ID, operation, duration)
- Errors, warnings, info, and debug messages
- API call details

## With Frontend Debug Info

```svelte
<script lang="ts">
  const frontendInfo = {
    renderTime: 50,
    componentTree: ['App', 'HomePage', 'InventoryList'],
    url: window.location.href,
    browserInfo: {
      userAgent: navigator.userAgent,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      language: navigator.language,
      platform: navigator.platform,
    },
  };
</script>

<ExpertModeCopyButton 
  data={responseData} 
  debugInfo={debugInfo}
  frontendInfo={frontendInfo}
/>
```

When `frontendInfo` is provided, it will be used instead of automatically collecting browser information.

## Output Format

The copied text is formatted for easy sharing with support teams and AI assistants:

```
================================================================================
PABAWI DEBUG INFORMATION
Generated: 2024-01-15T10:30:00.000Z
================================================================================

--- BACKEND DEBUG INFORMATION ---

Timestamp: 2024-01-15T10:30:00.000Z
Request ID: req_123456
Operation: GET /api/inventory
Duration: 250ms
Integration: bolt
Cache Hit: No

Errors:
  1. Connection timeout
     Code: ETIMEDOUT

API Calls:
  1. GET /api/bolt/inventory
     Status: 200
     Duration: 150ms
     Cached: No

--- PERFORMANCE METRICS ---

Backend Performance:
  Memory Usage: 100.00 MB
  CPU Usage: 25.50%
  Active Connections: 10

Cache Statistics:
  Hit Rate: 80.0%
  Cache Hits: 80
  Cache Misses: 20
  Cache Size: 100 items

Request Statistics:
  Total Requests: 1000
  Avg Duration: 150.50ms
  P95 Duration: 300.20ms
  P99 Duration: 450.80ms

--- REQUEST CONTEXT ---

URL: /api/inventory
Method: GET
User Agent: Mozilla/5.0
IP Address: 192.168.1.1
Timestamp: 2024-01-15T10:30:00.000Z

Query Parameters:
  filter: active

Request Headers:
  Content-Type: application/json
  X-Expert-Mode: true

--- FRONTEND INFORMATION ---

Current URL: http://localhost:3000/inventory
Render Time: 50ms

Browser Information:
  Platform: MacIntel
  Language: en-US
  Viewport: 1920x1080
  User Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)...

Component Tree:
  - App
  - HomePage
  - InventoryList

--- RESPONSE DATA ---

{
  "nodes": ["node1", "node2"],
  "count": 2
}

================================================================================
END OF DEBUG INFORMATION

This debug information can be shared with support teams or AI assistants
to help diagnose issues. It includes backend debug data, performance
metrics, and frontend context information.
================================================================================
```

## Best Practices

1. **For Support Requests**: Use full configuration with `includePerformance={true}` and `includeBrowserInfo={true}`, but keep `includeCookies={false}` and `includeStorage={false}` to avoid sharing sensitive data.

2. **For AI Troubleshooting**: Include all context with `includeContext={true}` and `includePerformance={true}` for better diagnosis.

3. **For Internal Debugging**: You can enable all options including cookies and storage, but be careful not to share this output externally.

4. **For Production Issues**: Always include performance metrics to help identify bottlenecks and resource issues.

5. **Privacy Considerations**: Always review the copied content before sharing, especially when cookies or storage are included.

## Integration with Expert Mode

The component automatically respects the expert mode state. When expert mode is disabled, the button should not be rendered:

```svelte
<script lang="ts">
  import { expertMode } from '../lib/expertMode.svelte';
</script>

{#if expertMode.enabled}
  <ExpertModeCopyButton 
    data={responseData} 
    debugInfo={debugInfo}
  />
{/if}
```

## Accessibility

The component includes proper ARIA labels and keyboard support:
- The button has an `aria-label` attribute matching the label text
- The copy icon is marked with `aria-hidden="true"` to avoid confusion for screen readers
- The button is fully keyboard accessible (Tab to focus, Enter/Space to activate)
