# Pabawi Configuration Guide

Version: 0.5.0

## Overview

Pabawi is designed to work with minimal configuration by using your existing Bolt project setup. This guide covers all configuration options, from basic setup to advanced deployment scenarios.

## Table of Contents

- [Quick Start](#quick-start)
- [Environment Variables](#environment-variables)
- [Bolt Project Requirements](#bolt-project-requirements)
- [Command Whitelist Configuration](#command-whitelist-configuration)
- [Package Installation Configuration](#package-installation-configuration)
- [Expert Mode](#expert-mode)
- [Streaming Configuration](#streaming-configuration)
- [Caching Configuration](#caching-configuration)
- [Performance Configuration](#performance-configuration)
- [Deployment Scenarios](#deployment-scenarios)
- [Troubleshooting](#troubleshooting)

## Quick Start

The minimal configuration requires only a Bolt project directory:

```bash
# Set the Bolt project path (defaults to current directory)
export BOLT_PROJECT_PATH=/path/to/bolt-project

# Start the server
npm start
```

Pabawi will automatically discover:

- Node inventory from `inventory.yaml`
- Available tasks from the `modules` directory
- Bolt configuration from `bolt-project.yaml`

## Environment Variables

All configuration is managed through environment variables. You can set these in:

1. System environment
2. `.env` file in the backend directory
3. Docker environment variables

### Core Server Configuration

#### PORT

- **Type:** Integer
- **Default:** `3000`
- **Description:** HTTP port for the API server
- **Example:** `PORT=8080`

#### HOST

- **Type:** String
- **Default:** `localhost`
- **Description:** Host address to bind the server
- **Example:** `HOST=0.0.0.0` (listen on all interfaces)

#### BOLT_PROJECT_PATH

- **Type:** String (path)
- **Default:** Current working directory (`.`)
- **Description:** Path to the Bolt project directory containing `inventory.yaml`, `bolt-project.yaml`, and modules
- **Example:** `BOLT_PROJECT_PATH=/opt/bolt-project`
- **Notes:**
  - Must be an absolute path or relative to the server's working directory
  - The directory must contain a valid Bolt project structure
  - Read-only access is sufficient

#### LOG_LEVEL

- **Type:** Enum (`error`, `warn`, `info`, `debug`)
- **Default:** `info`
- **Description:** Logging verbosity level for backend services
- **Example:** `LOG_LEVEL=debug`
- **Notes:**
  - `error`: Only log errors
  - `warn`: Log warnings and errors
  - `info`: Log informational messages, warnings, and errors (recommended for production)
  - `debug`: Log all messages including debug information (useful for troubleshooting)
- **New in v0.5.0:** Centralized logging system with consistent log levels across all integration modules

#### DATABASE_PATH

- **Type:** String (path)
- **Default:** `./data/executions.db`
- **Description:** Path to SQLite database file for execution history
- **Example:** `DATABASE_PATH=/var/lib/pabawi/executions.db`
- **Notes:**
  - Directory must exist and be writable
  - Database file will be created automatically if it doesn't exist
  - Consider using a persistent volume in Docker deployments

#### BOLT_EXECUTION_TIMEOUT

- **Type:** Integer (milliseconds)
- **Default:** `300000` (5 minutes)
- **Description:** Maximum execution time for Bolt commands and tasks
- **Example:** `BOLT_EXECUTION_TIMEOUT=600000` (10 minutes)
- **Notes:**
  - Executions exceeding this timeout will be terminated
  - Set higher for long-running tasks (e.g., system updates, large deployments)
  - Minimum recommended: 60000 (1 minute)

### Bolt Integration

For detailed Bolt configuration, security whitelisting, and package task setup, please refer to the dedicated [Bolt Integration Setup Guide](./integrations/bolt.md).

### Hiera Integration

For detailed Hiera configuration, hierarchy setup, and code analysis features, please refer to the dedicated [Hiera Integration Setup Guide](./integrations/hiera.md).

### Streaming Configuration

Configure real-time output streaming for command and task execution.

#### STREAMING_BUFFER_MS

- **Type:** Integer (milliseconds)
- **Default:** `100`
- **Description:** Buffer time for batching streaming output events
- **Example:** `STREAMING_BUFFER_MS=200`
- **Notes:**
  - Lower values provide more real-time updates but increase network traffic
  - Higher values reduce network traffic but delay updates
  - Recommended range: 50-500ms

#### STREAMING_MAX_OUTPUT_SIZE

- **Type:** Integer (bytes)
- **Default:** `10485760` (10 MB)
- **Description:** Maximum total output size per execution
- **Example:** `STREAMING_MAX_OUTPUT_SIZE=52428800` (50 MB)
- **Notes:**
  - Prevents memory exhaustion from extremely verbose output
  - Output exceeding this limit will be truncated
  - Consider increasing for tasks with large output (e.g., package installations)

#### STREAMING_MAX_LINE_LENGTH

- **Type:** Integer (characters)
- **Default:** `10000`
- **Description:** Maximum length of a single output line
- **Example:** `STREAMING_MAX_LINE_LENGTH=5000`
- **Notes:**
  - Very long lines will be truncated with an indicator
  - Prevents browser performance issues with extremely long lines
  - Typical log lines are under 1000 characters

### Caching Configuration

Configure caching to improve performance and reduce load on target nodes.

#### CACHE_INVENTORY_TTL

- **Type:** Integer (milliseconds)
- **Default:** `30000` (30 seconds)
- **Description:** Time-to-live for cached inventory data
- **Example:** `CACHE_INVENTORY_TTL=60000` (1 minute)
- **Notes:**
  - Reduces repeated Bolt CLI calls for inventory
  - Set to 0 to disable caching
  - Increase for static inventories, decrease for dynamic inventories

#### CACHE_FACTS_TTL

- **Type:** Integer (milliseconds)
- **Default:** `300000` (5 minutes)
- **Description:** Time-to-live for cached facts per node
- **Example:** `CACHE_FACTS_TTL=600000` (10 minutes)
- **Notes:**
  - Reduces load on target nodes from repeated fact gathering
  - Set to 0 to disable caching
  - Facts are cached per node independently

### Performance Configuration

Configure execution queue and concurrency limits.

#### CONCURRENT_EXECUTION_LIMIT

- **Type:** Integer
- **Default:** `5`
- **Description:** Maximum number of concurrent Bolt executions
- **Example:** `CONCURRENT_EXECUTION_LIMIT=10`
- **Notes:**
  - Prevents resource exhaustion from too many simultaneous executions
  - Additional executions are queued until a slot becomes available
  - Consider system resources (CPU, memory, network) when setting
  - Higher values allow more parallelism but increase resource usage

#### MAX_QUEUE_SIZE

- **Type:** Integer
- **Default:** `50`
- **Description:** Maximum number of executions that can be queued
- **Example:** `MAX_QUEUE_SIZE=100`
- **Notes:**
  - Executions beyond this limit are rejected with an error
  - Prevents unbounded queue growth
  - Should be set based on expected workload and acceptable wait times

### UI Configuration

Configure user interface features and behavior.

#### UI_SHOW_HOME_PAGE_RUN_CHART

- **Type:** Boolean (`true` or `false`)
- **Default:** `true`
- **Description:** Show aggregated Puppet run history chart on the home page
- **Example:** `UI_SHOW_HOME_PAGE_RUN_CHART=false`
- **Notes:**
  - When enabled, displays a 7-day aggregated run history chart for all nodes on the home page
  - Requires PuppetDB integration to be enabled and active
  - Chart data is fetched on page load and refreshed every 5 minutes
  - Disable if data collection takes too long or to reduce API load
  - Individual node run history charts on node detail pages are not affected by this setting
- **New in v0.5.0:** Puppet run visualization feature

### Expert Mode Configuration

**Enhanced in v0.5.0**: Expert mode now includes unified logging, frontend log collection, and comprehensive debugging information.

Expert mode provides detailed diagnostic information for troubleshooting. When enabled, API responses include:

- Full error stack traces
- Request and correlation IDs
- Frontend logs with automatic sensitive data obfuscation
- Backend debug information
- Performance metrics (memory, CPU, cache stats)
- External API error details
- Complete request lifecycle visibility

**Enabling Expert Mode:**

- Via UI: Toggle "Expert Mode" in the navigation bar
- Via API: Include `X-Expert-Mode: true` header in requests
- Via Request Body: Set `expertMode: true` in request body

**Frontend Logger Configuration:**

Frontend logs are automatically collected when expert mode is enabled:

- **Buffer Size:** 100 log entries (circular buffer)
- **Sync Throttle:** 1 request per second to backend
- **TTL:** 5 minutes in-memory storage on backend
- **Obfuscation:** Automatic sensitive data obfuscation (passwords, tokens, API keys)
- **Correlation IDs:** Link frontend actions to backend processing

**Security Considerations:**

- Expert mode may expose internal system details
- Only enable for trusted users in production
- Frontend logs are obfuscated but may still contain sensitive context
- Backend stores logs in-memory only (no persistent storage)
- Automatic cleanup after 5 minutes

## Bolt Project Requirements

For detailed requirements on project structure, `bolt-project.yaml` best practices, and inventory configuration, please refer to the dedicated [Bolt Integration Setup Guide](./integrations/bolt.md).

## Command Whitelist Configuration

For detailed command whitelist configuration, security modes, and examples, please refer to the dedicated [Bolt Integration Setup Guide](./integrations/bolt.md).

## Package Installation Configuration

For detailed package installation configuration, including how to define available tasks and parameter mappings, please refer to the dedicated [Bolt Integration Setup Guide](./integrations/bolt.md).

## Expert Mode

Expert mode provides detailed diagnostic information for troubleshooting. It can be enabled globally or per-request.

### Enabling Expert Mode

#### In the Web Interface

1. Click the "Expert Mode" toggle in the navigation bar
2. The setting is persisted in browser localStorage
3. All subsequent requests will include expert mode headers

#### Via API

Include the `X-Expert-Mode: true` header:

```bash
curl -X POST http://localhost:3000/api/nodes/node1/command \
  -H "Content-Type: application/json" \
  -H "X-Expert-Mode: true" \
  -d '{"command": "ls -la"}'
```

Or in the request body:

```bash
curl -X POST http://localhost:3000/api/nodes/node1/command \
  -H "Content-Type: application/json" \
  -d '{"command": "ls -la", "expertMode": true}'
```

### What Expert Mode Provides

When expert mode is enabled, error responses include:

1. **Full stack traces**: Complete error stack for debugging
2. **Request IDs**: Unique identifiers for correlating logs
3. **Execution context**: Endpoint, method, timestamp
4. **Raw Bolt output**: Unprocessed CLI output
5. **Bolt commands**: The exact command executed
6. **Additional diagnostics**: Environment details, configuration

**Example error response:**

```json
{
  "error": {
    "code": "BOLT_EXECUTION_FAILED",
    "message": "Command execution failed",
    "details": "Connection timeout",
    "stackTrace": "Error: Command execution failed\n    at BoltService.runCommand...",
    "requestId": "req-abc123",
    "timestamp": "2024-01-01T00:00:00.000Z",
    "rawResponse": "Error: Connection timeout after 30s\n...",
    "executionContext": {
      "endpoint": "/api/nodes/node1/command",
      "method": "POST",
      "requestId": "req-abc123",
      "boltCommand": "bolt command run 'ls -la' --targets node1 --format json"
    }
  }
}
```

### Use Cases

- **Development**: Always enable for detailed debugging
- **Troubleshooting**: Enable when investigating issues
- **Support**: Provide expert mode output when reporting bugs
- **Production**: Disable by default, enable only when needed

### Security Considerations

Expert mode may expose:

- Internal file paths
- System configuration details
- Bolt project structure

Only enable expert mode for trusted users in production environments.

## Deployment Scenarios

### Development Environment

**Characteristics:**

- Local Bolt project
- Allow all commands
- Verbose logging
- No caching

**Configuration:**

```bash
# .env file
PORT=3000
HOST=localhost
BOLT_PROJECT_PATH=./bolt-project
BOLT_COMMAND_WHITELIST_ALLOW_ALL=true
LOG_LEVEL=debug
DATABASE_PATH=./data/executions.db
BOLT_EXECUTION_TIMEOUT=600000

# Disable caching for immediate updates
CACHE_INVENTORY_TTL=0
CACHE_FACTS_TTL=0

# Lower concurrency for local testing
CONCURRENT_EXECUTION_LIMIT=2
```

**Starting the server:**

```bash
# Install dependencies
cd backend
npm install

# Start in development mode
npm run dev
```

### Staging Environment

**Characteristics:**

- Shared Bolt project
- Restricted command whitelist
- Moderate logging
- Short cache TTLs

**Configuration:**

```bash
# .env file
PORT=3000
HOST=0.0.0.0
BOLT_PROJECT_PATH=/opt/bolt-project
BOLT_COMMAND_WHITELIST_ALLOW_ALL=false
BOLT_COMMAND_WHITELIST='["ls","pwd","uptime","systemctl status","journalctl"]'
BOLT_COMMAND_WHITELIST_MATCH_MODE=prefix
LOG_LEVEL=info
DATABASE_PATH=/var/lib/pabawi/executions.db
BOLT_EXECUTION_TIMEOUT=300000

# Short cache for testing
CACHE_INVENTORY_TTL=30000
CACHE_FACTS_TTL=60000

# Moderate concurrency
CONCURRENT_EXECUTION_LIMIT=5
```

**Starting the server:**

```bash
# Build the application
npm run build

# Start with PM2 or systemd
pm2 start dist/server.js --name pabawi
```

### Production Environment

**Characteristics:**

- Strict security
- Minimal logging
- Optimized caching
- High concurrency

**Configuration:**

```bash
# .env file
PORT=3000
HOST=0.0.0.0
BOLT_PROJECT_PATH=/opt/bolt-project
BOLT_COMMAND_WHITELIST_ALLOW_ALL=false
BOLT_COMMAND_WHITELIST='["uptime","df -h","free -m","systemctl status"]'
BOLT_COMMAND_WHITELIST_MATCH_MODE=exact
LOG_LEVEL=warn
DATABASE_PATH=/var/lib/pabawi/executions.db
BOLT_EXECUTION_TIMEOUT=300000

# Optimize caching
CACHE_INVENTORY_TTL=60000
CACHE_FACTS_TTL=300000

# Higher concurrency for production load
CONCURRENT_EXECUTION_LIMIT=10
MAX_QUEUE_SIZE=100

# Streaming optimization
STREAMING_BUFFER_MS=100
STREAMING_MAX_OUTPUT_SIZE=10485760
```

**Deployment with systemd:**

```ini
# /etc/systemd/system/pabawi.service
[Unit]
Description=Pabawi - Unified Remote Execution Interface
After=network.target

[Service]
Type=simple
User=pabawi
WorkingDirectory=/opt/pabawi
EnvironmentFile=/opt/pabawi/.env
ExecStart=/usr/bin/node /opt/pabawi/dist/server.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
# Enable and start
sudo systemctl enable pabawi
sudo systemctl start pabawi
```

### Docker Deployment

For detailed Docker deployment instructions, including volume mounts, `docker-compose` examples, and environment configuration, please refer to the dedicated [Docker Deployment Guide](./docker-deployment.md).

### Kubernetes Deployment

For detailed Kubernetes configuration including Deployments, Services, ConfigMaps, and Persistent Volumes, please refer to the dedicated [Kubernetes Deployment Guide](./kubernetes-deployment.md).

## Troubleshooting

For a comprehensive guide on diagnosing and resolving issues, including installation problems, connectivity errors, and performance tuning, please refer to the dedicated [Troubleshooting Guide](./troubleshooting.md).

## Configuration Validation

### Startup Checks

Pabawi performs validation on startup:

1. **Bolt project exists**: Verifies `BOLT_PROJECT_PATH` directory
2. **Required files present**: Checks for `inventory.yaml` and `bolt-project.yaml`
3. **Database accessible**: Tests database file creation/access
4. **Configuration valid**: Validates all environment variables

If validation fails, the server will not start and will log detailed error messages.

### Testing Configuration

Test your configuration before deployment:

```bash
# Test Bolt CLI access
bolt inventory show --format json

# Test command execution
bolt command run 'uptime' --targets localhost --format json

# Test task listing
bolt task show --format json

# Test database access
sqlite3 $DATABASE_PATH "SELECT 1"
```

### Configuration Checklist

Before deploying to production:

- [ ] `BOLT_PROJECT_PATH` points to valid Bolt project
- [ ] `inventory.yaml` contains all target nodes
- [ ] `bolt-project.yaml` has `color: false`
- [ ] Command whitelist configured appropriately
- [ ] Database path is writable
- [ ] Execution timeout is reasonable
- [ ] Caching configured for your use case
- [ ] Concurrency limits set based on resources
- [ ] Streaming limits configured
- [ ] Log level appropriate for environment
- [ ] Expert mode disabled in production (or restricted)
- [ ] UI features configured (run chart visibility)
- [ ] Integration colors displaying correctly
