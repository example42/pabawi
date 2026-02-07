#!/bin/bash
# Performance Testing Script
# Tests the actual response times of the new endpoints

echo "=========================================="
echo "Performance Testing"
echo "=========================================="
echo ""

# Test metadata endpoint performance
echo "Testing /api/v1/plugins metadata endpoint..."
TOTAL_TIME=0
ITERATIONS=5

for i in {1..5}; do
  START=$(date +%s%N)
  curl -s http://localhost:3000/api/v1/plugins > /dev/null
  END=$(date +%s%N)
  DURATION=$(( (END - START) / 1000000 ))
  echo "  Iteration $i: ${DURATION}ms"
  TOTAL_TIME=$((TOTAL_TIME + DURATION))
done

AVG_TIME=$((TOTAL_TIME / ITERATIONS))
echo ""
echo "Average response time: ${AVG_TIME}ms"

if [ "$AVG_TIME" -lt 100 ]; then
  echo "✓ PASS: Average response time < 100ms target"
else
  echo "⚠ WARNING: Average response time exceeds 100ms target"
fi

echo ""
echo "=========================================="
echo "Manual Browser Testing Required"
echo "=========================================="
echo ""
echo "Please open http://localhost:5173 in your browser and:"
echo ""
echo "1. Open DevTools (F12)"
echo "2. Go to Network tab"
echo "3. Login to the application"
echo "4. Observe:"
echo "   - Shell renders immediately (navigation bar visible)"
echo "   - Menu appears within 1 second"
echo "   - No blocking loading screens"
echo "   - Browser remains responsive"
echo ""
echo "5. Check Network tab for:"
echo "   ✓ /api/v1/plugins called (metadata)"
echo "   ✗ /api/integrations/menu NOT called (legacy)"
echo ""
echo "6. Check Console for:"
echo "   ✓ 'metadata-only approach' log message"
echo "   ✗ No 'Initializing...' blocking messages"
echo ""
