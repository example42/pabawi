# Requirements: Puppet Reports Pagination & Node Detail Debug Review

## Feature Overview

This feature adds pagination capabilities to Puppet reports views and ensures expert mode debug information is correctly displayed across all tabs and subtabs of the Puppet page and Node Detail page.

## User Stories

### US-1: Pagination for Puppet Reports
**As a** Puppet administrator  
**I want to** paginate through Puppet reports with configurable page sizes  
**So that** I can view older reports and control how many reports are displayed at once

### US-2: Expert Mode Debug Coverage
**As a** developer or system administrator  
**I want to** see expert mode debug information in all tabs and subtabs  
**So that** I can troubleshoot issues across the entire application

## Acceptance Criteria

### 1. Pagination Controls

**1.1** The Puppet Reports view MUST display pagination controls when more than the current page size of reports exist

**1.2** Pagination controls MUST include:
- Current page indicator (e.g., "Page 1 of 5")
- Previous page button (disabled on first page)
- Next page button (disabled on last page)
- Page size selector with options: 100, 200, 500

**1.3** The page size selector MUST persist the user's choice for the current session

**1.4** Changing the page size MUST reset to page 1

**1.5** The pagination state MUST be preserved when applying filters

### 2. Backend API Support

**2.1** The `/api/integrations/puppetdb/reports` endpoint MUST accept `limit` and `offset` query parameters

**2.2** The `/api/integrations/puppetdb/nodes/:certname/reports` endpoint MUST accept `limit` and `offset` query parameters

**2.3** The API response MUST include:
- `reports`: Array of report objects
- `count`: Number of reports in current page
- `totalCount`: Total number of reports available (after filters)
- `hasMore`: Boolean indicating if more pages exist

**2.4** The backend MUST efficiently handle large datasets without loading all reports into memory

### 3. Frontend Pagination Implementation

**3.1** The `PuppetReportsListView` component MUST display pagination controls when `showFilters` is true

**3.2** The pagination controls MUST be accessible via keyboard navigation

**3.3** Loading states MUST be shown when fetching new pages

**3.4** The current page and page size MUST be included in API requests

**3.5** The component MUST handle pagination state changes smoothly without flickering

### 4. Node Detail Page - Puppet Reports Tab

**4.1** The Puppet Reports tab in Node Detail page MUST support pagination

**4.2** The pagination controls MUST work independently from the global Puppet Reports page

**4.3** The page size preference MUST be shared across all report views in the same session

### 5. Expert Mode Debug Coverage - Puppet Page

**5.1** The Puppet Run History chart MUST display debug info when expert mode is enabled

**5.2** The Reports tab MUST display debug info for report fetching operations

**5.3** The Environments tab MUST display debug info for environment operations

**5.4** The Facts tab MUST display debug info for facts queries

**5.5** The Status tab MUST display debug info for Puppetserver status queries

**5.6** The Admin tab MUST display debug info for PuppetDB admin queries

**5.7** The Hiera tab MUST display debug info for Hiera queries

**5.8** The Code Analysis tab MUST display debug info for code analysis operations

### 6. Expert Mode Debug Coverage - Node Detail Page

**6.1** The Node Status tab MUST display debug info for node status queries

**6.2** The Facts tab MUST display debug info for node facts queries (both PuppetDB and Bolt sources)

**6.3** The Puppet Reports tab MUST display debug info for node-specific report queries

**6.4** The Managed Resources tab MUST display debug info for resource queries

**6.5** The Hiera tab MUST display debug info for node-specific Hiera queries

**6.6** The Catalog tab MUST display debug info for catalog queries

**6.7** The Events tab MUST display debug info for event queries

**6.8** Debug info from multiple sources (e.g., Facts from PuppetDB + Bolt) MUST be displayed separately with clear labels

### 7. Debug Info Aggregation

**7.1** When a tab makes multiple API calls, debug info from all calls MUST be displayed

**7.2** Each debug info block MUST be labeled with the operation name (e.g., "PuppetDB Facts", "Bolt Facts")

**7.3** Debug info blocks MUST be displayed in chronological order

**7.4** The ExpertModeDebugPanel MUST support displaying multiple debug info blocks

### 8. Performance Considerations

**8.1** Pagination MUST reduce initial load time by fetching only the requested page

**8.2** The backend MUST use efficient database queries with LIMIT and OFFSET

**8.3** The frontend MUST not store all pages in memory simultaneously

**8.4** Page transitions MUST complete within 500ms under normal network conditions

## Non-Functional Requirements

### Performance
- Initial page load MUST complete within 2 seconds
- Page transitions MUST complete within 500ms
- The system MUST handle datasets with 10,000+ reports efficiently

### Usability
- Pagination controls MUST be intuitive and follow common UI patterns
- The current page and total pages MUST be clearly visible
- Keyboard navigation MUST be fully supported

### Accessibility
- All pagination controls MUST be keyboard accessible
- Screen readers MUST announce page changes
- Color contrast MUST meet WCAG 2.1 AA standards

### Compatibility
- Pagination MUST work in all supported browsers (Chrome, Firefox, Safari, Edge)
- The feature MUST work with existing filter functionality
- Expert mode debug info MUST not interfere with normal operation

## Out of Scope

- Infinite scroll pagination (future consideration)
- Jump to specific page number (future consideration)
- Customizable page size options beyond 100/200/500
- Server-side caching of paginated results
- Export all reports functionality

## Dependencies

- Existing PuppetDB integration
- Existing report filtering functionality
- Existing expert mode infrastructure
- ReportFilterService for filter application

## Success Metrics

- Users can access reports older than the current 100-report limit
- Page load time decreases by at least 30% when using smaller page sizes
- All tabs in Puppet and Node Detail pages display debug info correctly
- Zero regression in existing functionality
