#!/usr/bin/env bash

# publish_version.sh - Verify version consistency and publish a git tag.
# Usage: ./publish_version.sh
# Requires: jq, git

set -euo pipefail

# Helper to extract version from a package.json using jq
extract_version() {
  local pkg_file="$1"
  if [[ -f "$pkg_file" ]]; then
    jq -r '.version // empty' "$pkg_file"
  else
    echo ""
  fi
}

# Collect versions
ROOT_PKG="$(pwd)/package.json"
FRONTEND_PKG="$(pwd)/frontend/package.json"
BACKEND_PKG="$(pwd)/backend/package.json"
DOCKERFILE="$(pwd)/Dockerfile"

ROOT_VER="$(extract_version "$ROOT_PKG")"
FRONTEND_VER="$(extract_version "$FRONTEND_PKG")"
BACKEND_VER="$(extract_version "$BACKEND_PKG")"
DOCKER_VER="$(grep -i 'org.opencontainers.image.version' "$DOCKERFILE" | sed -E 's/.*\"([^"]+)\".*/\1/')"

# Ensure we have a version to work with
if [[ -z "$ROOT_VER" ]]; then
  echo "Error: Could not determine version from $ROOT_PKG"
  exit 1
fi

# Verify all versions match
mismatch=0
if [[ "$ROOT_VER" != "$FRONTEND_VER" ]]; then
  echo "Version mismatch: root ($ROOT_VER) vs frontend ($FRONTEND_VER)"
  mismatch=1
fi
if [[ "$ROOT_VER" != "$BACKEND_VER" ]]; then
  echo "Version mismatch: root ($ROOT_VER) vs backend ($BACKEND_VER)"
  mismatch=1
fi
if [[ "$ROOT_VER" != "$DOCKER_VER" ]]; then
  echo "Version mismatch: root ($ROOT_VER) vs Dockerfile ($DOCKER_VER)"
  mismatch=1
fi

if [[ $mismatch -ne 0 ]]; then
  echo "Version inconsistencies detected. Fix them before publishing."
  exit 1
fi

echo "All versions consistent: $ROOT_VER"

# Tag name (prefix with v if not already)
if [[ "$ROOT_VER" =~ ^v ]]; then
  TAG="$ROOT_VER"
else
  TAG="v$ROOT_VER"
fi

# Check if tag already exists
if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "Tag $TAG already exists locally."
  read -p "Force push this tag to remote? (y/N): " answer
  if [[ "$answer" != "y" && "$answer" != "Y" ]]; then
    echo "Aborting publish."
    exit 0
  fi
  git push --force origin "$TAG"
else
  # Create tag
  git tag -a "$TAG" -m "Release $ROOT_VER"
  git push origin "$TAG"
fi

echo "Publish completed successfully."
