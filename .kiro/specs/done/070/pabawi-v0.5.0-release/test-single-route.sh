#!/bin/bash
# test-single-route.sh
# Interactive tool for testing individual routes

set -e

BASE_URL="${BASE_URL:-http://localhost:3000}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Expert Mode Single Route Tester${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check if server is running
echo -e "${YELLOW}Checking server at $BASE_URL...${NC}"
if ! curl -s -f "$BASE_URL/api/integrations/" > /dev/null 2>&1; then
  echo -e "${RED}Error: Server is not running at $BASE_URL${NC}"
  echo "Please start the backend server and try again."
  exit 1
fi
echo -e "${GREEN}✓ Server is running${NC}"
echo ""

# Get route details from user
echo -e "${YELLOW}Enter route details:${NC}"
read -p "Method (GET/POST/DELETE): " method
read -p "Path (e.g., /api/inventory): " path
read -p "Correlation ID (optional): " correlation_id
read -p "Request body JSON (optional, for POST): " body

# Default correlation ID if not provided
if [ -z "$correlation_id" ]; then
  correlation_id="test-$(date +%s)"
fi

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Testing with Expert Mode ENABLED${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Build curl command
if [ -z "$body" ]; then
  response=$(curl -s -w "\n%{http_code}" -X "$method" "$BASE_URL$path" \
    -H "X-Expert-Mode: true" \
    -H "X-Correlation-ID: $correlation_id" 2>/dev/null || echo "CURL_ERROR")
else
  response=$(curl -s -w "\n%{http_code}" -X "$method" "$BASE_URL$path" \
    -H "X-Expert-Mode: true" \
    -H "X-Correlation-ID: $correlation_id" \
    -H "Content-Type: application/json" \
    -d "$body" 2>/dev/null || echo "CURL_ERROR")
fi

if [ "$response" = "CURL_ERROR" ]; then
  echo -e "${RED}✗ Connection error${NC}"
  exit 1
fi

# Extract HTTP status and body
http_code=$(echo "$response" | tail -n1)
response_body=$(echo "$response" | sed '$d')

echo -e "${YELLOW}HTTP Status:${NC} $http_code"
echo ""

# Check if valid JSON
if ! echo "$response_body" | jq empty 2>/dev/null; then
  echo -e "${RED}✗ Invalid JSON response${NC}"
  echo "$response_body"
  exit 1
fi

# Pretty print response
echo -e "${YELLOW}Response:${NC}"
echo "$response_body" | jq '.'
echo ""

# Check for _debug field
if echo "$response_body" | jq -e '._debug' > /dev/null 2>&1; then
  echo -e "${GREEN}✓ _debug field is present${NC}"
  echo ""

  # Show debug info summary
  echo -e "${YELLOW}Debug Info Summary:${NC}"
  echo "$response_body" | jq '._debug | {
    timestamp,
    operation,
    duration,
    correlationId,
    errorCount: (.errors | length),
    warningCount: (.warnings | length),
    infoCount: (.info | length)
  }'
  echo ""

  # Show errors if present
  error_count=$(echo "$response_body" | jq '._debug.errors | length')
  if [ "$error_count" -gt 0 ]; then
    echo -e "${RED}Errors ($error_count):${NC}"
    echo "$response_body" | jq '._debug.errors'
    echo ""
  fi

  # Show warnings if present
  warning_count=$(echo "$response_body" | jq '._debug.warnings | length')
  if [ "$warning_count" -gt 0 ]; then
    echo -e "${YELLOW}Warnings ($warning_count):${NC}"
    echo "$response_body" | jq '._debug.warnings'
    echo ""
  fi

  # Show info if present
  info_count=$(echo "$response_body" | jq '._debug.info | length')
  if [ "$info_count" -gt 0 ]; then
    echo -e "${BLUE}Info ($info_count):${NC}"
    echo "$response_body" | jq '._debug.info'
    echo ""
  fi

  # Check for required fields
  has_timestamp=$(echo "$response_body" | jq -e '._debug.timestamp' > /dev/null 2>&1 && echo "yes" || echo "no")
  has_operation=$(echo "$response_body" | jq -e '._debug.operation' > /dev/null 2>&1 && echo "yes" || echo "no")
  has_duration=$(echo "$response_body" | jq -e '._debug.duration' > /dev/null 2>&1 && echo "yes" || echo "no")

  echo -e "${YELLOW}Required Fields Check:${NC}"
  if [ "$has_timestamp" = "yes" ]; then
    echo -e "  ${GREEN}✓ timestamp${NC}"
  else
    echo -e "  ${RED}✗ timestamp (missing)${NC}"
  fi

  if [ "$has_operation" = "yes" ]; then
    echo -e "  ${GREEN}✓ operation${NC}"
  else
    echo -e "  ${RED}✗ operation (missing)${NC}"
  fi

  if [ "$has_duration" = "yes" ]; then
    echo -e "  ${GREEN}✓ duration${NC}"
  else
    echo -e "  ${RED}✗ duration (missing)${NC}"
  fi
  echo ""

else
  echo -e "${RED}✗ _debug field is MISSING${NC}"
  echo -e "${RED}This route does not properly attach debug info!${NC}"
  echo ""
fi

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Testing with Expert Mode DISABLED${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Test without expert mode
if [ -z "$body" ]; then
  response=$(curl -s -w "\n%{http_code}" -X "$method" "$BASE_URL$path" 2>/dev/null || echo "CURL_ERROR")
else
  response=$(curl -s -w "\n%{http_code}" -X "$method" "$BASE_URL$path" \
    -H "Content-Type: application/json" \
    -d "$body" 2>/dev/null || echo "CURL_ERROR")
fi

if [ "$response" = "CURL_ERROR" ]; then
  echo -e "${RED}✗ Connection error${NC}"
  exit 1
fi

http_code=$(echo "$response" | tail -n1)
response_body=$(echo "$response" | sed '$d')

echo -e "${YELLOW}HTTP Status:${NC} $http_code"
echo ""

if echo "$response_body" | jq empty 2>/dev/null; then
  echo -e "${YELLOW}Response:${NC}"
  echo "$response_body" | jq '.'
  echo ""

  if echo "$response_body" | jq -e '._debug' > /dev/null 2>&1; then
    echo -e "${RED}✗ _debug field is present (should be absent)${NC}"
    echo -e "${RED}Debug info is leaking when expert mode is disabled!${NC}"
  else
    echo -e "${GREEN}✓ _debug field is absent (correct)${NC}"
  fi
else
  echo -e "${RED}✗ Invalid JSON response${NC}"
  echo "$response_body"
fi

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Test Complete${NC}"
echo -e "${BLUE}========================================${NC}"
