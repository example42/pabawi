# Script to run Pabawi Docker container with proper configuration
# This demonstrates the container runtime configuration

# Enable strict mode
$ErrorActionPreference = "Stop"

# Default values
$IMAGE_NAME = if ($env:IMAGE_NAME) { $env:IMAGE_NAME } else { "example42/pabawi:latest" }
$CONTAINER_NAME = if ($env:CONTAINER_NAME) { $env:CONTAINER_NAME } else { "pabawi" }
$PORT = if ($env:PORT) { $env:PORT } else { "3000" }
$DATA_PATH = if ($env:DATA_PATH) { $env:DATA_PATH } else { "./data" }

# Function to auto-discover Bolt project directory
function Find-BoltProject {
    # Check current directory first
    if (Test-Path "./bolt-project.yaml") {
        return "./"
    }

    # Search in subdirectories (max depth 3)
    $foundPath = Get-ChildItem -Path . -Recurse -Depth 3 -Filter "bolt-project.yaml" -File -ErrorAction SilentlyContinue | 
                 Select-Object -First 1

    if ($foundPath) {
        # Return directory path
        return $foundPath.DirectoryName
    }

    # Not found
    return $null
}

# Set BOLT_PROJECT_PATH with auto-discovery
if (-not $env:BOLT_PROJECT_PATH) {
    $discoveredPath = Find-BoltProject
    if ($discoveredPath) {
        $BOLT_PROJECT_PATH = $discoveredPath
        Write-Host "Auto-discovered Bolt project at: $BOLT_PROJECT_PATH"
    } else {
        Write-Host "Warning: No bolt-project.yaml found. Using default path: ./"
        $BOLT_PROJECT_PATH = "./"
    }
} else {
    $BOLT_PROJECT_PATH = $env:BOLT_PROJECT_PATH
    Write-Host "Using provided BOLT_PROJECT_PATH: $BOLT_PROJECT_PATH"
}

# Detect platform architecture
$arch = $env:PROCESSOR_ARCHITECTURE
switch ($arch) {
    "AMD64" {
        $PLATFORM = "linux/amd64"
    }
    "ARM64" {
        $PLATFORM = "linux/arm64"
    }
    default {
        Write-Host "Warning: Unknown architecture $arch, defaulting to linux/amd64"
        $PLATFORM = "linux/amd64"
    }
}

Write-Host "Detected architecture: $arch"
Write-Host "Using platform: $PLATFORM"

# Create data directory if it doesn't exist
if (-not (Test-Path $DATA_PATH)) {
    New-Item -ItemType Directory -Path $DATA_PATH -Force | Out-Null
}

# Note: Windows with Docker Desktop handles permissions automatically
# No need for manual ownership/permission changes like on Linux

# Get absolute paths for volume mounts (Docker on Windows requires this)
$currentPath = (Get-Location).Path
$boltProjectAbsPath = if ([System.IO.Path]::IsPathRooted($BOLT_PROJECT_PATH)) {
    $BOLT_PROJECT_PATH
} else {
    Join-Path $currentPath $BOLT_PROJECT_PATH
}

$dataAbsPath = if ([System.IO.Path]::IsPathRooted($DATA_PATH)) {
    $DATA_PATH
} else {
    Join-Path $currentPath $DATA_PATH
}

# Convert Windows paths to Docker-compatible format (C:\path -> /c/path for Git Bash style or keep as-is for Docker Desktop)
# Docker Desktop on Windows handles Windows paths natively

# Run container with proper configuration
# Note: If you need SSH keys, uncomment and adjust the line below
# -v "${env:USERPROFILE}\.ssh:/home/pabawi/.ssh:ro" `

docker run -d `
  --name "$CONTAINER_NAME" `
  --user 1001:1001 `
  --platform "$PLATFORM" `
  -p "${PORT}:3000" `
  -v "${boltProjectAbsPath}:/bolt-project" `
  -v "${dataAbsPath}:/data" `
  -e NODE_ENV=production `
  -e PORT=3000 `
  -e BOLT_PROJECT_PATH=/bolt-project `
  -e DATABASE_PATH=/data/executions.db `
  -e COMMAND_WHITELIST_ALLOW_ALL=false `
  -e COMMAND_WHITELIST="ls,pwd" `
  -e LOG_LEVEL=info `
  -e BOLT_GEM=true `
  --restart unless-stopped `
  "$IMAGE_NAME"

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "Pabawi container started successfully!" -ForegroundColor Green
    Write-Host "Container name: $CONTAINER_NAME"
    Write-Host "Access the application at: http://localhost:$PORT"
    Write-Host ""
    Write-Host "To view logs: docker logs -f $CONTAINER_NAME"
    Write-Host "To stop: docker stop $CONTAINER_NAME"
    Write-Host "To remove: docker rm $CONTAINER_NAME"
} else {
    Write-Host "Failed to start container. Exit code: $LASTEXITCODE" -ForegroundColor Red
    exit $LASTEXITCODE
}
