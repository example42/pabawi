# Implementation Tasks: Puppet Reports Pagination & Node Detail Debug Review

## Overview

This task list breaks down the implementation into discrete, testable units. Tasks are organized by component and dependency order.

## Task List

### Phase 1: Backend Pagination Support

- [ ] 1.1 Update PuppetDBService for pagination
  - [ ] 1.1.1 Add `offset` parameter to `getAllReports()` method
  - [ ] 1.1.2 Update PQL query to include LIMIT and OFFSET
  - [ ] 1.1.3 Add `getTotalReportsCount()` method for filtered count
  - [ ] 1.1.4 Add `getNodeReports()` method with pagination support
  - [ ] 1.1.5 Test pagination queries against PuppetDB
  - _Validates: Requirements 2.1, 2.4_

- [ ] 1.2 Update reports API endpoint
  - [ ] 1.2.1 Add `offset` query parameter validation to ReportsQuerySchema
  - [ ] 1.2.2 Update `/api/integrations/puppetdb/reports` route to accept offset
  - [ ] 1.2.3 Calculate `hasMore` based on total count
  - [ ] 1.2.4 Update response format with pagination metadata
  - [ ] 1.2.5 Ensure expert mode debug info includes pagination metadata
  - _Validates: Requirements 2.1, 2.3_

- [ ] 1.3 Update node reports API endpoint
  - [ ] 1.3.1 Add `offset` query parameter validation
  - [ ] 1.3.2 Update `/api/integrations/puppetdb/nodes/:certname/reports` route
  - [ ] 1.3.3 Calculate `hasMore` for node-specific reports
  - [ ] 1.3.4 Update response format with pagination metadata
  - [ ] 1.3.5 Ensure expert mode debug info includes pagination metadata
  - _Validates: Requirements 2.2, 2.3_

- [ ] 1.4 Write unit tests for pagination backend
  - [ ] 1.4.1 Test PuppetDBService pagination methods
  - [ ] 1.4.2 Test offset calculation edge cases (0, negative, beyond total)
  - [ ] 1.4.3 Test total count with and without filters
  - [ ] 1.4.4 Test hasMore calculation
  - [ ] 1.4.5 Test pagination with empty results
  - _Validates: Requirements 2.1, 2.2, 2.3, 2.4_

### Phase 2: Frontend Pagination Components

- [ ] 2.1 Create PaginationControls component
  - [ ] 2.1.1 Create component file with TypeScript interfaces
  - [ ] 2.1.2 Implement Previous/Next buttons with disabled states
  - [ ] 2.1.3 Implement page indicator (Page X of Y)
  - [ ] 2.1.4 Implement page size selector dropdown
  - [ ] 2.1.5 Implement results count display (Showing X-Y of Z)
  - [ ] 2.1.6 Add keyboard navigation support (Tab, Enter, Arrow keys)
  - [ ] 2.1.7 Style with TailwindCSS for consistency
  - [ ] 2.1.8 Add ARIA labels for accessibility
  - _Validates: Requirements 1.2, 3.2, 8.2_

- [ ] 2.2 Add session storage for page size preference
  - [ ] 2.2.1 Create utility functions for session storage access
  - [ ] 2.2.2 Implement loadPageSize() function
  - [ ] 2.2.3 Implement savePageSize() function
  - [ ] 2.2.4 Add browser environment check
  - [ ] 2.2.5 Test storage persistence across page reloads
  - _Validates: Requirements 1.3_

- [ ] 2.3 Update PuppetReportsListView for pagination
  - [ ] 2.3.1 Add pagination state variables (currentPage, pageSize, totalCount, hasMore)
  - [ ] 2.3.2 Load page size from session storage on mount
  - [ ] 2.3.3 Implement handlePageChange() method
  - [ ] 2.3.4 Implement handlePageSizeChange() method
  - [ ] 2.3.5 Implement resetPagination() method
  - [ ] 2.3.6 Update fetchReports() to include offset parameter
  - [ ] 2.3.7 Extract pagination metadata from API response
  - [ ] 2.3.8 Add PaginationControls component to UI
  - [ ] 2.3.9 Show/hide pagination based on totalCount
  - [ ] 2.3.10 Add loading state during page transitions
  - _Validates: Requirements 1.1, 1.4, 3.1, 3.3, 3.4, 3.5_

- [ ] 2.4 Integrate pagination with filters
  - [ ] 2.4.1 Call resetPagination() when filters change
  - [ ] 2.4.2 Preserve pagination state when filters are unchanged
  - [ ] 2.4.3 Update URL query params with pagination state (optional)
  - [ ] 2.4.4 Test filter + pagination interactions
  - _Validates: Requirements 1.5_

- [ ] 2.5 Write unit tests for pagination frontend
  - [ ] 2.5.1 Test PaginationControls component rendering
  - [ ] 2.5.2 Test PaginationControls event emissions
  - [ ] 2.5.3 Test PaginationControls disabled states
  - [ ] 2.5.4 Test PuppetReportsListView pagination state management
  - [ ] 2.5.5 Test page size persistence
  - [ ] 2.5.6 Test pagination reset on filter change
  - _Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5_

### Phase 3: Node Detail Page Pagination

- [ ] 3.1 Update NodeDetailPage Puppet Reports tab
  - [ ] 3.1.1 Verify PuppetReportsListView is used in the tab
  - [ ] 3.1.2 Ensure pagination works with certname-specific reports
  - [ ] 3.1.3 Test pagination independence from global reports page
  - [ ] 3.1.4 Verify page size preference is shared
  - _Validates: Requirements 4.1, 4.2, 4.3_

### Phase 4: Debug Info Review - Puppet Page

- [ ] 4.1 Audit Puppet Run History chart
  - [ ] 4.1.1 Verify `/api/puppet/history` endpoint returns debug info
  - [ ] 4.1.2 Verify PuppetPage extracts and displays debug info
  - [ ] 4.1.3 Add onDebugInfo callback if missing
  - [ ] 4.1.4 Test debug info display with expert mode enabled
  - _Validates: Requirements 5.1_

- [ ] 4.2 Audit Reports tab
  - [ ] 4.2.1 Verify PuppetReportsListView passes debug info to parent
  - [ ] 4.2.2 Verify debug info includes pagination metadata
  - [ ] 4.2.3 Test debug info display for paginated requests
  - _Validates: Requirements 5.2_

- [ ] 4.3 Audit Environments tab
  - [ ] 4.3.1 Verify EnvironmentSelector component has onDebugInfo prop
  - [ ] 4.3.2 Verify component extracts debug info from API responses
  - [ ] 4.3.3 Verify component passes debug info to parent
  - [ ] 4.3.4 Add missing implementation if needed
  - [ ] 4.3.5 Test debug info display with expert mode enabled
  - _Validates: Requirements 5.3_

- [ ] 4.4 Audit Facts tab
  - [ ] 4.4.1 Verify GlobalFactsTab component has onDebugInfo prop
  - [ ] 4.4.2 Verify component extracts debug info from API responses
  - [ ] 4.4.3 Verify component passes debug info to parent
  - [ ] 4.4.4 Add missing implementation if needed
  - [ ] 4.4.5 Test debug info display with expert mode enabled
  - _Validates: Requirements 5.4_

- [ ] 4.5 Audit Status tab
  - [ ] 4.5.1 Verify PuppetserverStatus component has onDebugInfo prop
  - [ ] 4.5.2 Verify component extracts debug info from API responses
  - [ ] 4.5.3 Verify component passes debug info to parent
  - [ ] 4.5.4 Add missing implementation if needed
  - [ ] 4.5.5 Test debug info display with expert mode enabled
  - _Validates: Requirements 5.5_

- [ ] 4.6 Audit Admin tab
  - [ ] 4.6.1 Verify PuppetDBAdmin component has onDebugInfo prop
  - [ ] 4.6.2 Verify component extracts debug info from API responses
  - [ ] 4.6.3 Verify component passes debug info to parent
  - [ ] 4.6.4 Add missing implementation if needed
  - [ ] 4.6.5 Test debug info display with expert mode enabled
  - _Validates: Requirements 5.6_

- [ ] 4.7 Audit Hiera tab
  - [ ] 4.7.1 Verify GlobalHieraTab component has onDebugInfo prop
  - [ ] 4.7.2 Verify component extracts debug info from API responses
  - [ ] 4.7.3 Verify component passes debug info to parent
  - [ ] 4.7.4 Add missing implementation if needed
  - [ ] 4.7.5 Test debug info display with expert mode enabled
  - _Validates: Requirements 5.7_

- [ ] 4.8 Audit Code Analysis tab
  - [ ] 4.8.1 Verify CodeAnalysisTab component has onDebugInfo prop
  - [ ] 4.8.2 Verify component extracts debug info from API responses
  - [ ] 4.8.3 Verify component passes debug info to parent
  - [ ] 4.8.4 Add missing implementation if needed
  - [ ] 4.8.5 Test debug info display with expert mode enabled
  - _Validates: Requirements 5.8_

### Phase 5: Debug Info Review - Node Detail Page

- [ ] 5.1 Audit Node Status tab
  - [ ] 5.1.1 Identify all API calls in the tab
  - [ ] 5.1.2 Verify each component has onDebugInfo prop
  - [ ] 5.1.3 Verify debug info extraction from responses
  - [ ] 5.1.4 Verify debug info passed to NodeDetailPage
  - [ ] 5.1.5 Add missing implementations
  - [ ] 5.1.6 Test debug info display with expert mode enabled
  - _Validates: Requirements 6.1_

- [ ] 5.2 Audit Facts tab (multi-source)
  - [ ] 5.2.1 Verify MultiSourceFactsViewer component structure
  - [ ] 5.2.2 Implement labeled debug info for PuppetDB facts
  - [ ] 5.2.3 Implement labeled debug info for Bolt facts
  - [ ] 5.2.4 Update onDebugInfo callback to accept label parameter
  - [ ] 5.2.5 Verify NodeDetailPage handles multiple debug blocks
  - [ ] 5.2.6 Test debug info display for both sources
  - _Validates: Requirements 6.2, 6.8, 7.1, 7.2_

- [ ] 5.3 Audit Puppet Reports tab
  - [ ] 5.3.1 Verify PuppetReportsListView is used
  - [ ] 5.3.2 Verify debug info includes pagination metadata
  - [ ] 5.3.3 Verify debug info passed to NodeDetailPage
  - [ ] 5.3.4 Test debug info display with pagination
  - _Validates: Requirements 6.3_

- [ ] 5.4 Audit Managed Resources tab
  - [ ] 5.4.1 Verify ManagedResourcesViewer component has onDebugInfo prop
  - [ ] 5.4.2 Verify debug info extraction from API responses
  - [ ] 5.4.3 Verify debug info passed to NodeDetailPage
  - [ ] 5.4.4 Add missing implementations
  - [ ] 5.4.5 Test debug info display with expert mode enabled
  - _Validates: Requirements 6.4_

- [ ] 5.5 Audit Hiera tab
  - [ ] 5.5.1 Verify NodeHieraTab component has onDebugInfo prop
  - [ ] 5.5.2 Verify debug info extraction from API responses
  - [ ] 5.5.3 Verify debug info passed to NodeDetailPage
  - [ ] 5.5.4 Add missing implementations
  - [ ] 5.5.5 Test debug info display with expert mode enabled
  - _Validates: Requirements 6.5_

- [ ] 5.6 Audit Catalog tab
  - [ ] 5.6.1 Verify CatalogViewer component has onDebugInfo prop
  - [ ] 5.6.2 Verify debug info extraction from API responses
  - [ ] 5.6.3 Verify debug info passed to NodeDetailPage
  - [ ] 5.6.4 Add missing implementations
  - [ ] 5.6.5 Test debug info display with expert mode enabled
  - _Validates: Requirements 6.6_

- [ ] 5.7 Audit Events tab
  - [ ] 5.7.1 Verify EventsViewer component has onDebugInfo prop
  - [ ] 5.7.2 Verify debug info extraction from API responses
  - [ ] 5.7.3 Verify debug info passed to NodeDetailPage
  - [ ] 5.7.4 Add missing implementations
  - [ ] 5.7.5 Test debug info display with expert mode enabled
  - _Validates: Requirements 6.7_

### Phase 6: Debug Info Aggregation Enhancement

- [ ] 6.1 Update ExpertModeDebugPanel for multiple blocks
  - [ ] 6.1.1 Verify component supports array of debug info blocks
  - [ ] 6.1.2 Add block labels to UI
  - [ ] 6.1.3 Display blocks in chronological order
  - [ ] 6.1.4 Test with multiple debug blocks
  - _Validates: Requirements 7.1, 7.2, 7.3, 7.4_

- [ ] 6.2 Update parent pages for labeled debug info
  - [ ] 6.2.1 Update handleDebugInfo to accept label parameter
  - [ ] 6.2.2 Update all child component calls to include labels
  - [ ] 6.2.3 Test debug info aggregation with multiple sources
  - _Validates: Requirements 7.1, 7.2_

### Phase 7: Integration Testing

- [ ] 7.1 Test pagination with filters
  - [ ] 7.1.1 Apply filters, verify pagination resets to page 1
  - [ ] 7.1.2 Navigate pages, apply filters, verify reset
  - [ ] 7.1.3 Change page size, apply filters, verify behavior
  - [ ] 7.1.4 Test with various filter combinations
  - _Validates: Requirements 1.5, 3.5_

- [ ] 7.2 Test pagination performance
  - [ ] 7.2.1 Test with 100 reports (single page)
  - [ ] 7.2.2 Test with 1,000 reports (10 pages at size 100)
  - [ ] 7.2.3 Test with 10,000 reports (100 pages at size 100)
  - [ ] 7.2.4 Measure page transition times
  - [ ] 7.2.5 Verify memory usage remains stable
  - _Validates: Requirements 8.1, 8.2, 8.3, 8.4_

- [ ] 7.3 Test debug info across all tabs
  - [ ] 7.3.1 Enable expert mode
  - [ ] 7.3.2 Visit each Puppet Page tab, verify debug info
  - [ ] 7.3.3 Visit each Node Detail Page tab, verify debug info
  - [ ] 7.3.4 Test multi-source debug info (Facts tab)
  - [ ] 7.3.5 Verify debug info clears when switching tabs
  - _Validates: Requirements 5.1-5.8, 6.1-6.8_

- [ ] 7.4 Test keyboard navigation
  - [ ] 7.4.1 Tab through pagination controls
  - [ ] 7.4.2 Use Enter to activate buttons
  - [ ] 7.4.3 Use Arrow keys in page size dropdown
  - [ ] 7.4.4 Verify focus indicators are visible
  - _Validates: Requirements 3.2, 8.2_

- [ ] 7.5 Test accessibility
  - [ ] 7.5.1 Run automated accessibility tests (axe-core)
  - [ ] 7.5.2 Test with screen reader (NVDA/JAWS)
  - [ ] 7.5.3 Verify ARIA labels are correct
  - [ ] 7.5.4 Verify color contrast meets WCAG AA
  - _Validates: Requirements 8.2_

- [ ] 7.6 Cross-browser testing
  - [ ] 7.6.1 Test pagination in Chrome
  - [ ] 7.6.2 Test pagination in Firefox
  - [ ] 7.6.3 Test pagination in Safari
  - [ ] 7.6.4 Test pagination in Edge
  - [ ] 7.6.5 Test debug info display in all browsers
  - _Validates: Requirements 8.4_

### Phase 8: Documentation & Cleanup

- [ ] 8.1 Update user documentation
  - [ ] 8.1.1 Document pagination controls usage
  - [ ] 8.1.2 Document page size options
  - [ ] 8.1.3 Add screenshots of pagination UI
  - [ ] 8.1.4 Document expert mode debug info in all tabs

- [ ] 8.2 Update API documentation
  - [ ] 8.2.1 Document new query parameters (offset)
  - [ ] 8.2.2 Document pagination response format
  - [ ] 8.2.3 Add examples of paginated requests

- [ ] 8.3 Code cleanup
  - [ ] 8.3.1 Remove any debug console.log statements
  - [ ] 8.3.2 Ensure consistent code formatting
  - [ ] 8.3.3 Add JSDoc comments to new functions
  - [ ] 8.3.4 Remove unused imports

- [ ] 8.4 Final verification
  - [ ] 8.4.1 Run full test suite
  - [ ] 8.4.2 Verify no regressions in existing functionality
  - [ ] 8.4.3 Verify all acceptance criteria are met
  - [ ] 8.4.4 Get user approval for deployment

## Task Dependencies

```
Phase 1 (Backend) → Phase 2 (Frontend Components)
Phase 2 → Phase 3 (Node Detail)
Phase 1, 2, 3 → Phase 4, 5 (Debug Review)
Phase 4, 5 → Phase 6 (Debug Aggregation)
All Phases → Phase 7 (Integration Testing)
Phase 7 → Phase 8 (Documentation)
```

## Estimated Effort

- Phase 1: 4-6 hours
- Phase 2: 6-8 hours
- Phase 3: 2-3 hours
- Phase 4: 4-6 hours
- Phase 5: 6-8 hours
- Phase 6: 2-3 hours
- Phase 7: 4-6 hours
- Phase 8: 2-3 hours

**Total: 30-43 hours**

## Success Criteria

- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] Pagination works smoothly with 10,000+ reports
- [ ] Page transitions complete within 500ms
- [ ] All Puppet Page tabs display debug info correctly
- [ ] All Node Detail Page tabs display debug info correctly
- [ ] Multi-source debug info displays correctly
- [ ] Keyboard navigation works throughout
- [ ] Accessibility tests pass
- [ ] Cross-browser compatibility verified
- [ ] User documentation updated
- [ ] No regressions in existing functionality
