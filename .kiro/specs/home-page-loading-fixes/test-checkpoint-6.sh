#!/bin/bash
# Checkpoint 6 - Manual Testing Script
# This script helps verify the performance requirements

echo "=========================================="
echo "Checkpoint 6 - Performance Verification"
echo "=========================================="
echo ""

# Check if backend is running
echo "1. Checking if backend is running..."
if curl -s http://localhost:3000/api/health > /dev/null 2>&1; then
    echo "   ✓ Backend is running on port 3000"
else
    echo "   ✗ Backend is NOT running"
    echo "   Please start backend: npm run dev:backend"
    exit 1
fi

# Check if frontend is running
echo ""
echo "2. Checking if frontend is running..."
if curl -s http://localhost:5173 > /dev/null 2>&1; then
    echo "   ✓ Frontend is running on port 5173"
else
    echo "   ✗ Frontend is NOT running"
    echo "   Please start frontend: npm run dev:frontend"
    exit 1
fi

# Test metadata endpoint
echo ""
echo "3. Testing /api/v1/plugins metadata endpoint..."
METADATA_START=$(date +%s%3N)
METADATA_RESPONSE=$(curl -s -w "\n%{http_code}" http://localhost:3000/api/v1/plugins)
METADATA_END=$(date +%s%3N)
METADATA_DURATION=$((METADATA_END - METADATA_START))
METADATA_STATUS=$(echo "$METADATA_RESPONSE" | tail -n 1)
METADATA_BODY=$(echo "$METADATA_RESPONSE" | head -n -1)

if [ "$METADATA_STATUS" = "200" ]; then
    PLUGIN_COUNT=$(echo "$METADATA_BODY" | grep -o '"name"' | wc -l)
    echo "   ✓ Metadata endpoint returned 200 OK"
    echo "   ✓ Found $PLUGIN_COUNT plugins"
    echo "   ✓ Response time: ${METADATA_DURATION}ms"

    if [ "$METADATA_DURATION" -lt 100 ]; then
        echo "   ✓ PASS: Response time < 100ms target"
    else
        echo "   ⚠ WARNING: Response time exceeds 100ms target"
    fi
else
    echo "   ✗ Metadata endpoint returned status: $METADATA_STATUS"
fi

# Check if legacy endpoint is still being used
echo ""
echo "4. Checking for legacy endpoint usage..."
echo "   (This requires checking browser DevTools Network tab manually)"
echo "   - Open http://localhost:5173 in browser"
echo "   - Open DevTools (F12) -> Network tab"
echo "   - Login to the application"
echo "   - Look for API calls:"
echo "     ✓ Should see: /api/v1/plugins"
echo "     ✗ Should NOT see: /api/integrations/menu"

echo ""
echo "=========================================="
echo "Manual Testing Checklist"
echo "=========================================="
echo ""
echo "Open http://localhost:5173 in your browser and verify:"
echo ""
echo "[ ] 1. Shell Rendering (< 500ms)"
echo "       - Navigation bar appears immediately after login"
echo "       - Page layout renders instantly"
echo "       - No blocking loading screen"
echo ""
echo "[ ] 2. Menu Appearance (< 1 second)"
echo "       - Menu items appear quickly"
echo "       - Loading skeleton is brief"
echo "       - Menu is interactive within 1 second"
echo ""
echo "[ ] 3. Browser Responsiveness"
echo "       - No lag or sluggishness"
echo "       - Smooth interactions"
echo "       - No frozen UI"
echo ""
echo "[ ] 4. No Blocking Initialization"
echo "       - Check Console for 'metadata-only approach' log"
echo "       - No 'Initializing...' blocking messages"
echo "       - App shell renders before data loads"
echo ""
echo "[ ] 5. Network Tab Verification"
echo "       - /api/v1/plugins called (metadata)"
echo "       - /api/integrations/menu NOT called (legacy)"
echo "       - No blocking API calls before render"
echo ""
echo "=========================================="
echo "Performance Metrics (use DevTools)"
echo "=========================================="
echo ""
echo "Open DevTools -> Performance tab and record page load:"
echo ""
echo "Target Metrics:"
echo "  - Time to First Paint (FP): < 500ms"
echo "  - Time to First Contentful Paint (FCP): < 500ms"
echo "  - Time to Interactive (TTI): < 1000ms"
echo "  - Total Blocking Time (TBT): < 200ms"
echo ""
echo "=========================================="
