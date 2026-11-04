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

# Ensure we have a version to work with
if [[ -z "$ROOT_VER" ]]; then
  echo "Error: Could not determine version from $ROOT_PKG"
  exit 1
fi

# Every reference scripts/update-version.js writes must match the root version.
mismatch=0
check() {
  local label="$1" value="$2"
  if [[ "$value" != "$ROOT_VER" ]]; then
    echo "Version mismatch: root ($ROOT_VER) vs $label (${value:-missing})"
    mismatch=1
  fi
}

check frontend "$(extract_version "$FRONTEND_PKG")"
check backend "$(extract_version "$BACKEND_PKG")"
for key in version 'packages[""].version' packages.backend.version packages.frontend.version; do
  check "package-lock.json $key" "$(jq -r ".$key // empty" package-lock.json 2>/dev/null)"
done
for dockerfile in "$DOCKERFILE" Dockerfile.alpine Dockerfile.ubuntu; do
  check "$(basename "$dockerfile")" "$(grep -i 'org.opencontainers.image.version' "$dockerfile" | sed -E 's/.*"([^"]+)".*/\1/')"
done
check "Chart.yaml appVersion" "$(sed -nE 's/^appVersion:[[:space:]]*"([^"]*)".*/\1/p' charts/pabawi/Chart.yaml)"
check "openapi.yaml info.version" "$(sed -nE 's/^  version:[[:space:]]*([^[:space:]]+).*/\1/p' docs/openapi.yaml)"
check "server.ts /api/health" "$(grep -A1 'message: "Backend API is running"' backend/src/server.ts | sed -nE 's/.*version:[[:space:]]*"([^"]+)".*/\1/p')"
check "Navigation.svelte header" "$(sed -nE 's/.*>v([0-9]+\.[0-9]+\.[0-9]+[^<]*)<.*/\1/p' frontend/src/components/Navigation.svelte | head -1)"
if ! grep -qF "## [$ROOT_VER]" CHANGELOG.md; then
  echo "Missing CHANGELOG.md section: ## [$ROOT_VER]"
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
