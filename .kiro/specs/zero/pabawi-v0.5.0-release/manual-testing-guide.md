# Manual Testing Guide: Expert Mode Debug Info Attachment

## Overview

This guide provides comprehensive manual testing procedures to verify that all backend routes properly attach debug information to error responses when expert mode is enabled.

## Testing Objectives

1. Verify all routes attach `_debug` field to error responses when expert mode is enabled
2. Verify external API errors (PuppetDB, PuppetServer, Bolt, Hiera) are captured in debug info
3. Verify debug info includes all required fields (errors, warnings, info, performance metrics)
4. Verify debug info is NOT included when expert mode is disabled

## Prerequisites

- Backend server running locally or in test environment
- Access to curl or similar HTTP client
- PuppetDB, PuppetServer, Bolt, and Hiera integrations configured (or intentionally misconfigured for error testing)

## Test Environment Setup

### Option 1: Using Misconfigured Integrations (Recommended)

Temporarily misconfigure integrations to trigger errors:

```bash
# Edit backend/.env to use invalid endpoints
PUPPETDB_URL=http://invalid-puppetdb:8080
PUPPETSERVER_URL=http://invalid-puppetserver:8140
BOLT_PROJECT_DIR=/invalid/path
```

### Option 2: Using Network Simulation

Use tools like `toxiproxy` or `iptables` to simulate network failures.

### Option 3: Using Mock Servers

Set up mock servers that return specific error responses.

## Testing Methodology

For each route, we will:

1. Make a request with expert mode ENABLED and trigger an error
2. Verify the response includes `_debug` field with error details
3. Make a request with expert mode DISABLED and trigger an error
4. Verify the response does NOT include `_debug` field

## Route Categories and Test Cases

### Category 1: Inventory Routes (3 routes)

#### Test 1.1: GET /api/inventory (with error)

**Expert Mode Enabled:**

```bash
curl -X GET "http://localhost:3000/api/inventory" \
  -H "X-Expert-Mode: true" \
  -H "X-Correlation-ID: test-inv-001"
```

**Expected Response (Error Case):**

```json
{
  "error": "Failed to load inventory",
  "_debug": {
    "timestamp": "2026-01-19T...",
    "requestId": "...",
    "correlationId": "test-inv-001",
    "operation": "getInventory",
    "duration": 123,
    "errors": [
      {
        "message": "Bolt service error: ...",
        "level": "error",
        "stack": "..."
      }
    ],
    "warnings": [],
    "info": [],
    "performance": { ... }
  }
}
```

**Expert Mode Disabled:**

```bash
curl -X GET "http://localhost:3000/api/inventory"
```

**Expected Response (Error Case):**

```json
{
  "error": "Failed to load inventory"
}
```

Note: No `_debug` field should be present.

**Verification Checklist:**

- [ ] Error response includes `_debug` field when expert mode enabled
- [ ] `_debug.errors` array contains error details
- [ ] `_debug.correlationId` matches request header
- [ ] Error response does NOT include `_debug` when expert mode disabled

---

#### Test 1.2: GET /api/inventory/sources

**Expert Mode Enabled:**

```bash
curl -X GET "http://localhost:3000/api/inventory/sources" \
  -H "X-Expert-Mode: true" \
  -H "X-Correlation-ID: test-inv-002"
```

**Verification Checklist:**

- [ ] Error response includes `_debug` field when expert mode enabled
- [ ] External API errors are captured in `_debug.errors`
- [ ] Error response does NOT include `_debug` when expert mode disabled

---

#### Test 1.3: GET /api/inventory/:id

**Expert Mode Enabled:**

```bash
curl -X GET "http://localhost:3000/api/inventory/nonexistent-node" \
  -H "X-Expert-Mode: true" \
  -H "X-Correlation-ID: test-inv-003"
```

**Verification Checklist:**

- [ ] 404 error response includes `_debug` field when expert mode enabled
- [ ] `_debug.errors` contains "Node not found" error
- [ ] Error response does NOT include `_debug` when expert mode disabled

---

### Category 2: PuppetDB Routes (11 routes)

#### Test 2.1: GET /api/integrations/puppetdb/nodes

**Expert Mode Enabled:**

```bash
curl -X GET "http://localhost:3000/api/integrations/puppetdb/nodes" \
  -H "X-Expert-Mode: true" \
  -H "X-Correlation-ID: test-pdb-001"
```

**Verification Checklist:**

- [ ] Connection error includes `_debug` field
- [ ] `_debug.errors` contains PuppetDB connection details
- [ ] Error message includes endpoint URL and error type

---

#### Test 2.2: GET /api/integrations/puppetdb/nodes/:certname

**Expert Mode Enabled:**

```bash
curl -X GET "http://localhost:3000/api/integrations/puppetdb/nodes/test-node" \
  -H "X-Expert-Mode: true" \
  -H "X-Correlation-ID: test-pdb-002"
```

**Verification Checklist:**

- [ ] Error response includes `_debug` field
- [ ] External API error captured in debug info

---

#### Test 2.3: GET /api/integrations/puppetdb/nodes/:certname/facts

**Expert Mode Enabled:**

```bash
curl -X GET "http://localhost:3000/api/integrations/puppetdb/nodes/test-node/facts" \
  -H "X-Expert-Mode: true" \
  -H "X-Correlation-ID: test-pdb-003"
```

**Verification Checklist:**

- [ ] Error response includes `_debug` field
- [ ] PuppetDB API error details captured

---

#### Test 2.4: GET /api/integrations/puppetdb/nodes/:certname/resources

**Expert Mode Enabled:**

```bash
curl -X GET "http://localhost:3000/api/integrations/puppetdb/nodes/test-node/resources" \
  -H "X-Expert-Mode: true" \
  -H "X-Correlation-ID: test-pdb-004"
```

**Verification Checklist:**

- [ ] Error response includes `_debug` field
- [ ] Resource query error captured

---

#### Test 2.5: GET /api/integrations/puppetdb/nodes/:certname/reports

**Expert Mode Enabled:**

```bash
curl -X GET "http://localhost:3000/api/integrations/puppetdb/nodes/test-node/reports" \
  -H "X-Expert-Mode: true" \
  -H "X-Correlation-ID: test-pdb-005"
```

**Verification Checklist:**

- [ ] Error response includes `_debug` field
- [ ] Report query error captured

---

#### Test 2.6: GET /api/integrations/puppetdb/reports/:hash

**Expert Mode Enabled:**

```bash
curl -X GET "http://localhost:3000/api/integrations/puppetdb/reports/invalid-hash" \
  -H "X-Expert-Mode: true" \
  -H "X-Correlation-ID: test-pdb-006"
```

**Verification Checklist:**

- [ ] 404 error includes `_debug` field
- [ ] Report not found error captured

---

#### Test 2.7: GET /api/integrations/puppetdb/reports/summary

**Expert Mode Enabled:**

```bash
curl -X GET "http://localhost:3000/api/integrations/puppetdb/reports/summary" \
  -H "X-Expert-Mode: true" \
  -H "X-Correlation-ID: test-pdb-007"
```

**Verification Checklist:**

- [ ] Error response includes `_debug` field
- [ ] Summary calculation error captured
- [ ] This route is the REFERENCE implementation

---

#### Test 2.8: GET /api/integrations/puppetdb/nodes/:certname/catalog

**Expert Mode Enabled:**

```bash
curl -X GET "http://localhost:3000/api/integrations/puppetdb/nodes/test-node/catalog" \
  -H "X-Expert-Mode: true" \
  -H "X-Correlation-ID: test-pdb-008"
```

**Verification Checklist:**

- [ ] Error response includes `_debug` field
- [ ] Catalog retrieval error captured

---

#### Test 2.9: GET /api/integrations/puppetdb/events

**Expert Mode Enabled:**

```bash
curl -X GET "http://localhost:3000/api/integrations/puppetdb/events?report_hash=invalid" \
  -H "X-Expert-Mode: true" \
  -H "X-Correlation-ID: test-pdb-009"
```

**Verification Checklist:**

- [ ] Error response includes `_debug` field
- [ ] Event query error captured

---

#### Test 2.10: GET /api/integrations/puppetdb/admin/summary-stats

**Expert Mode Enabled:**

```bash
curl -X GET "http://localhost:3000/api/integrations/puppetdb/admin/summary-stats" \
  -H "X-Expert-Mode: true" \
  -H "X-Correlation-ID: test-pdb-010"
```

**Verification Checklist:**

- [ ] Error response includes `_debug` field
- [ ] Admin API error captured

---

#### Test 2.11: GET /api/integrations/puppetdb/metrics

**Expert Mode Enabled:**

```bash
curl -X GET "http://localhost:3000/api/integrations/puppetdb/metrics" \
  -H "X-Expert-Mode: true" \
  -H "X-Correlation-ID: test-pdb-011"
```

**Verification Checklist:**

- [ ] Error response includes `_debug` field
- [ ] Metrics retrieval error captured

---

### Category 3: Puppetserver Routes (14 routes)

#### Test 3.1: GET /api/integrations/puppetserver/environments

**Expert Mode Enabled:**

```bash
curl -X GET "http://localhost:3000/api/integrations/puppetserver/environments" \
  -H "X-Expert-Mode: true" \
  -H "X-Correlation-ID: test-ps-001"
```

**Verification Checklist:**

- [ ] Connection error includes `_debug` field
- [ ] Puppetserver connection details captured

---

#### Test 3.2: GET /api/integrations/puppetserver/environments/:environment/classes

**Expert Mode Enabled:**

```bash
curl -X GET "http://localhost:3000/api/integrations/puppetserver/environments/production/classes" \
  -H "X-Expert-Mode: true" \
  -H "X-Correlation-ID: test-ps-002"
```

**Verification Checklist:**

- [ ] Error response includes `_debug` field
- [ ] Classes retrieval error captured

---

#### Test 3.3: GET /api/integrations/puppetserver/environments/:environment/modules

**Expert Mode Enabled:**

```bash
curl -X GET "http://localhost:3000/api/integrations/puppetserver/environments/production/modules" \
  -H "X-Expert-Mode: true" \
  -H "X-Correlation-ID: test-ps-003"
```

**Verification Checklist:**

- [ ] Error response includes `_debug` field
- [ ] Modules retrieval error captured

---

#### Test 3.4: POST /api/integrations/puppetserver/catalog/compile

**Expert Mode Enabled:**

```bash
curl -X POST "http://localhost:3000/api/integrations/puppetserver/catalog/compile" \
  -H "X-Expert-Mode: true" \
  -H "X-Correlation-ID: test-ps-004" \
  -H "Content-Type: application/json" \
  -d '{"certname": "test-node", "environment": "production"}'
```

**Verification Checklist:**

- [ ] Compilation error includes `_debug` field
- [ ] Catalog compilation error details captured

---

#### Test 3.5: GET /api/integrations/puppetserver/nodes

**Expert Mode Enabled:**

```bash
curl -X GET "http://localhost:3000/api/integrations/puppetserver/nodes" \
  -H "X-Expert-Mode: true" \
  -H "X-Correlation-ID: test-ps-005"
```

**Verification Checklist:**

- [ ] Error response includes `_debug` field
- [ ] Node list retrieval error captured

---

#### Test 3.6: GET /api/integrations/puppetserver/nodes/:certname

**Expert Mode Enabled:**

```bash
curl -X GET "http://localhost:3000/api/integrations/puppetserver/nodes/test-node" \
  -H "X-Expert-Mode: true" \
  -H "X-Correlation-ID: test-ps-006"
```

**Verification Checklist:**

- [ ] Error response includes `_debug` field
- [ ] Node details error captured

---

#### Test 3.7: GET /api/integrations/puppetserver/nodes/:certname/catalog

**Expert Mode Enabled:**

```bash
curl -X GET "http://localhost:3000/api/integrations/puppetserver/nodes/test-node/catalog" \
  -H "X-Expert-Mode: true" \
  -H "X-Correlation-ID: test-ps-007"
```

**Verification Checklist:**

- [ ] Error response includes `_debug` field
- [ ] Catalog retrieval error captured

---

#### Test 3.8: POST /api/integrations/puppetserver/catalog/compare

**Expert Mode Enabled:**

```bash
curl -X POST "http://localhost:3000/api/integrations/puppetserver/catalog/compare" \
  -H "X-Expert-Mode: true" \
  -H "X-Correlation-ID: test-ps-008" \
  -H "Content-Type: application/json" \
  -d '{"certname": "test-node", "environment1": "production", "environment2": "development"}'
```

**Verification Checklist:**

- [ ] Comparison error includes `_debug` field
- [ ] Catalog comparison error captured

---

#### Test 3.9-3.14: Additional Puppetserver Routes

Continue similar testing for remaining Puppetserver routes:

- GET /api/integrations/puppetserver/certificate-requests
- POST /api/integrations/puppetserver/certificate-requests/:certname/sign
- DELETE /api/integrations/puppetserver/certificate-requests/:certname
- GET /api/integrations/puppetserver/certificates/:certname
- DELETE /api/integrations/puppetserver/certificates/:certname
- GET /api/integrations/puppetserver/status

---

### Category 4: Hiera Routes (13 routes)

#### Test 4.1: GET /api/integrations/hiera/scan

**Expert Mode Enabled:**

```bash
curl -X GET "http://localhost:3000/api/integrations/hiera/scan" \
  -H "X-Expert-Mode: true" \
  -H "X-Correlation-ID: test-hiera-001"
```

**Verification Checklist:**

- [ ] Scan error includes `_debug` field
- [ ] File system error captured

---

#### Test 4.2: POST /api/integrations/hiera/lookup

**Expert Mode Enabled:**

```bash
curl -X POST "http://localhost:3000/api/integrations/hiera/lookup" \
  -H "X-Expert-Mode: true" \
  -H "X-Correlation-ID: test-hiera-002" \
  -H "Content-Type: application/json" \
  -d '{"key": "test::key", "facts": {}}'
```

**Verification Checklist:**

- [ ] Lookup error includes `_debug` field
- [ ] Hiera resolution error captured

---

#### Test 4.3-4.13: Additional Hiera Routes

Continue testing for all Hiera routes including:

- GET /api/integrations/hiera/keys
- GET /api/integrations/hiera/files
- POST /api/integrations/hiera/resolve
- GET /api/integrations/hiera/hierarchy
- POST /api/integrations/hiera/analyze
- GET /api/integrations/hiera/modules
- GET /api/integrations/hiera/forge/search
- GET /api/integrations/hiera/forge/module/:name
- POST /api/integrations/hiera/catalog/compile
- POST /api/integrations/hiera/code/analyze
- GET /api/integrations/hiera/puppetfile

---

### Category 5: Execution Routes (6 routes)

#### Test 5.1: GET /api/executions

**Expert Mode Enabled:**

```bash
curl -X GET "http://localhost:3000/api/executions" \
  -H "X-Expert-Mode: true" \
  -H "X-Correlation-ID: test-exec-001"
```

**Verification Checklist:**

- [ ] Database error includes `_debug` field
- [ ] Query error captured

---

#### Test 5.2: GET /api/executions/:id

**Expert Mode Enabled:**

```bash
curl -X GET "http://localhost:3000/api/executions/999999" \
  -H "X-Expert-Mode: true" \
  -H "X-Correlation-ID: test-exec-002"
```

**Verification Checklist:**

- [ ] 404 error includes `_debug` field
- [ ] Execution not found error captured

---

#### Test 5.3-5.6: Additional Execution Routes

Continue testing:

- POST /api/executions/:id/re-execute
- DELETE /api/executions/:id
- GET /api/executions/stats
- POST /api/executions/cleanup

---

### Category 6: Task Routes (3 routes)

#### Test 6.1: POST /api/nodes/:id/task

**Expert Mode Enabled:**

```bash
curl -X POST "http://localhost:3000/api/nodes/test-node/task" \
  -H "X-Expert-Mode: true" \
  -H "X-Correlation-ID: test-task-001" \
  -H "Content-Type: application/json" \
  -d '{"task": "invalid::task", "params": {}}'
```

**Verification Checklist:**

- [ ] Task execution error includes `_debug` field
- [ ] Bolt error captured

---

#### Test 6.2: GET /api/tasks

**Expert Mode Enabled:**

```bash
curl -X GET "http://localhost:3000/api/tasks" \
  -H "X-Expert-Mode: true" \
  -H "X-Correlation-ID: test-task-002"
```

**Verification Checklist:**

- [ ] Error response includes `_debug` field
- [ ] Task list error captured

---

#### Test 6.3: GET /api/tasks/:name

**Expert Mode Enabled:**

```bash
curl -X GET "http://localhost:3000/api/tasks/nonexistent::task" \
  -H "X-Expert-Mode: true" \
  -H "X-Correlation-ID: test-task-003"
```

**Verification Checklist:**

- [ ] 404 error includes `_debug` field
- [ ] Task not found error captured

---

### Category 7: Command Routes (1 route)

#### Test 7.1: POST /api/nodes/:id/command

**Expert Mode Enabled:**

```bash
curl -X POST "http://localhost:3000/api/nodes/test-node/command" \
  -H "X-Expert-Mode: true" \
  -H "X-Correlation-ID: test-cmd-001" \
  -H "Content-Type: application/json" \
  -d '{"command": "invalid-command"}'
```

**Verification Checklist:**

- [ ] Command execution error includes `_debug` field
- [ ] Bolt error captured

---

### Category 8: Package Routes (2 routes)

#### Test 8.1: POST /api/nodes/:id/packages/install

**Expert Mode Enabled:**

```bash
curl -X POST "http://localhost:3000/api/nodes/test-node/packages/install" \
  -H "X-Expert-Mode: true" \
  -H "X-Correlation-ID: test-pkg-001" \
  -H "Content-Type: application/json" \
  -d '{"package": "nonexistent-package"}'
```

**Verification Checklist:**

- [ ] Installation error includes `_debug` field
- [ ] Package manager error captured

---

#### Test 8.2: POST /api/nodes/:id/packages/uninstall

**Expert Mode Enabled:**

```bash
curl -X POST "http://localhost:3000/api/nodes/test-node/packages/uninstall" \
  -H "X-Expert-Mode: true" \
  -H "X-Correlation-ID: test-pkg-002" \
  -H "Content-Type: application/json" \
  -d '{"package": "nonexistent-package"}'
```

**Verification Checklist:**

- [ ] Uninstallation error includes `_debug` field
- [ ] Package manager error captured

---

### Category 9: Facts Routes (1 route)

#### Test 9.1: POST /api/nodes/:id/facts

**Expert Mode Enabled:**

```bash
curl -X POST "http://localhost:3000/api/nodes/test-node/facts" \
  -H "X-Expert-Mode: true" \
  -H "X-Correlation-ID: test-facts-001"
```

**Verification Checklist:**

- [ ] Facts collection error includes `_debug` field
- [ ] Bolt/PuppetDB error captured

---

### Category 10: Puppet Routes (1 route)

#### Test 10.1: POST /api/nodes/:id/puppet-run

**Expert Mode Enabled:**

```bash
curl -X POST "http://localhost:3000/api/nodes/test-node/puppet-run" \
  -H "X-Expert-Mode: true" \
  -H "X-Correlation-ID: test-puppet-001" \
  -H "Content-Type: application/json" \
  -d '{"environment": "production"}'
```

**Verification Checklist:**

- [ ] Puppet run error includes `_debug` field
- [ ] Bolt error captured

---

### Category 11: Streaming Routes (2 routes)

#### Test 11.1: GET /api/streaming/executions/:id

**Expert Mode Enabled:**

```bash
curl -X GET "http://localhost:3000/api/streaming/executions/999999" \
  -H "X-Expert-Mode: true" \
  -H "X-Correlation-ID: test-stream-001"
```

**Verification Checklist:**

- [ ] Stream error includes `_debug` field
- [ ] Execution not found error captured

---

#### Test 11.2: POST /api/streaming/executions/:id/cancel

**Expert Mode Enabled:**

```bash
curl -X POST "http://localhost:3000/api/streaming/executions/999999/cancel" \
  -H "X-Expert-Mode: true" \
  -H "X-Correlation-ID: test-stream-002"
```

**Verification Checklist:**

- [ ] Cancellation error includes `_debug` field
- [ ] Stream cancellation error captured

---

### Category 12: Status Routes (1 route)

#### Test 12.1: GET /api/integrations/

**Expert Mode Enabled:**

```bash
curl -X GET "http://localhost:3000/api/integrations/" \
  -H "X-Expert-Mode: true" \
  -H "X-Correlation-ID: test-status-001"
```

**Verification Checklist:**

- [ ] Integration status error includes `_debug` field
- [ ] Health check errors captured

---

## Automated Testing Script

Create a bash script to automate the testing process:

```bash
#!/bin/bash
# manual-test-expert-mode.sh

BASE_URL="http://localhost:3000"
RESULTS_FILE="expert-mode-test-results.txt"

echo "Expert Mode Manual Testing Results" > $RESULTS_FILE
echo "Generated: $(date)" >> $RESULTS_FILE
echo "========================================" >> $RESULTS_FILE
echo "" >> $RESULTS_FILE

# Function to test a route
test_route() {
  local method=$1
  local path=$2
  local correlation_id=$3
  local data=$4
  
  echo "Testing: $method $path" | tee -a $RESULTS_FILE
  
  # Test with expert mode enabled
  if [ -z "$data" ]; then
    response=$(curl -s -X $method "$BASE_URL$path" \
      -H "X-Expert-Mode: true" \
      -H "X-Correlation-ID: $correlation_id")
  else
    response=$(curl -s -X $method "$BASE_URL$path" \
      -H "X-Expert-Mode: true" \
      -H "X-Correlation-ID: $correlation_id" \
      -H "Content-Type: application/json" \
      -d "$data")
  fi
  
  # Check if _debug field exists
  if echo "$response" | jq -e '._debug' > /dev/null 2>&1; then
    echo "  ✓ Expert mode enabled: _debug field present" | tee -a $RESULTS_FILE
  else
    echo "  ✗ Expert mode enabled: _debug field MISSING" | tee -a $RESULTS_FILE
  fi
  
  # Test with expert mode disabled
  if [ -z "$data" ]; then
    response=$(curl -s -X $method "$BASE_URL$path")
  else
    response=$(curl -s -X $method "$BASE_URL$path" \
      -H "Content-Type: application/json" \
      -d "$data")
  fi
  
  # Check if _debug field is absent
  if echo "$response" | jq -e '._debug' > /dev/null 2>&1; then
    echo "  ✗ Expert mode disabled: _debug field present (should be absent)" | tee -a $RESULTS_FILE
  else
    echo "  ✓ Expert mode disabled: _debug field absent" | tee -a $RESULTS_FILE
  fi
  
  echo "" >> $RESULTS_FILE
}

# Test inventory routes
echo "=== Inventory Routes ===" | tee -a $RESULTS_FILE
test_route "GET" "/api/inventory" "test-inv-001"
test_route "GET" "/api/inventory/sources" "test-inv-002"
test_route "GET" "/api/inventory/nonexistent-node" "test-inv-003"

# Test PuppetDB routes
echo "=== PuppetDB Routes ===" | tee -a $RESULTS_FILE
test_route "GET" "/api/integrations/puppetdb/nodes" "test-pdb-001"
test_route "GET" "/api/integrations/puppetdb/nodes/test-node" "test-pdb-002"
test_route "GET" "/api/integrations/puppetdb/reports/summary" "test-pdb-007"

# Test Puppetserver routes
echo "=== Puppetserver Routes ===" | tee -a $RESULTS_FILE
test_route "GET" "/api/integrations/puppetserver/environments" "test-ps-001"
test_route "POST" "/api/integrations/puppetserver/catalog/compile" "test-ps-004" '{"certname":"test-node","environment":"production"}'

# Test Hiera routes
echo "=== Hiera Routes ===" | tee -a $RESULTS_FILE
test_route "GET" "/api/integrations/hiera/scan" "test-hiera-001"
test_route "POST" "/api/integrations/hiera/lookup" "test-hiera-002" '{"key":"test::key","facts":{}}'

# Test execution routes
echo "=== Execution Routes ===" | tee -a $RESULTS_FILE
test_route "GET" "/api/executions" "test-exec-001"
test_route "GET" "/api/executions/999999" "test-exec-002"

# Test task routes
echo "=== Task Routes ===" | tee -a $RESULTS_FILE
test_route "POST" "/api/nodes/test-node/task" "test-task-001" '{"task":"invalid::task","params":{}}'
test_route "GET" "/api/tasks" "test-task-002"

# Test command routes
echo "=== Command Routes ===" | tee -a $RESULTS_FILE
test_route "POST" "/api/nodes/test-node/command" "test-cmd-001" '{"command":"invalid-command"}'

# Test package routes
echo "=== Package Routes ===" | tee -a $RESULTS_FILE
test_route "POST" "/api/nodes/test-node/packages/install" "test-pkg-001" '{"package":"nonexistent-package"}'

# Test facts routes
echo "=== Facts Routes ===" | tee -a $RESULTS_FILE
test_route "POST" "/api/nodes/test-node/facts" "test-facts-001"

# Test puppet routes
echo "=== Puppet Routes ===" | tee -a $RESULTS_FILE
test_route "POST" "/api/nodes/test-node/puppet-run" "test-puppet-001" '{"environment":"production"}'

# Test streaming routes
echo "=== Streaming Routes ===" | tee -a $RESULTS_FILE
test_route "GET" "/api/streaming/executions/999999" "test-stream-001"

# Test status routes
echo "=== Status Routes ===" | tee -a $RESULTS_FILE
test_route "GET" "/api/integrations/" "test-status-001"

echo "" | tee -a $RESULTS_FILE
echo "Testing complete. Results saved to $RESULTS_FILE" | tee -a $RESULTS_FILE
```

## Summary Checklist

After completing all tests, verify:

- [ ] All 58 routes tested
- [ ] All error responses include `_debug` field when expert mode enabled
- [ ] All error responses exclude `_debug` field when expert mode disabled
- [ ] External API errors (PuppetDB, Puppetserver, Bolt, Hiera) are captured in debug info
- [ ] Debug info includes all required fields: timestamp, requestId, correlationId, operation, duration, errors, warnings, info, performance
- [ ] Correlation IDs are properly propagated through the request lifecycle
- [ ] Performance metrics are included in debug info
- [ ] Error messages are descriptive and include stack traces where applicable

## Known Issues and Limitations

Document any issues discovered during testing:

1. **Issue**: [Description]
   - **Route**: [Route path]
   - **Expected**: [Expected behavior]
   - **Actual**: [Actual behavior]
   - **Severity**: [Critical/High/Medium/Low]

2. **Issue**: [Description]
   - **Route**: [Route path]
   - **Expected**: [Expected behavior]
   - **Actual**: [Actual behavior]
   - **Severity**: [Critical/High/Medium/Low]

## Next Steps

After completing manual testing:

1. Document all findings in this guide
2. Create GitHub issues for any bugs discovered
3. Update the tasks.md file to mark this task as complete
4. Proceed to the next task: "Verify external API errors are visible in debug info"
