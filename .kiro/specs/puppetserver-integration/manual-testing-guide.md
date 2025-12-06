# Manual Testing Guide for Pabawi v0.3.0

## Overview

This guide provides comprehensive manual testing procedures for Pabawi v0.3.0 with real Puppetserver, PuppetDB, and Bolt instances. Follow these test cases to verify all functionality works correctly before marking the release as complete.

## Prerequisites

Before starting manual testing, ensure you have:

1. **Real Puppetserver Instance**
   - Running and accessible
   - Certificate authority configured
   - At least 2-3 nodes with signed certificates
   - At least 1 pending certificate request
   - Multiple environments configured

2. **Real PuppetDB Instance**
   - Running and accessible
   - Connected to Puppetserver
   - Contains recent reports from nodes
   - Has catalog data for nodes
   - Contains events data

3. **Bolt Inventory**
   - Valid `inventory.yaml` with at least 2-3 targets
   - SSH access configured
   - Targets are reachable

4. **Pabawi Configuration**
   - All three integrations enabled in `backend/.env`
   - Valid authentication credentials
   - SSL certificates configured (if required)

## Test Environment Setup

### 1. Configure Backend Environment

Create or update `backend/.env`:

```env
# Server Configuration
PORT=3000
HOST=localhost
LOG_LEVEL=debug
DATABASE_PATH=./data/executions.db

# Bolt Configuration
BOLT_PROJECT_PATH=./bolt-project
COMMAND_WHITELIST_ALLOW_ALL=false
COMMAND_WHITELIST=["ls","pwd","whoami","cat","hostname"]
EXECUTION_TIMEOUT=300000

# PuppetDB Configuration
PUPPETDB_ENABLED=true
PUPPETDB_SERVER_URL=https://your-puppetdb.example.com
PUPPETDB_PORT=8081
PUPPETDB_TOKEN=your-puppetdb-token
PUPPETDB_SSL_ENABLED=true
PUPPETDB_SSL_CA=/path/to/puppetdb-ca.pem
PUPPETDB_SSL_CERT=/path/to/puppetdb-cert.pem
PUPPETDB_SSL_KEY=/path/to/puppetdb-key.pem
PUPPETDB_SSL_REJECT_UNAUTHORIZED=true
PUPPETDB_TIMEOUT=30000
PUPPETDB_RETRY_ATTEMPTS=3

# Puppetserver Configuration
PUPPETSERVER_ENABLED=true
PUPPETSERVER_SERVER_URL=https://your-puppetserver.example.com
PUPPETSERVER_PORT=8140
PUPPETSERVER_TOKEN=your-puppetserver-token
PUPPETSERVER_SSL_ENABLED=true
PUPPETSERVER_SSL_CA=/path/to/puppetserver-ca.pem
PUPPETSERVER_SSL_CERT=/path/to/puppetserver-cert.pem
PUPPETSERVER_SSL_KEY=/path/to/puppetserver-key.pem
PUPPETSERVER_SSL_REJECT_UNAUTHORIZED=true
PUPPETSERVER_TIMEOUT=30000
PUPPETSERVER_RETRY_ATTEMPTS=3
PUPPETSERVER_INACTIVITY_THRESHOLD=3600
PUPPETSERVER_CACHE_TTL=300000
```

### 2. Start Application

```bash
# Terminal 1: Start backend
cd backend
npm run dev

# Terminal 2: Start frontend
cd frontend
npm run dev
```

### 3. Access Application

- Frontend: <http://localhost:5173>
- Backend API: <http://localhost:3000/api>

## Test Cases

### Phase 1: Integration Status and Health Checks

#### Test 1.1: Verify All Integrations Are Connected

**Steps:**

1. Navigate to Home page
2. Locate Integration Status section

**Expected Results:**

- ✅ Bolt integration shows "Connected" with green indicator
- ✅ PuppetDB integration shows "Connected" with green indicator
- ✅ Puppetserver integration shows "Connected" with green indicator
- ✅ Each integration displays version information
- ✅ Last check timestamp is recent

**Actual Results:**

- [ ] Pass
- [ ] Fail - Details: _______________

---

#### Test 1.2: Verify Integration Health Check API

**Steps:**

1. Open browser developer console
2. Navigate to Network tab
3. Refresh Home page
4. Find request to `/api/integrations/status`

**Expected Results:**

- ✅ API returns 200 status code
- ✅ Response includes all three integrations
- ✅ Each integration has `status: "connected"` or appropriate status
- ✅ Response includes health check details

**Actual Results:**

- [ ] Pass
- [ ] Fail - Details: _______________

---

### Phase 2: Inventory Integration Testing

#### Test 2.1: Multi-Source Inventory Display

**Steps:**

1. Navigate to Inventory page
2. Observe the node list

**Expected Results:**

- ✅ Nodes from Bolt inventory are displayed
- ✅ Nodes from PuppetDB are displayed
- ✅ Nodes from Puppetserver CA are displayed
- ✅ Each node shows source badge(s) (Bolt, PuppetDB, Puppetserver)
- ✅ Nodes appearing in multiple sources show multiple badges
- ✅ Certificate status is displayed for Puppetserver nodes

**Actual Results:**

- [ ] Pass
- [ ] Fail - Details: _______________

---

#### Test 2.2: Node Linking Across Sources

**Steps:**

1. On Inventory page, identify a node that exists in multiple sources
2. Note the certname/hostname
3. Click on the node to view details

**Expected Results:**

- ✅ Node detail page shows data from all sources
- ✅ Facts tab shows facts from multiple sources with timestamps
- ✅ Source attribution is clear for each piece of data
- ✅ No duplicate information

**Actual Results:**

- [ ] Pass
- [ ] Fail - Details: _______________

---

#### Test 2.3: Inventory Filtering by Source

**Steps:**

1. On Inventory page, locate source filter dropdown
2. Select "Puppetserver" only
3. Observe filtered results
4. Select "PuppetDB" only
5. Select "All Sources"

**Expected Results:**

- ✅ Filtering by Puppetserver shows only Puppetserver nodes
- ✅ Filtering by PuppetDB shows only PuppetDB nodes
- ✅ "All Sources" shows all nodes
- ✅ Node count updates correctly with each filter

**Actual Results:**

- [ ] Pass
- [ ] Fail - Details: _______________

---

### Phase 3: Puppetserver Certificate Management

#### Test 3.1: View Certificates List

**Steps:**

1. Navigate to Puppet page
2. Click on Certificates section

**Expected Results:**

- ✅ All certificates are displayed
- ✅ Certificate status is shown (signed, requested, revoked)
- ✅ Certname, fingerprint, and expiration date are visible
- ✅ Signed certificates show expiration dates
- ✅ Requested certificates show "Sign" button
- ✅ Signed certificates show "Revoke" button

**Actual Results:**

- [ ] Pass
- [ ] Fail - Details: _______________

---

#### Test 3.2: Sign Certificate Request

**Prerequisites:** At least one pending certificate request

**Steps:**

1. On Certificates page, find a certificate with "requested" status
2. Click "Sign" button
3. Confirm the action in dialog
4. Wait for operation to complete

**Expected Results:**

- ✅ Success message is displayed
- ✅ Certificate status changes to "signed"
- ✅ Certificate list refreshes automatically
- ✅ Expiration date is now visible
- ✅ "Sign" button is replaced with "Revoke" button

**Actual Results:**

- [ ] Pass
- [ ] Fail - Details: _______________

---

#### Test 3.3: Revoke Certificate (Optional - Use with Caution)

**Prerequisites:** A test certificate that can be safely revoked

**Steps:**

1. On Certificates page, find a signed certificate
2. Click "Revoke" button
3. Confirm the action in dialog
4. Wait for operation to complete

**Expected Results:**

- ✅ Success message is displayed
- ✅ Certificate status changes to "revoked"
- ✅ Certificate list refreshes automatically
- ✅ Certificate is marked as revoked

**Actual Results:**

- [ ] Pass
- [ ] Fail - Details: _______________
- [ ] Skipped - Reason: _______________

---

#### Test 3.4: Certificate Search and Filter

**Steps:**

1. On Certificates page, use search box
2. Enter partial certname
3. Observe filtered results
4. Use status filter dropdown
5. Select "Signed" only
6. Select "Requested" only

**Expected Results:**

- ✅ Search filters certificates by certname
- ✅ Search is case-insensitive
- ✅ Status filter shows only matching certificates
- ✅ Filters can be combined
- ✅ Clear filter button works

**Actual Results:**

- [ ] Pass
- [ ] Fail - Details: _______________

---

### Phase 4: Puppetserver Node Status and Facts

#### Test 4.1: View Node Status from Puppetserver

**Steps:**

1. Navigate to Inventory page
2. Click on a node that exists in Puppetserver
3. Navigate to Puppet tab
4. Click on "Node Status" sub-tab

**Expected Results:**

- ✅ Node status is displayed without errors
- ✅ Last check-in timestamp is shown
- ✅ Catalog version is displayed
- ✅ Latest report status is shown (unchanged/changed/failed)
- ✅ Environment information is visible
- ✅ No "node not found" errors

**Actual Results:**

- [ ] Pass
- [ ] Fail - Details: _______________

---

#### Test 4.2: View Facts from Puppetserver

**Steps:**

1. On node detail page, navigate to Facts tab
2. Observe facts display

**Expected Results:**

- ✅ Facts from Puppetserver are displayed
- ✅ Facts are organized by category
- ✅ Source is clearly labeled as "Puppetserver"
- ✅ Timestamp is shown
- ✅ If node also exists in PuppetDB, both fact sources are shown
- ✅ YAML export option is available

**Actual Results:**

- [ ] Pass
- [ ] Fail - Details: _______________

---

### Phase 5: Puppetserver Environments and Catalogs

#### Test 5.1: View Environments List

**Steps:**

1. Navigate to Puppet page
2. Click on Environments section

**Expected Results:**

- ✅ Real environments are displayed (not fake "environment 1", "environment 2")
- ✅ Environment names match Puppetserver configuration
- ✅ At least "production" environment is shown
- ✅ Environment metadata is displayed (if available)
- ✅ No errors are shown

**Actual Results:**

- [ ] Pass
- [ ] Fail - Details: _______________

---

#### Test 5.2: Compile Catalog for Node

**Steps:**

1. Navigate to node detail page
2. Go to Puppet tab
3. Click on "Catalog Compilation" sub-tab
4. Select an environment from dropdown
5. Click "Compile Catalog" button
6. Wait for compilation to complete

**Expected Results:**

- ✅ Environment dropdown shows real environments
- ✅ Catalog compiles successfully
- ✅ Resources are displayed in structured format
- ✅ Resource types, titles, and parameters are visible
- ✅ Compilation timestamp is shown
- ✅ Environment name is displayed
- ✅ If compilation fails, detailed error messages are shown

**Actual Results:**

- [ ] Pass
- [ ] Fail - Details: _______________

---

#### Test 5.3: Compare Catalogs Between Environments

**Steps:**

1. On Catalog Compilation sub-tab
2. Select first environment
3. Click "Compare with another environment"
4. Select second environment
5. Click "Compare" button
6. Wait for comparison to complete

**Expected Results:**

- ✅ Both catalogs compile successfully
- ✅ Diff is displayed showing:
  - Added resources
  - Removed resources
  - Modified resources with parameter changes
  - Unchanged resources count
- ✅ Changes are highlighted
- ✅ Resource details are expandable

**Actual Results:**

- [ ] Pass
- [ ] Fail - Details: _______________

---

### Phase 6: PuppetDB Reports and Metrics

#### Test 6.1: View Puppet Reports List

**Steps:**

1. Navigate to node detail page
2. Go to Puppet tab
3. Click on "Puppet Reports" sub-tab

**Expected Results:**

- ✅ Reports are displayed in chronological order
- ✅ Metrics show correct values (not "0 0 0")
- ✅ Changed resource count is accurate
- ✅ Unchanged resource count is accurate
- ✅ Failed resource count is accurate
- ✅ Report status is shown (success/failure/noop)
- ✅ Timestamps are displayed
- ✅ Environment is shown

**Actual Results:**

- [ ] Pass
- [ ] Fail - Details: _______________

---

#### Test 6.2: View Report Details

**Steps:**

1. On Puppet Reports sub-tab
2. Click on a report to expand details
3. Review resource changes

**Expected Results:**

- ✅ Report details expand inline
- ✅ Resource changes are listed
- ✅ Each resource shows:
  - Resource type and title
  - Status (changed/unchanged/failed)
  - Old and new values (for changed resources)
  - Error messages (for failed resources)
- ✅ Metrics summary is accurate

**Actual Results:**

- [ ] Pass
- [ ] Fail - Details: _______________

---

#### Test 6.3: View Puppet Reports Summary on Home Page

**Steps:**

1. Navigate to Home page
2. Locate Puppet Reports Summary component

**Expected Results:**

- ✅ Component is displayed when PuppetDB is active
- ✅ Shows total reports count
- ✅ Shows failed reports count
- ✅ Shows changed reports count
- ✅ Shows unchanged reports count
- ✅ "View Details" link navigates to Puppet page
- ✅ Metrics are accurate

**Actual Results:**

- [ ] Pass
- [ ] Fail - Details: _______________

---

### Phase 7: PuppetDB Catalog and Resources

#### Test 7.1: View Catalog from PuppetDB

**Steps:**

1. Navigate to node detail page
2. Go to Puppet tab
3. Click on "Catalog" sub-tab

**Expected Results:**

- ✅ Catalog is displayed (not empty)
- ✅ All resources are shown
- ✅ Resources are grouped by type
- ✅ Resource titles and parameters are visible
- ✅ Resource count is accurate
- ✅ Catalog timestamp is shown

**Actual Results:**

- [ ] Pass
- [ ] Fail - Details: _______________

---

#### Test 7.2: View Managed Resources

**Steps:**

1. On Puppet tab
2. Click on "Managed Resources" sub-tab

**Expected Results:**

- ✅ Resources are displayed grouped by type
- ✅ Resource types are listed (File, Package, Service, etc.)
- ✅ Clicking on a type expands to show resources
- ✅ Resource details include title and parameters
- ✅ Resource count per type is shown

**Actual Results:**

- [ ] Pass
- [ ] Fail - Details: _______________

---

### Phase 8: PuppetDB Events

#### Test 8.1: View Events Page

**Steps:**

1. Navigate to node detail page
2. Go to Puppet tab
3. Click on "Events" sub-tab
4. Wait for events to load

**Expected Results:**

- ✅ Page loads without hanging
- ✅ Events are displayed
- ✅ Loading indicator is shown while fetching
- ✅ Events are paginated or lazy-loaded
- ✅ Each event shows:
  - Resource type and title
  - Status (success/failure/noop)
  - Timestamp
  - Message
- ✅ Events can be filtered by status

**Actual Results:**

- [ ] Pass
- [ ] Fail - Details: _______________

---

#### Test 8.2: Events Page Performance

**Steps:**

1. On Events sub-tab
2. Scroll through events list
3. Apply filters
4. Observe performance

**Expected Results:**

- ✅ Page remains responsive
- ✅ No browser freezing
- ✅ Scrolling is smooth
- ✅ Filters apply quickly
- ✅ Pagination works correctly

**Actual Results:**

- [ ] Pass
- [ ] Fail - Details: _______________

---

### Phase 9: Bolt Integration and Execution

#### Test 9.1: Execute Command via Bolt

**Steps:**

1. Navigate to Inventory page
2. Click on a Bolt target
3. Go to Actions tab
4. Enter command: `hostname`
5. Click "Execute Command"
6. Wait for execution to complete

**Expected Results:**

- ✅ Command executes successfully
- ✅ Output is displayed in real-time
- ✅ Exit code is shown
- ✅ Execution is saved to history
- ✅ Re-execute button is available

**Actual Results:**

- [ ] Pass
- [ ] Fail - Details: _______________

---

#### Test 9.2: Execute Bolt Task

**Steps:**

1. On node detail page, Actions tab
2. Select a task from dropdown
3. Fill in required parameters
4. Click "Execute Task"
5. Wait for execution to complete

**Expected Results:**

- ✅ Task executes successfully
- ✅ Output is displayed
- ✅ Task result is shown
- ✅ Execution is saved to history

**Actual Results:**

- [ ] Pass
- [ ] Fail - Details: _______________

---

#### Test 9.3: Gather Facts via Bolt

**Steps:**

1. On node detail page, Actions tab
2. Click "Gather Facts" button
3. Wait for facts to be collected

**Expected Results:**

- ✅ Facts are gathered successfully
- ✅ Facts tab updates with new data
- ✅ Bolt is shown as source
- ✅ Timestamp is current

**Actual Results:**

- [ ] Pass
- [ ] Fail - Details: _______________

---

### Phase 10: Expert Mode Testing

#### Test 10.1: Enable Expert Mode

**Steps:**

1. Locate Expert Mode toggle in navigation
2. Enable Expert Mode
3. Navigate through different pages

**Expected Results:**

- ✅ Toggle switches to enabled state
- ✅ Preference is persisted across page refreshes
- ✅ All components show enhanced information

**Actual Results:**

- [ ] Pass
- [ ] Fail - Details: _______________

---

#### Test 10.2: Expert Mode - Command Execution

**Steps:**

1. Ensure Expert Mode is enabled
2. Execute a command on a node
3. View execution results

**Expected Results:**

- ✅ Complete command line is displayed
- ✅ Full stdout is shown (not truncated)
- ✅ Full stderr is shown (not truncated)
- ✅ Command can be copied
- ✅ Search functionality works in output

**Actual Results:**

- [ ] Pass
- [ ] Fail - Details: _______________

---

#### Test 10.3: Expert Mode - API Details

**Steps:**

1. With Expert Mode enabled
2. Open browser developer console
3. Navigate to different pages
4. Observe API calls

**Expected Results:**

- ✅ API endpoint information is visible in UI
- ✅ Request details are shown
- ✅ Response details are shown
- ✅ Troubleshooting hints are displayed
- ✅ Setup instructions are shown where applicable

**Actual Results:**

- [ ] Pass
- [ ] Fail - Details: _______________

---

### Phase 11: Error Handling and Graceful Degradation

#### Test 11.1: PuppetDB Disconnection

**Steps:**

1. Stop PuppetDB service or block network access
2. Refresh Pabawi application
3. Navigate through pages

**Expected Results:**

- ✅ Application continues to function
- ✅ PuppetDB integration shows "Disconnected"
- ✅ Bolt and Puppetserver data still available
- ✅ Error messages are clear and actionable
- ✅ No application crashes

**Actual Results:**

- [ ] Pass
- [ ] Fail - Details: _______________

---

#### Test 11.2: Puppetserver Disconnection

**Steps:**

1. Stop Puppetserver service or block network access
2. Refresh Pabawi application
3. Navigate through pages

**Expected Results:**

- ✅ Application continues to function
- ✅ Puppetserver integration shows "Disconnected"
- ✅ Bolt and PuppetDB data still available
- ✅ Error messages are clear and actionable
- ✅ No application crashes

**Actual Results:**

- [ ] Pass
- [ ] Fail - Details: _______________

---

#### Test 11.3: Invalid Configuration

**Steps:**

1. Modify `backend/.env` with invalid credentials
2. Restart backend
3. Observe behavior

**Expected Results:**

- ✅ Application starts successfully
- ✅ Affected integration shows authentication error
- ✅ Error message includes troubleshooting guidance
- ✅ Other integrations continue to work
- ✅ Logs contain detailed error information

**Actual Results:**

- [ ] Pass
- [ ] Fail - Details: _______________

---

### Phase 12: UI Navigation and Layout

#### Test 12.1: Top Navigation Structure

**Steps:**

1. Observe top navigation bar

**Expected Results:**

- ✅ Navigation shows: Home, Inventory, Executions, Puppet
- ✅ Certificates is NOT in top navigation (moved to Puppet page)
- ✅ All links work correctly
- ✅ Active page is highlighted

**Actual Results:**

- [ ] Pass
- [ ] Fail - Details: _______________

---

#### Test 12.2: Node Detail Page Tab Structure

**Steps:**

1. Navigate to any node detail page
2. Observe tab structure

**Expected Results:**

- ✅ Four main tabs: Overview, Facts, Actions, Puppet
- ✅ Overview tab shows:
  - General node info
  - Latest Puppet runs (if PuppetDB active)
  - Latest executions
- ✅ Facts tab shows multi-source facts
- ✅ Actions tab shows:
  - Install Software (not "Install packages")
  - Execute Commands
  - Execute Task
  - Execution History
- ✅ Puppet tab has sub-tabs:
  - Certificate Status
  - Node Status
  - Catalog Compilation
  - Puppet Reports
  - Catalog
  - Events
  - Managed Resources

**Actual Results:**

- [ ] Pass
- [ ] Fail - Details: _______________

---

#### Test 12.3: Puppet Page Structure

**Steps:**

1. Navigate to Puppet page

**Expected Results:**

- ✅ Page displays when any Puppet integration is active
- ✅ Environments section is visible
- ✅ Reports section shows all node reports
- ✅ Certificates section is present (moved from top nav)
- ✅ Puppetserver Status components (if Puppetserver active):
  - Services status
  - Simple status
  - Admin API info
  - Metrics (with performance warning)
- ✅ PuppetDB Admin components (if PuppetDB active):
  - Archive info
  - Summary stats (with performance warning)

**Actual Results:**

- [ ] Pass
- [ ] Fail - Details: _______________

---

### Phase 13: Performance Testing

#### Test 13.1: Large Inventory Performance

**Prerequisites:** Inventory with 100+ nodes

**Steps:**

1. Navigate to Inventory page
2. Observe load time
3. Scroll through list
4. Apply filters
5. Search for nodes

**Expected Results:**

- ✅ Page loads in < 3 seconds
- ✅ Scrolling is smooth
- ✅ Filters apply in < 1 second
- ✅ Search results appear in < 1 second
- ✅ No browser freezing

**Actual Results:**

- [ ] Pass
- [ ] Fail - Details: _______________

---

#### Test 13.2: Large Catalog Performance

**Prerequisites:** Node with large catalog (500+ resources)

**Steps:**

1. Navigate to node with large catalog
2. View Catalog sub-tab
3. Expand resource groups
4. Search within catalog

**Expected Results:**

- ✅ Catalog loads in < 5 seconds
- ✅ Resource groups expand quickly
- ✅ Search works efficiently
- ✅ No browser freezing

**Actual Results:**

- [ ] Pass
- [ ] Fail - Details: _______________

---

#### Test 13.3: Events Page with Large Dataset

**Prerequisites:** Node with 1000+ events

**Steps:**

1. Navigate to Events sub-tab for node with many events
2. Observe load time
3. Scroll through events
4. Apply filters

**Expected Results:**

- ✅ Page loads without hanging
- ✅ Pagination or lazy loading works
- ✅ Scrolling is smooth
- ✅ Filters apply quickly
- ✅ No browser freezing

**Actual Results:**

- [ ] Pass
- [ ] Fail - Details: _______________

---

### Phase 14: Re-execution Testing

#### Test 14.1: Re-execute Command

**Steps:**

1. Navigate to Executions page
2. Find a completed command execution
3. Click "Re-execute" button
4. Observe pre-filled parameters
5. Click "Execute"

**Expected Results:**

- ✅ Re-execute button is available
- ✅ Command is pre-filled
- ✅ Target is pre-selected
- ✅ Parameters can be modified
- ✅ Execution completes successfully
- ✅ New execution is linked to original

**Actual Results:**

- [ ] Pass
- [ ] Fail - Details: _______________

---

#### Test 14.2: Re-execute Task

**Steps:**

1. Navigate to Executions page
2. Find a completed task execution
3. Click "Re-execute" button
4. Observe pre-filled parameters
5. Modify a parameter
6. Click "Execute"

**Expected Results:**

- ✅ Re-execute button is available
- ✅ Task is pre-selected
- ✅ Parameters are pre-filled
- ✅ Parameters can be modified
- ✅ Execution completes successfully
- ✅ New execution is linked to original

**Actual Results:**

- [ ] Pass
- [ ] Fail - Details: _______________

---

### Phase 15: Logging and Debugging

#### Test 15.1: Backend Logging

**Steps:**

1. Set `LOG_LEVEL=debug` in `backend/.env`
2. Restart backend
3. Perform various operations
4. Review backend console logs

**Expected Results:**

- ✅ All API requests are logged
- ✅ Request details include method, endpoint, parameters
- ✅ Response details include status, headers, body
- ✅ Authentication details are logged (without sensitive data)
- ✅ Correlation IDs are present
- ✅ Error details are comprehensive

**Actual Results:**

- [ ] Pass
- [ ] Fail - Details: _______________

---

#### Test 15.2: Frontend Error Display

**Steps:**

1. Trigger various error conditions:
   - Invalid command
   - Network timeout
   - Authentication failure
   - API error
2. Observe error messages

**Expected Results:**

- ✅ Error messages are user-friendly
- ✅ Actionable guidance is provided
- ✅ Error type is clearly indicated
- ✅ Technical details available in console
- ✅ Errors don't crash the application

**Actual Results:**

- [ ] Pass
- [ ] Fail - Details: _______________

---

## Issue Tracking

### Critical Issues Found

| Issue # | Description | Severity | Status | Notes |
|---------|-------------|----------|--------|-------|
| 1 | | Critical/High/Medium/Low | Open/Fixed | |
| 2 | | Critical/High/Medium/Low | Open/Fixed | |
| 3 | | Critical/High/Medium/Low | Open/Fixed | |

### Minor Issues Found

| Issue # | Description | Severity | Status | Notes |
|---------|-------------|----------|--------|-------|
| 1 | | Low | Open/Fixed | |
| 2 | | Low | Open/Fixed | |

### Enhancement Suggestions

| Suggestion # | Description | Priority | Notes |
|--------------|-------------|----------|-------|
| 1 | | High/Medium/Low | |
| 2 | | High/Medium/Low | |

## Test Summary

### Overall Results

- **Total Test Cases:** 45
- **Passed:** ___
- **Failed:** ___
- **Skipped:** ___
- **Pass Rate:** ___%

### Integration Status

| Integration | Status | Notes |
|-------------|--------|-------|
| Bolt | ✅ / ❌ | |
| PuppetDB | ✅ / ❌ | |
| Puppetserver | ✅ / ❌ | |

### Critical Functionality

| Feature | Status | Notes |
|---------|--------|-------|
| Multi-source inventory | ✅ / ❌ | |
| Certificate management | ✅ / ❌ | |
| Node status and facts | ✅ / ❌ | |
| Catalog compilation | ✅ / ❌ | |
| Reports and metrics | ✅ / ❌ | |
| Events viewing | ✅ / ❌ | |
| Command execution | ✅ / ❌ | |
| Expert mode | ✅ / ❌ | |
| Error handling | ✅ / ❌ | |

### Performance Assessment

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Inventory load time | < 3s | ___ | ✅ / ❌ |
| Catalog load time | < 5s | ___ | ✅ / ❌ |
| Events page load | < 5s | ___ | ✅ / ❌ |
| API response time | < 2s | ___ | ✅ / ❌ |

## Sign-off

### Tester Information

- **Tester Name:** _______________
- **Date:** _______________
- **Environment:** _______________
- **Pabawi Version:** 0.3.0

### Approval

- [ ] All critical tests passed
- [ ] All high-priority issues documented
- [ ] Performance meets requirements
- [ ] Ready for release

**Signature:** _______________
**Date:** _______________

## Notes and Observations

### General Observations

---

### Recommendations

---

### Next Steps

---
