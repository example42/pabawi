#!/bin/bash
# Script to run Pabawi Docker container with proper configuration
# This demonstrates the container runtime configuration

set -e

# Default values
IMAGE_NAME="${IMAGE_NAME:-example42/pabawi:latest}"
CONTAINER_NAME="${CONTAINER_NAME:-pabawi}"
PORT="${PORT:-3000}"
BOLT_PROJECT_PATH="${BOLT_PROJECT_PATH:-./}"
DATA_PATH="${DATA_PATH:-./data}"

# Create data directory if it doesn't exist
mkdir -p "$DATA_PATH"

# Ensure proper permissions for the data directory
# The container runs as user 1001:1001, so the data directory must be writable
if [ "$(uname)" = "Linux" ]; then
    # On Linux, set ownership to match container user
    sudo chown -R 1001:1001 "$DATA_PATH" 2>/dev/null || {
        echo "Warning: Could not set ownership on $DATA_PATH"
        echo "If the container fails to start, run: sudo chown -R 1001:1001 $DATA_PATH"
    }
elif [ "$(uname)" = "Darwin" ]; then
    # On macOS, Docker Desktop handles permissions automatically
    # Just ensure directory exists and is writable
    chmod -R 755 "$DATA_PATH"
fi

# Run container with proper configuration
docker run -d \
  --name "$CONTAINER_NAME" \
  --user 1001:1001 \
  --platform linux/arm64 \
  -p "$PORT:3000" \
  -v "$(pwd)/$BOLT_PROJECT_PATH:/bolt-project:ro" \
  -v "$(pwd)/$DATA_PATH:/data" \
  -e NODE_ENV=production \
  -e PORT=3000 \
  -e BOLT_PROJECT_PATH=/bolt-project \
  -e DATABASE_PATH=/data/executions.db \
  -e COMMAND_WHITELIST_ALLOW_ALL=false \
  -e LOG_LEVEL=info \
  --restart unless-stopped \
  "$IMAGE_NAME"

echo "Pabawi container started successfully!"
echo "Container name: $CONTAINER_NAME"
echo "Access the application at: http://localhost:$PORT"
echo ""
echo "To view logs: docker logs -f $CONTAINER_NAME"
echo "To stop: docker stop $CONTAINER_NAME"
echo "To remove: docker rm $CONTAINER_NAME"
