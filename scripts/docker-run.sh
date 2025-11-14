#!/bin/bash
# Script to run Pabawi Docker container with proper configuration
# This demonstrates the container runtime configuration

set -e

# Default values
IMAGE_NAME="${IMAGE_NAME:-pabawi:latest}"
CONTAINER_NAME="${CONTAINER_NAME:-pabawi}"
PORT="${PORT:-3000}"
BOLT_PROJECT_PATH="${BOLT_PROJECT_PATH:-./}"
DATA_PATH="${DATA_PATH:-./data}"

# Create data directory if it doesn't exist
mkdir -p "$DATA_PATH"

# Run container with proper configuration
docker run -d \
  --name "$CONTAINER_NAME" \
  --user 1001:1001 \
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
