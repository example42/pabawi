#!/bin/bash
# manual-test-expert-mode.sh
# Automated testing script for expert mode debug info attachment

set -e

BASE_URL="${BASE_URL:-http://localhost:3000}"
RESULTS_FILE="expert-mode-test-results.txt"
PASSED=0
FAILED=0

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "Expert Mode Manual Testing Results" > $RESULTS_FILE
echo "Generated: $(date)" >> $RESULTS_FILE
echo "Base URL: $BASE_URL" >> $RESULTS_FILE
echo "========================================" >> $RESULTS_FILE
echo "" >> $RESULTS_FILE

# Function to test a route
test_route() {
  local method=$1
  local path=$2
  local correlation_id=$3
  local data=$4
  local route_name=$5

  echo -e "${YELLOW}Testing: $method $path${NC}"
  echo "Testing: $method $path ($route_name)" >> $RESULTS_FILE

  local route_passed=true

  # Test with expert mode enabled
  if [ -z "$data" ]; then
    response=$(curl -s -w "\n%{http_code}" -X $method "$BASE_URL$path" \
      -H "X-Expert-Mode: true" \
      -H "X-Correlation-ID: $correlation_id" 2>/dev/null || echo "CURL_ERROR")
  else
    response=$(curl -s -w "\n%{http_code}" -X $method "$BASE_URL$path" \
      -H "X-Expert-Mode: true" \
      -H "X-Correlation-ID: $correlation_id" \
      -H "Content-Type: application/json" \
      -d "$data" 2>/dev/null || echo "CURL_ERROR")
  fi

  if [ "$response" = "CURL_ERROR" ]; then
    echo -e "  ${RED}✗ Connection error - server may not be running${NC}"
    echo "  ✗ Connection error - server may not be running" >> $RESULTS_FILE
    FAILED=$((FAILED + 1))
    echo "" >> $RESULTS_FILE
    return
  fi

  # Extract HTTP status code and body
  http_code=$(echo "$response" | tail -n1)
  body=$(echo "$response" | sed '$d')

  # Check if response is valid JSON
  if ! echo "$body" | jq empty 2>/dev/null; then
    echo -e "  ${RED}✗ Invalid JSON response${NC}"
    echo "  ✗ Invalid JSON response" >> $RESULTS_FILE
    echo "  Response: $body" >> $RESULTS_FILE
    FAILED=$((FAILED + 1))
    route_passed=false
  else
    # Check if _debug field exists when expert mode is enabled
    if echo "$body" | jq -e '._debug' > /dev/null 2>&1; then
      echo -e "  ${GREEN}✓ Expert mode enabled: _debug field present${NC}"
      echo "  ✓ Expert mode enabled: _debug field present" >> $RESULTS_FILE

      # Verify _debug has required fields
      has_timestamp=$(echo "$body" | jq -e '._debug.timestamp' > /dev/null 2>&1 && echo "yes" || echo "no")
      has_operation=$(echo "$body" | jq -e '._debug.operation' > /dev/null 2>&1 && echo "yes" || echo "no")
      has_duration=$(echo "$body" | jq -e '._debug.duration' > /dev/null 2>&1 && echo "yes" || echo "no")

      if [ "$has_timestamp" = "yes" ] && [ "$has_operation" = "yes" ] && [ "$has_duration" = "yes" ]; then
        echo -e "  ${GREEN}✓ Debug info has required fields${NC}"
        echo "  ✓ Debug info has required fields (timestamp, operation, duration)" >> $RESULTS_FILE
      else
        echo -e "  ${RED}✗ Debug info missing required fields${NC}"
        echo "  ✗ Debug info missing required fields" >> $RESULTS_FILE
        echo "    timestamp: $has_timestamp, operation: $has_operation, duration: $has_duration" >> $RESULTS_FILE
        FAILED=$((FAILED + 1))
        route_passed=false
      fi

      # Check if errors array exists (for error responses)
      if [ "$http_code" -ge 400 ]; then
        if echo "$body" | jq -e '._debug.errors' > /dev/null 2>&1; then
          error_count=$(echo "$body" | jq '._debug.errors | length')
          echo -e "  ${GREEN}✓ Error response includes errors array ($error_count errors)${NC}"
          echo "  ✓ Error response includes errors array ($error_count errors)" >> $RESULTS_FILE
        else
          echo -e "  ${RED}✗ Error response missing errors array${NC}"
          echo "  ✗ Error response missing errors array" >> $RESULTS_FILE
          FAILED=$((FAILED + 1))
          route_passed=false
        fi
      fi
    else
      echo -e "  ${RED}✗ Expert mode enabled: _debug field MISSING${NC}"
      echo "  ✗ Expert mode enabled: _debug field MISSING" >> $RESULTS_FILE
      echo "  Response: $body" >> $RESULTS_FILE
      FAILED=$((FAILED + 1))
      route_passed=false
    fi
  fi

  # Test with expert mode disabled
  if [ -z "$data" ]; then
    response=$(curl -s -w "\n%{http_code}" -X $method "$BASE_URL$path" 2>/dev/null || echo "CURL_ERROR")
  else
    response=$(curl -s -w "\n%{http_code}" -X $method "$BASE_URL$path" \
      -H "Content-Type: application/json" \
      -d "$data" 2>/dev/null || echo "CURL_ERROR")
  fi

  if [ "$response" != "CURL_ERROR" ]; then
    body=$(echo "$response" | sed '$d')

    # Check if response is valid JSON
    if echo "$body" | jq empty 2>/dev/null; then
      # Check if _debug field is absent
      if echo "$body" | jq -e '._debug' > /dev/null 2>&1; then
        echo -e "  ${RED}✗ Expert mode disabled: _debug field present (should be absent)${NC}"
        echo "  ✗ Expert mode disabled: _debug field present (should be absent)" >> $RESULTS_FILE
        FAILED=$((FAILED + 1))
        route_passed=false
      else
        echo -e "  ${GREEN}✓ Expert mode disabled: _debug field absent${NC}"
        echo "  ✓ Expert mode disabled: _debug field absent" >> $RESULTS_FILE
      fi
    fi
  fi

  if [ "$route_passed" = true ]; then
    PASSED=$((PASSED + 1))
  fi

  echo "" >> $RESULTS_FILE
}

# Check if server is running
echo -e "${YELLOW}Checking if server is running at $BASE_URL...${NC}"
if ! curl -s -f "$BASE_URL/api/integrations/" > /dev/null 2>&1; then
  echo -e "${RED}Error: Server is not running at $BASE_URL${NC}"
  echo "Please start the backend server and try again."
  exit 1
fi
echo -e "${GREEN}Server is running${NC}"
echo ""

# Test inventory routes
echo -e "${YELLOW}=== Testing Inventory Routes ===${NC}"
echo "=== Inventory Routes ===" >> $RESULTS_FILE
test_route "GET" "/api/inventory" "test-inv-001" "" "Get all inventory"
test_route "GET" "/api/inventory/sources" "test-inv-002" "" "Get inventory sources"
test_route "GET" "/api/inventory/nonexistent-node" "test-inv-003" "" "Get nonexistent node"

# Test PuppetDB routes
echo -e "${YELLOW}=== Testing PuppetDB Routes ===${NC}"
echo "=== PuppetDB Routes ===" >> $RESULTS_FILE
test_route "GET" "/api/integrations/puppetdb/nodes" "test-pdb-001" "" "Get all nodes"
test_route "GET" "/api/integrations/puppetdb/nodes/test-node" "test-pdb-002" "" "Get node details"
test_route "GET" "/api/integrations/puppetdb/nodes/test-node/facts" "test-pdb-003" "" "Get node facts"
test_route "GET" "/api/integrations/puppetdb/nodes/test-node/resources" "test-pdb-004" "" "Get node resources"
test_route "GET" "/api/integrations/puppetdb/nodes/test-node/reports" "test-pdb-005" "" "Get node reports"
test_route "GET" "/api/integrations/puppetdb/reports/invalid-hash" "test-pdb-006" "" "Get report by hash"
test_route "GET" "/api/integrations/puppetdb/reports/summary" "test-pdb-007" "" "Get reports summary (REFERENCE)"
test_route "GET" "/api/integrations/puppetdb/nodes/test-node/catalog" "test-pdb-008" "" "Get node catalog"
test_route "GET" "/api/integrations/puppetdb/events?report_hash=invalid" "test-pdb-009" "" "Get events"
test_route "GET" "/api/integrations/puppetdb/admin/summary-stats" "test-pdb-010" "" "Get admin summary stats"
test_route "GET" "/api/integrations/puppetdb/metrics" "test-pdb-011" "" "Get metrics"

# Test Puppetserver routes
echo -e "${YELLOW}=== Testing Puppetserver Routes ===${NC}"
echo "=== Puppetserver Routes ===" >> $RESULTS_FILE
test_route "GET" "/api/integrations/puppetserver/environments" "test-ps-001" "" "Get environments"
test_route "GET" "/api/integrations/puppetserver/environments/production/classes" "test-ps-002" "" "Get environment classes"
test_route "GET" "/api/integrations/puppetserver/environments/production/modules" "test-ps-003" "" "Get environment modules"
test_route "POST" "/api/integrations/puppetserver/catalog/compile" "test-ps-004" '{"certname":"test-node","environment":"production"}' "Compile catalog"
test_route "GET" "/api/integrations/puppetserver/nodes" "test-ps-005" "" "Get all nodes"
test_route "GET" "/api/integrations/puppetserver/nodes/test-node" "test-ps-006" "" "Get node details"
test_route "GET" "/api/integrations/puppetserver/nodes/test-node/catalog" "test-ps-007" "" "Get node catalog"
test_route "POST" "/api/integrations/puppetserver/catalog/compare" "test-ps-008" '{"certname":"test-node","environment1":"production","environment2":"development"}' "Compare catalogs"

# Test Hiera routes
echo -e "${YELLOW}=== Testing Hiera Routes ===${NC}"
echo "=== Hiera Routes ===" >> $RESULTS_FILE
test_route "GET" "/api/integrations/hiera/scan" "test-hiera-001" "" "Scan Hiera files"
test_route "POST" "/api/integrations/hiera/lookup" "test-hiera-002" '{"key":"test::key","facts":{}}' "Lookup Hiera key"

# Test execution routes
echo -e "${YELLOW}=== Testing Execution Routes ===${NC}"
echo "=== Execution Routes ===" >> $RESULTS_FILE
test_route "GET" "/api/executions" "test-exec-001" "" "Get all executions"
test_route "GET" "/api/executions/999999" "test-exec-002" "" "Get nonexistent execution"

# Test task routes
echo -e "${YELLOW}=== Testing Task Routes ===${NC}"
echo "=== Task Routes ===" >> $RESULTS_FILE
test_route "POST" "/api/nodes/test-node/task" "test-task-001" '{"task":"invalid::task","params":{}}' "Execute task"
test_route "GET" "/api/tasks" "test-task-002" "" "Get all tasks"
test_route "GET" "/api/tasks/nonexistent::task" "test-task-003" "" "Get nonexistent task"

# Test command routes
echo -e "${YELLOW}=== Testing Command Routes ===${NC}"
echo "=== Command Routes ===" >> $RESULTS_FILE
test_route "POST" "/api/nodes/test-node/command" "test-cmd-001" '{"command":"invalid-command"}' "Execute command"

# Test package routes
echo -e "${YELLOW}=== Testing Package Routes ===${NC}"
echo "=== Package Routes ===" >> $RESULTS_FILE
test_route "POST" "/api/nodes/test-node/packages/install" "test-pkg-001" '{"package":"nonexistent-package"}' "Install package"
test_route "POST" "/api/nodes/test-node/packages/uninstall" "test-pkg-002" '{"package":"nonexistent-package"}' "Uninstall package"

# Test facts routes
echo -e "${YELLOW}=== Testing Facts Routes ===${NC}"
echo "=== Facts Routes ===" >> $RESULTS_FILE
test_route "POST" "/api/nodes/test-node/facts" "test-facts-001" "" "Collect facts"

# Test puppet routes
echo -e "${YELLOW}=== Testing Puppet Routes ===${NC}"
echo "=== Puppet Routes ===" >> $RESULTS_FILE
test_route "POST" "/api/nodes/test-node/puppet-run" "test-puppet-001" '{"environment":"production"}' "Run Puppet"

# Test streaming routes
echo -e "${YELLOW}=== Testing Streaming Routes ===${NC}"
echo "=== Streaming Routes ===" >> $RESULTS_FILE
test_route "GET" "/api/streaming/executions/999999" "test-stream-001" "" "Get execution stream"
test_route "POST" "/api/streaming/executions/999999/cancel" "test-stream-002" "" "Cancel execution"

# Test status routes
echo -e "${YELLOW}=== Testing Status Routes ===${NC}"
echo "=== Status Routes ===" >> $RESULTS_FILE
test_route "GET" "/api/integrations/" "test-status-001" "" "Get integration status"

# Summary
echo "" | tee -a $RESULTS_FILE
echo "========================================" | tee -a $RESULTS_FILE
echo "Testing Summary" | tee -a $RESULTS_FILE
echo "========================================" | tee -a $RESULTS_FILE
echo "Total routes tested: $((PASSED + FAILED))" | tee -a $RESULTS_FILE
echo -e "${GREEN}Passed: $PASSED${NC}" | tee -a $RESULTS_FILE
echo -e "${RED}Failed: $FAILED${NC}" | tee -a $RESULTS_FILE
echo "" | tee -a $RESULTS_FILE

if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}All tests passed!${NC}" | tee -a $RESULTS_FILE
  exit 0
else
  echo -e "${RED}Some tests failed. See $RESULTS_FILE for details.${NC}" | tee -a $RESULTS_FILE
  exit 1
fi
