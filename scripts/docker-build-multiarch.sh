#!/bin/bash
# Multi-architecture Docker build script for Pabawi
# Supports building for amd64, arm64, and other architectures

set -e

# Default values
IMAGE_NAME="${IMAGE_NAME:-example42/pabawi}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
PLATFORMS="${PLATFORMS:-linux/amd64,linux/arm64}"
PUSH="${PUSH:-false}"
LOAD="${LOAD:-false}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Print usage
usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -n, --name NAME          Image name (default: pabawi)"
    echo "  -t, --tag TAG            Image tag (default: latest)"
    echo "  -p, --platforms PLATFORMS Comma-separated platforms (default: linux/amd64,linux/arm64)"
    echo "  --push                   Push to registry after build"
    echo "  --load                   Load image locally (single platform only)"
    echo "  -h, --help               Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0                                           # Build for amd64 and arm64"
    echo "  $0 --platforms linux/amd64 --load           # Build for amd64 and load locally"
    echo "  $0 --platforms linux/arm64 --load           # Build for arm64 and load locally"
    echo "  $0 --push                                    # Build and push to registry"
    echo "  $0 -n myrepo/pabawi -t v1.0.0 --push       # Build with custom name/tag and push"
    exit 1
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -n|--name)
            IMAGE_NAME="$2"
            shift 2
            ;;
        -t|--tag)
            IMAGE_TAG="$2"
            shift 2
            ;;
        -p|--platforms)
            PLATFORMS="$2"
            shift 2
            ;;
        --push)
            PUSH=true
            shift
            ;;
        --load)
            LOAD=true
            shift
            ;;
        -h|--help)
            usage
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            usage
            ;;
    esac
done

FULL_IMAGE_NAME="${IMAGE_NAME}:${IMAGE_TAG}"

# Validate options
if [[ "$PUSH" == "true" && "$LOAD" == "true" ]]; then
    echo -e "${RED}Error: Cannot use --push and --load together${NC}"
    exit 1
fi

if [[ "$LOAD" == "true" && "$PLATFORMS" == *","* ]]; then
    echo -e "${RED}Error: --load only supports single platform builds${NC}"
    echo -e "${YELLOW}Hint: Use --platforms linux/amd64 or --platforms linux/arm64${NC}"
    exit 1
fi

echo -e "${GREEN}=== Multi-Architecture Docker Build ===${NC}"
echo "Image: $FULL_IMAGE_NAME"
echo "Platforms: $PLATFORMS"
echo "Push: $PUSH"
echo "Load: $LOAD"
echo ""

# Check if buildx is available
if ! docker buildx version &> /dev/null; then
    echo -e "${RED}Error: docker buildx is not available${NC}"
    echo "Please install Docker with buildx support"
    exit 1
fi

# Create or use buildx builder
BUILDER_NAME="pabawi-builder"
if ! docker buildx inspect "$BUILDER_NAME" &> /dev/null; then
    echo -e "${YELLOW}Creating buildx builder: $BUILDER_NAME${NC}"
    docker buildx create --name "$BUILDER_NAME" --use
else
    echo -e "${GREEN}Using existing buildx builder: $BUILDER_NAME${NC}"
    docker buildx use "$BUILDER_NAME"
fi

# Bootstrap builder (installs QEMU if needed)
echo -e "${YELLOW}Bootstrapping builder (this may take a moment)...${NC}"
docker buildx inspect --bootstrap

# Build command
BUILD_CMD="docker buildx build"
BUILD_CMD="$BUILD_CMD --platform $PLATFORMS"
BUILD_CMD="$BUILD_CMD -t $FULL_IMAGE_NAME"
BUILD_CMD="$BUILD_CMD -f Dockerfile"

if [[ "$PUSH" == "true" ]]; then
    BUILD_CMD="$BUILD_CMD --push"
elif [[ "$LOAD" == "true" ]]; then
    BUILD_CMD="$BUILD_CMD --load"
fi

BUILD_CMD="$BUILD_CMD ."

echo -e "${GREEN}Building image...${NC}"
echo "Command: $BUILD_CMD"
echo ""

# Execute build
if eval "$BUILD_CMD"; then
    echo ""
    echo -e "${GREEN}=== Build Successful ===${NC}"
    echo "Image: $FULL_IMAGE_NAME"
    echo "Platforms: $PLATFORMS"

    if [[ "$PUSH" == "true" ]]; then
        echo -e "${GREEN}Image pushed to registry${NC}"
    elif [[ "$LOAD" == "true" ]]; then
        echo -e "${GREEN}Image loaded locally${NC}"
        echo ""
        echo "Run with: docker run -p 3000:3000 $FULL_IMAGE_NAME"
        echo "Or use: ./scripts/docker-run.sh"
    else
        echo -e "${YELLOW}Note: Image built but not pushed or loaded${NC}"
        echo "To push: docker buildx build --platform $PLATFORMS -t $FULL_IMAGE_NAME --push ."
        echo "To load (single platform): docker buildx build --platform linux/amd64 -t $FULL_IMAGE_NAME --load ."
    fi
else
    echo ""
    echo -e "${RED}=== Build Failed ===${NC}"
    exit 1
fi
