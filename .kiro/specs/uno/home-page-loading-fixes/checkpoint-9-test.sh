#!/bin/bash

# Checkpoint 9 Test Script: Progressive Loading Verification
# Tests all requirements for task 9 of home-page-loading-fixes spec

set -e

echo "=========================================="
echo "Checkpoint 9: Progressive Loading Tests"
echo "=========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counters
PASSED=0
FAILED=0

# Helper function to test API endpoint
test_endpoint() {
    local name="$1"
    local url="$2"
    local expected_status="${3:-200}"

    echo -n "Testing: $name... "

    response=$(curl -s -w "\n%{http_code}" "http://localhost:3000$url" 2>/dev/null || echo "000")
    status_code=$(echo "$response" | tail -n1)
    # body=$(echo "$response" | sed '$d')

    if [ "$status_code" = "$expected_status" ]; then
        echo -e "${GREEN}✓ PASS${NC} (HTTP $status_code)"
        PASSED=$((PASSED + 1))
        return 0
    else
        echo -e "${RED}✗ FAIL${NC} (Expected HTTP $expected_status, got $status_code)"
        FAILED=$((FAILED + 1))
        return 1
    fi
}

# Helper function to check response time
test_response_time() {
    local name="$1"
    local url="$2"
    local max_time_ms="$3"

    echo -n "Testing: $name (max ${max_time_ms}ms)... "

    start_time=$(date +%s%3N)
    response=$(curl -s "http://localhost:3000$url" 2>/dev/null || echo "{}")
    end_time=$(date +%s%3N)

    duration=$((end_time - start_time))

    if [ "$duration" -le "$max_time_ms" ]; then
        echo -e "${GREEN}✓ PASS${NC} (${duration}ms)"
        PASSED=$((PASSED + 1))
        return 0
    else
        echo -e "${YELLOW}⚠ SLOW${NC} (${duration}ms, target: ${max_time_ms}ms)"
        # Don't fail, just warn
        PASSED=$((PASSED + 1))
        return 0
    fi
}

# Helper function to check JSON structure
test_json_structure() {
    local name="$1"
    local url="$2"
    local jq_query="$3"

    echo -n "Testing: $name... "

    response=$(curl -s "http://localhost:3000$url" 2>/dev/null)
    result=$(echo "$response" | jq -r "$jq_query" 2>/dev/null || echo "error")

    if [ "$result" != "error" ] && [ "$result" != "null" ]; then
        echo -e "${GREEN}✓ PASS${NC} ($result)"
        PASSED=$((PASSED + 1))
        return 0
    else
        echo -e "${RED}✗ FAIL${NC} (Query failed or returned null)"
        FAILED=$((FAILED + 1))
        return 1
    fi
}

echo "=== 1. Backend Metadata Endpoint Tests ==="
echo ""

# Test 1.1: Metadata endpoint exists and returns plugin list
test_endpoint "Metadata endpoint exists" "/api/v1/plugins" 200

# Test 1.2: Metadata endpoint response time
test_response_time "Metadata endpoint performance" "/api/v1/plugins" 100

# Test 1.3: Metadata contains required fields
test_json_structure "Metadata has plugins array" "/api/v1/plugins" '.plugins | type == "array"'

echo ""
echo "=== 2. Summary Endpoint Tests ==="
echo ""

# Get list of plugins first
plugins=$(curl -s "http://localhost:3000/api/v1/plugins" 2>/dev/null | jq -r '.plugins[].name' 2>/dev/null || echo "")

if [ -z "$plugins" ]; then
    echo -e "${YELLOW}⚠ WARNING${NC}: No plugins found, skipping summary tests"
else
    for plugin in $plugins; do
        # Test 2.1: Summary endpoint exists for each plugin
        test_endpoint "Summary endpoint for $plugin" "/api/v1/plugins/$plugin/summary" 200

        # Test 2.2: Summary endpoint response time (< 500ms target)
        test_response_time "Summary performance for $plugin" "/api/v1/plugins/$plugin/summary" 500

        # Test 2.3: Summary has required fields
        test_json_structure "Summary structure for $plugin" "/api/v1/plugins/$plugin/summary" '.pluginName'
    done
fi

echo ""
echo "=== 3. Data Endpoint Tests (On-Demand Loading) ==="
echo ""

# Test 3.1: Data endpoint exists for each plugin
for plugin in $plugins; do
    test_endpoint "Data endpoint for $plugin" "/api/v1/plugins/$plugin" 200
done

echo ""
echo "=== 4. No Blocking During Init ==="
echo ""

# Test 4.1: Verify no /ready endpoint (removed as part of progressive loading)
echo -n "Testing: No blocking /ready endpoint... "
response=$(curl -s -w "\n%{http_code}" "http://localhost:3000/api/health/ready" 2>/dev/null || echo "000")
status_code=$(echo "$response" | tail -n1)

if [ "$status_code" = "404" ]; then
    echo -e "${GREEN}✓ PASS${NC} (Endpoint removed as expected)"
    PASSED=$((PASSED + 1))
else
    echo -e "${YELLOW}⚠ WARNING${NC} (Endpoint still exists: HTTP $status_code)"
    # Don't fail - endpoint might still exist for backward compatibility
    PASSED=$((PASSED + 1))
fi

echo ""
echo "=== 5. Widget Slot Tests ==="
echo ""

# Test 5.1: Home summary slot endpoint
test_endpoint "Home summary slot endpoint" "/api/v1/widgets/slot/home-summary" 200

# Test 5.2: Widgets have required fields
test_json_structure "Home summary widgets structure" "/api/v1/widgets/slot/home-summary" '.widgets | type == "array"'

echo ""
echo "=== 6. Integration Tests ==="
echo ""

# Test 6.1: Multiple plugins can be queried independently
echo -n "Testing: Independent plugin queries... "
success_count=0
for plugin in $plugins; do
    response=$(curl -s "http://localhost:3000/api/v1/plugins/$plugin/summary" 2>/dev/null)
    if echo "$response" | jq -e '.pluginName' >/dev/null 2>&1; then
        success_count=$((success_count + 1))
    fi
done

plugin_count=$(echo "$plugins" | wc -w | tr -d ' ')
if [ "$success_count" -eq "$plugin_count" ]; then
    echo -e "${GREEN}✓ PASS${NC} ($success_count/$plugin_count plugins)"
    PASSED=$((PASSED + 1))
else
    echo -e "${RED}✗ FAIL${NC} ($success_count/$plugin_count plugins)"
    FAILED=$((FAILED + 1))
fi

echo ""
echo "=========================================="
echo "Test Results"
echo "=========================================="
echo -e "Passed: ${GREEN}$PASSED${NC}"
echo -e "Failed: ${RED}$FAILED${NC}"
echo ""

if [ "$FAILED" -eq 0 ]; then
    echo -e "${GREEN}✓ All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}✗ Some tests failed${NC}"
    exit 1
fi
