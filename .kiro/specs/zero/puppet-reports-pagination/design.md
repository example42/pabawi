# Design: Puppet Reports Pagination & Node Detail Debug Review

## Overview

This design document outlines the implementation approach for adding pagination to Puppet reports views and ensuring comprehensive expert mode debug coverage across all Puppet and Node Detail page tabs.

## Architecture

### Component Hierarchy

```
PuppetPage
├── Reports Tab
│   ├── PuppetRunChart (with debug info)
│   └── PuppetReportsListView (with pagination + debug info)
│       ├── ReportFilterPanel
│       ├── Reports Table
│       └── PaginationControls (new)
├── Environments Tab (with debug info)
├── Facts Tab (with debug info)
├── Status Tab (with debug info)
├── Admin Tab (with debug info)
├── Hiera Tab (with debug info)
├── Code Analysis Tab (with debug info)
└── ExpertModeDebugPanel (multiple blocks)

NodeDetailPage
├── Node Status Tab (with debug info)
├── Facts Tab (with debug info - multiple sources)
├── Puppet Reports Tab (with pagination + debug info)
├── Managed Resources Tab (with debug info)
├── Hiera Tab (with debug info)
├── Catalog Tab (with debug info)
├── Events Tab (with debug info)
└── ExpertModeDebugPanel (multiple blocks)
```

## Data Flow

### Pagination Flow

```
User Action (change page/size)
  ↓
PaginationControls emits event
  ↓
PuppetReportsListView updates state
  ↓
API call with limit/offset
  ↓
Backend applies pagination
  ↓
Response with paginated data + metadata
  ↓
Update UI with new page
```

### Debug Info Flow

```
User enables Expert Mode
  ↓
API calls include X-Expert-Mode header
  ↓
Backend attaches debug info to responses
  ↓
Frontend extracts _debug from responses
  ↓
Component calls onDebugInfo callback
  ↓
Parent aggregates debug info blocks
  ↓
ExpertModeDebugPanel displays all blocks
```

## Component Design

### 1. PaginationControls Component (New)

**Purpose**: Reusable pagination control component

**Props**:

```typescript
interface PaginationControlsProps {
  currentPage: number;
  pageSize: number;
  totalCount: number;
  hasMore: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  pageSizeOptions?: number[]; // default: [100, 200, 500]
}
```

**State**:

```typescript
// All state managed by parent component
```

**UI Elements**:

- Previous button (← Previous)
- Page indicator (Page X of Y)
- Next button (Next →)
- Page size selector dropdown
- Results count (Showing X-Y of Z)

**Styling**: TailwindCSS utilities, consistent with existing UI

### 2. PuppetReportsListView Component (Enhanced)

**New State**:

```typescript
let currentPage = $state(1);
let pageSize = $state(100); // persisted in session
let totalCount = $state(0);
let hasMore = $state(false);
```

**New Methods**:

```typescript
function handlePageChange(page: number): void;
function handlePageSizeChange(size: number): void;
function resetPagination(): void; // called when filters change
```

**API Integration**:

```typescript
// Build query with pagination
const queryParams = new URLSearchParams();
queryParams.set('limit', pageSize.toString());
queryParams.set('offset', ((currentPage - 1) * pageSize).toString());
// ... add filters
```

### 3. Backend API Changes

**Updated Endpoints**:

```typescript
// GET /api/integrations/puppetdb/reports
// Query params: limit, offset, status, minDuration, minCompileTime, minTotalResources

interface ReportsResponse {
  reports: Report[];
  count: number;        // reports in current page
  totalCount: number;   // total after filters
  hasMore: boolean;     // more pages available
  _debug?: DebugInfo;   // expert mode
}
```

**PuppetDBService Changes**:

```typescript
// Update getAllReports method signature
async getAllReports(
  limit: number = 100,
  offset: number = 0
): Promise<Report[]>

// Add getTotalReportsCount method
async getTotalReportsCount(
  filters?: ReportFilters
): Promise<number>
```

**Query Optimization**:

- Use PuppetDB's built-in pagination support
- Apply LIMIT and OFFSET in PQL queries
- Fetch total count separately when needed

### 4. Session Storage for Page Size

**Implementation**:

```typescript
// In PuppetReportsListView
import { browser } from '$app/environment';

function loadPageSize(): number {
  if (browser) {
    const stored = sessionStorage.getItem('puppetReportsPageSize');
    return stored ? parseInt(stored, 10) : 100;
  }
  return 100;
}

function savePageSize(size: number): void {
  if (browser) {
    sessionStorage.setItem('puppetReportsPageSize', size.toString());
  }
}
```

## Debug Info Implementation Review

### Current State Analysis

**Puppet Page Tabs**:

- ✅ Reports tab: Has debug info via PuppetReportsListView
- ❓ Run History chart: Needs verification
- ❓ Environments tab: Needs verification
- ❓ Facts tab: Needs verification
- ❓ Status tab: Needs verification
- ❓ Admin tab: Needs verification
- ❓ Hiera tab: Needs verification
- ❓ Code Analysis tab: Needs verification

**Node Detail Page Tabs**:

- ❓ Node Status: Needs verification
- ❓ Facts (multi-source): Needs verification
- ❓ Puppet Reports: Needs verification
- ❓ Managed Resources: Needs verification
- ❓ Hiera: Needs verification
- ❓ Catalog: Needs verification
- ❓ Events: Needs verification

### Implementation Pattern

**Standard Pattern for Components**:

```typescript
// Component props
interface Props {
  onDebugInfo?: (info: DebugInfo | null) => void;
}

// In component
async function fetchData() {
  const data = await get<ResponseType>(url);
  
  // Extract and pass debug info to parent
  if (data._debug && onDebugInfo) {
    onDebugInfo(data._debug);
  }
  
  // Handle response data
  // ...
}

// Clear debug info when component unmounts or data changes
$effect(() => {
  return () => {
    if (onDebugInfo) {
      onDebugInfo(null);
    }
  };
});
```

**Parent Page Pattern**:

```typescript
// Aggregated debug info
let debugInfoBlocks = $state<LabeledDebugInfo[]>([]);

function handleDebugInfo(label: string, info: DebugInfo | null): void {
  if (info) {
    const existingIndex = debugInfoBlocks.findIndex(block => block.label === label);
    if (existingIndex >= 0) {
      debugInfoBlocks[existingIndex] = { label, debugInfo: info };
    } else {
      debugInfoBlocks = [...debugInfoBlocks, { label, debugInfo: info }];
    }
  } else {
    debugInfoBlocks = debugInfoBlocks.filter(block => block.label !== label);
  }
}

// Clear debug info when switching tabs
function switchTab(tabId: TabId): void {
  debugInfoBlocks = []; // Clear debug info
  // ... rest of tab switching logic
}
```

### Multi-Source Debug Info (Facts Tab Example)

**Scenario**: Facts tab fetches from both PuppetDB and Bolt

**Implementation**:

```typescript
// In MultiSourceFactsViewer component
interface Props {
  onDebugInfo?: (label: string, info: DebugInfo | null) => void;
}

async function fetchPuppetDBFacts() {
  const data = await get<FactsResponse>(`/api/integrations/puppetdb/nodes/${certname}/facts`);
  if (data._debug && onDebugInfo) {
    onDebugInfo('PuppetDB Facts', data._debug);
  }
  // ...
}

async function fetchBoltFacts() {
  const data = await get<FactsResponse>(`/api/bolt/nodes/${certname}/facts`);
  if (data._debug && onDebugInfo) {
    onDebugInfo('Bolt Facts', data._debug);
  }
  // ...
}

// Parent receives labeled debug info
<MultiSourceFactsViewer 
  onDebugInfo={(label, info) => handleDebugInfo(label, info)} 
/>
```

## Database Queries

### Efficient Pagination Query

**PuppetDB PQL Query**:

```
reports[certname, hash, environment, status, noop, start_time, end_time, metrics] {
  // filters applied here
  order by start_time desc
  limit <limit>
  offset <offset>
}
```

**Count Query** (separate):

```
reports[count()] {
  // same filters as main query
}
```

## UI/UX Design

### Pagination Controls Layout

```
┌─────────────────────────────────────────────────────────────┐
│ Puppet Reports                    Showing 101-200 of 1,247  │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  [Reports Table]                                             │
│                                                               │
├─────────────────────────────────────────────────────────────┤
│  [← Previous]  Page 2 of 13  [Next →]    Per page: [200 ▼] │
└─────────────────────────────────────────────────────────────┘
```

### Loading States

**Page Transition**:

- Show loading spinner overlay on table
- Disable pagination controls during load
- Preserve current page display until new data arrives

**Page Size Change**:

- Show loading spinner
- Reset to page 1
- Update URL/state

## Error Handling

### Pagination Errors

**Scenario**: User navigates to page that no longer exists (e.g., after filters reduce results)

**Solution**:

- Detect `reports.length === 0 && currentPage > 1`
- Automatically reset to page 1
- Show info message: "No results on this page, showing page 1"

**Scenario**: Network error during page fetch

**Solution**:

- Show error message
- Keep current page data visible
- Provide retry button

### Debug Info Errors

**Scenario**: Component fails to pass debug info to parent

**Solution**:

- Log error to console
- Continue normal operation
- Debug info is optional, don't break UI

## Testing Strategy

### Unit Tests

**PaginationControls Component**:

- Test page change events
- Test page size change events
- Test button disabled states
- Test keyboard navigation

**PuppetReportsListView with Pagination**:

- Test initial page load
- Test page navigation
- Test page size changes
- Test pagination with filters
- Test pagination reset on filter change

### Integration Tests

**Pagination + Filtering**:

- Apply filters, verify pagination resets
- Change page, apply filters, verify reset
- Change page size, verify reset to page 1

**Debug Info Display**:

- Enable expert mode, verify debug info appears in all tabs
- Switch tabs, verify debug info clears and updates
- Test multi-source debug info (Facts tab)

### Manual Testing Checklist

**Pagination**:

- [ ] Navigate through multiple pages
- [ ] Change page size (100 → 200 → 500)
- [ ] Verify page size persists across tab switches
- [ ] Apply filters and verify pagination resets
- [ ] Test with < 100 reports (no pagination)
- [ ] Test with exactly 100 reports (edge case)
- [ ] Test with 1000+ reports

**Debug Info - Puppet Page**:

- [ ] Enable expert mode
- [ ] Visit each tab and verify debug info appears
- [ ] Verify debug info clears when switching tabs
- [ ] Verify multiple debug blocks display correctly

**Debug Info - Node Detail Page**:

- [ ] Enable expert mode
- [ ] Visit each tab and verify debug info appears
- [ ] Test Facts tab with multiple sources
- [ ] Verify debug info for Puppet Reports pagination

## Performance Considerations

### Backend Optimization

**Query Performance**:

- Use indexed fields for sorting (start_time)
- Minimize data fetched per report
- Cache total count for short duration (30s)

**Memory Usage**:

- Never load all reports into memory
- Stream results when possible
- Limit maximum page size to 500

### Frontend Optimization

**Rendering**:

- Use virtual scrolling for large tables (future consideration)
- Debounce page size changes
- Avoid re-rendering entire table on page change

**State Management**:

- Don't store all pages in memory
- Clear previous page data when navigating
- Use derived state for computed values

## Migration Plan

### Phase 1: Backend Changes

1. Update PuppetDBService with pagination support
2. Update API endpoints to accept limit/offset
3. Update response format with pagination metadata
4. Test with existing frontend (backward compatible)

### Phase 2: Frontend Components

1. Create PaginationControls component
2. Update PuppetReportsListView with pagination
3. Add session storage for page size
4. Test pagination in isolation

### Phase 3: Debug Info Review

1. Audit all Puppet Page tabs for debug info
2. Audit all Node Detail Page tabs for debug info
3. Fix missing debug info implementations
4. Test multi-source debug info scenarios

### Phase 4: Integration & Testing

1. Integration testing of pagination + filters
2. Manual testing across all browsers
3. Performance testing with large datasets
4. Accessibility testing

## Rollback Plan

If issues arise:

1. Feature flag to disable pagination (fall back to limit=100)
2. Revert frontend changes (pagination controls hidden)
3. Backend remains backward compatible
4. Debug info changes are non-breaking

## Future Enhancements

- Infinite scroll option
- Jump to specific page
- Customizable page size options
- URL-based pagination state (shareable links)
- Export paginated results
- Server-side result caching
