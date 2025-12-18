#!/bin/bash

# Script to update version across all project files
# Usage: ./scripts/update-version.sh <new-version>

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if version argument is provided
if [ -z "$1" ]; then
    echo -e "${RED}Error: Version number required${NC}"
    echo "Usage: $0 <version>"
    echo "Example: $0 0.3.0"
    exit 1
fi

NEW_VERSION="$1"

# Validate version format (semantic versioning)
if ! [[ "$NEW_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?$ ]]; then
    echo -e "${RED}Error: Invalid version format${NC}"
    echo "Version must follow semantic versioning (e.g., 0.3.0 or 0.3.0-beta.1)"
    exit 1
fi

echo -e "${GREEN}Updating project to version ${NEW_VERSION}${NC}\n"

# Function to update package.json files
update_package_json() {
    local file=$1
    if [ -f "$file" ]; then
        echo -e "${YELLOW}Updating ${file}${NC}"
        # Use sed to update version field
        if [[ "$OSTYPE" == "darwin"* ]]; then
            # macOS
            sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"${NEW_VERSION}\"/" "$file"
        else
            # Linux
            sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"${NEW_VERSION}\"/" "$file"
        fi
        echo -e "${GREEN}✓ Updated ${file}${NC}"
    else
        echo -e "${RED}✗ File not found: ${file}${NC}"
    fi
}

# Function to update README.md
update_readme() {
    local file="README.md"
    if [ -f "$file" ]; then
        echo -e "${YELLOW}Updating ${file}${NC}"
        if [[ "$OSTYPE" == "darwin"* ]]; then
            # macOS - Update version line
            sed -i '' "s/^Version [0-9]\+\.[0-9]\+\.[0-9]\+/Version ${NEW_VERSION}/" "$file"
            # Update docker image tags in examples
            sed -i '' "s/example42\/padawi:[0-9]\+\.[0-9]\+\.[0-9]\+/example42\/padawi:${NEW_VERSION}/g" "$file"
        else
            # Linux
            sed -i "s/^Version [0-9]\+\.[0-9]\+\.[0-9]\+/Version ${NEW_VERSION}/" "$file"
            sed -i "s/example42\/padawi:[0-9]\+\.[0-9]\+\.[0-9]\+/example42\/padawi:${NEW_VERSION}/g" "$file"
        fi
        echo -e "${GREEN}✓ Updated ${file}${NC}"
    else
        echo -e "${RED}✗ File not found: ${file}${NC}"
    fi
}

# Update all package.json files
update_package_json "package.json"
update_package_json "backend/package.json"
update_package_json "frontend/package.json"

# Update README.md
update_readme

echo -e "\n${GREEN}Version update complete!${NC}"
echo -e "${YELLOW}Files updated to version ${NEW_VERSION}${NC}\n"

# Show git status
echo -e "${YELLOW}Git status:${NC}"
git status --short

echo -e "\n${YELLOW}Next steps:${NC}"
echo "1. Review the changes: git diff"
echo "2. Run tests: npm test"
echo "3. Commit changes: git add . && git commit -m 'chore: bump version to ${NEW_VERSION}'"
echo "4. Create git tag: git tag v${NEW_VERSION}"
echo "5. Push changes: git push && git push --tags"
