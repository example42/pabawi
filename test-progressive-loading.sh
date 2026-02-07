#!/bin/bash

echo "=== Progressive Loading Architecture Tests ==="
echo ""

# Test 1: Metadata endpoint
echo "1. Testing metadata endpoint..."
curl -s -w "\nTime: %{time_total}s\n" http://localhost:3000/api/v1/plugins | jq '.plugins | length' | xargs echo "Plugins returned:"
echo ""

# Test 2: Summary endpoints
echo "2. Testing summary endpoints..."
for plugin in ansible ssh; do
    echo "  - $plugin summary:"
    curl -s -w "\n  Time: %{time_total}s\n" "http://localhost:3000/api/v1/plugins/$plugin/summary" | head -5
    echo ""
done

# Test 3: Data endpoints
echo "3. Testing data endpoints..."
for plugin in ansible ssh; do
    echo "  - $plugin data:"
    curl -s -w "\n  Time: %{time_total}s\n" "http://localhost:3000/api/v1/plugins/$plugin/data" | head -5
    echo ""
done

# Test 4: Error handling
echo "4. Testing error handling..."
echo "  - Non-existent plugin:"
curl -s "http://localhost:3000/api/v1/plugins/nonexistent/summary" | jq '.'
echo ""

# Test 5: Widgets with home-summary slot
echo "5. Testing widgets endpoint..."
curl -s "http://localhost:3000/api/v1/widgets" | jq '.slots | contains(["home-summary"])'
echo ""

echo "=== Tests Complete ==="
