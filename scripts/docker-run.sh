#!/bin/bash
# Script to run Pabawi Docker container with proper configuration
# This demonstrates the container runtime configuration

set -e

# Default values
IMAGE_NAME="${IMAGE_NAME:-example42/pabawi:latest}"
CONTAINER_NAME="${CONTAINER_NAME:-pabawi}"
PORT="${PORT:-3000}"
DATA_PATH="${DATA_PATH:-./data}"

# Auto-discover Bolt project directory
discover_bolt_project() {
    # Check current directory first
    if [ -f "./bolt-project.yaml" ]; then
        echo "./"
        return 0
    fi

    # Search in subdirectories (max depth 3)
    local found_path
    found_path=$(find . -maxdepth 3 -name "bolt-project.yaml" -type f 2>/dev/null | head -n 1)

    if [ -n "$found_path" ]; then
        # Extract directory path
        dirname "$found_path"
        return 0
    fi

    # Not found
    return 1
}

# Set BOLT_PROJECT_PATH with auto-discovery
if [ -z "$BOLT_PROJECT_PATH" ]; then
    DISCOVERED_PATH=$(discover_bolt_project)
    if [ $? -eq 0 ]; then
        BOLT_PROJECT_PATH="$DISCOVERED_PATH"
        echo "Auto-discovered Bolt project at: $BOLT_PROJECT_PATH"
    else
        echo "Warning: No bolt-project.yaml found. Using default path: ./"
        BOLT_PROJECT_PATH="./"
    fi
else
    echo "Using provided BOLT_PROJECT_PATH: $BOLT_PROJECT_PATH"
fi

# Detect platform architecture
ARCH=$(uname -m)
case "$ARCH" in
    x86_64|amd64)
        PLATFORM="linux/amd64"
        ;;
    aarch64|arm64)
        PLATFORM="linux/arm64"
        ;;
    *)
        echo "Warning: Unknown architecture $ARCH, defaulting to linux/amd64"
        PLATFORM="linux/amd64"
        ;;
esac

echo "Detected architecture: $ARCH"
echo "Using platform: $PLATFORM"

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
#  -v "$HOME/.ssh:/home/pabawi/.ssh:ro" \ # Mount your .ssh dir if used in inventory.yaml
docker run -d \
  --name "$CONTAINER_NAME" \
  --user 1001:1001 \
  --platform "$PLATFORM" \
  -p "$PORT:3000" \
  -v "$(pwd)/$BOLT_PROJECT_PATH:/bolt-project" \
  -v "$(pwd)/$DATA_PATH:/data" \
  -e NODE_ENV=production \
  -e PORT=3000 \
  -e BOLT_PROJECT_PATH=/bolt-project \
  -e DATABASE_PATH=/data/executions.db \
  -e COMMAND_WHITELIST_ALLOW_ALL=true \
  -e LOG_LEVEL=info \
  -e BOLT_GEM=true \
  --restart unless-stopped \
  "$IMAGE_NAME"

echo "Pabawi container started successfully!"
echo "Container name: $CONTAINER_NAME"
echo "Access the application at: http://localhost:$PORT"
echo ""
echo "To view logs: docker logs -f $CONTAINER_NAME"
echo "To stop: docker stop $CONTAINER_NAME"
echo "To remove: docker rm $CONTAINER_NAME"
