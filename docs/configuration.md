# Pabawi Configuration Guide

Version: 0.1.0

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
- **Description:** Logging verbosity level
- **Example:** `LOG_LEVEL=debug`
- **Notes:**
  - `error`: Only log errors
  - `warn`: Log warnings and errors
  - `info`: Log informational messages, warnings, and errors (recommended for production)
  - `debug`: Log all messages including debug information (useful for troubleshooting)

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

### Command Whitelist Configuration

The command whitelist provides security by restricting which commands can be executed on target nodes.

#### BOLT_COMMAND_WHITELIST_ALLOW_ALL

- **Type:** Boolean (`true` or `false`)
- **Default:** `false`
- **Description:** Allow execution of any command without whitelist validation
- **Example:** `BOLT_COMMAND_WHITELIST_ALLOW_ALL=true`
- **Security Warning:** Only enable in trusted environments. When enabled, any command can be executed on target nodes.

#### BOLT_COMMAND_WHITELIST

- **Type:** JSON array of strings
- **Default:** `[]` (empty array)
- **Description:** List of allowed commands
- **Example:** `BOLT_COMMAND_WHITELIST=["ls","pwd","whoami","systemctl status"]`
- **Notes:**
  - Commands are matched based on `BOLT_COMMAND_WHITELIST_MATCH_MODE`
  - If `BOLT_COMMAND_WHITELIST_ALLOW_ALL=false` and whitelist is empty, all commands are rejected

#### BOLT_COMMAND_WHITELIST_MATCH_MODE

- **Type:** Enum (`exact`, `prefix`)
- **Default:** `exact`
- **Description:** How commands are matched against the whitelist
- **Example:** `BOLT_COMMAND_WHITELIST_MATCH_MODE=prefix`
- **Modes:**
  - `exact`: Command must exactly match a whitelist entry
  - `prefix`: Command must start with a whitelist entry (allows arguments)

**Example configurations:**

```bash
# Strict: Only allow exact commands
BOLT_COMMAND_WHITELIST_ALLOW_ALL=false
BOLT_COMMAND_WHITELIST=["ls","ps","uptime"]
BOLT_COMMAND_WHITELIST_MATCH_MODE=exact
# Allows: "ls", "pwd", "whoami"
# Rejects: "ls -la", "pwd /tmp"

# Flexible: Allow commands with arguments
BOLT_COMMAND_WHITELIST_ALLOW_ALL=false
BOLT_COMMAND_WHITELIST=["ls","systemctl","cat /var/log"]
BOLT_COMMAND_WHITELIST_MATCH_MODE=prefix
# Allows: "ls -la", "systemctl status nginx", "cat /var/log/messages"
# Rejects: "rm", "shutdown"

# Development: Allow all commands
BOLT_COMMAND_WHITELIST_ALLOW_ALL=true
# Allows: Any command
```

### Package Installation Configuration

Configure which Bolt tasks are available for package installation through the web interface.

#### BOLT_PACKAGE_TASKS

- **Type:** JSON array of task configuration objects
- **Default:** Built-in `package` task only
- **Description:** List of Bolt tasks that can be used for package installation
- **Example:**

```bash
BOLT_PACKAGE_TASKS='[
  {
    "name": "package",
    "label": "Package (built-in)",
    "parameterMapping": {
      "packageName": "name",
      "ensure": "action",
      "version": "version"
    }
  },
  {
    "name": "tp::install",
    "label": "Tiny Puppet",
    "parameterMapping": {
      "packageName": "app",
      "ensure": "ensure",
      "version": "version",
      "settings": "settings"
    }
  }
]'
```

**Task Configuration Object:**

- `name` (string): Bolt task name (e.g., `tp::install`, `package`)
- `label` (string): Display name in the web interface
- `parameterMapping` (object): Maps UI fields to task parameters
  - `packageName`: Task parameter for package name
  - `ensure`: Task parameter for installation state (present/absent/latest)
  - `version`: Task parameter for package version (optional)
  - `settings`: Task parameter for additional settings (optional)

**Common Package Tasks:**

1. **Built-in package task** (default):

   ```json
   {
     "name": "package",
     "label": "Package (built-in)",
     "parameterMapping": {
       "packageName": "name",
       "ensure": "action"
     }
   }
   ```

2. **Tiny Puppet (tp::install)**:

   ```json
   {
     "name": "tp::install",
     "label": "Tiny Puppet",
     "parameterMapping": {
       "packageName": "app",
       "ensure": "ensure",
       "settings": "settings"
     }
   }
   ```

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

## Bolt Project Requirements

Pabawi requires a properly structured Bolt project directory. This section describes the required files and their format.

### Required Files

```
bolt-project/
├── bolt-project.yaml    # Bolt project configuration
├── inventory.yaml       # Node inventory
└── modules/            # Bolt modules directory
    ├── module1/
    └── module2/
```

### bolt-project.yaml

The Bolt project configuration file defines project settings and module dependencies.

**Minimum configuration:**

```yaml
name: my-bolt-project
modulepath:
  - modules
```

**Recommended configuration:**

```yaml
name: my-bolt-project

# Module search path
modulepath:
  - modules

# Puppet apply settings
apply-settings:
  evaltrace: true
  log_level: info
  show_diff: true
  trace: false

# Concurrency settings
concurrency: 50
compile-concurrency: 5

# Disable color output for better parsing
color: false

# Module dependencies (optional)
modules:
  - name: example42/tp
  - name: example42/psick
```

**Key settings:**

- `name`: Project identifier
- `modulepath`: Directories to search for modules
- `apply-settings`: Puppet apply configuration
- `concurrency`: Maximum parallel operations
- `color`: Disable for JSON output parsing
- `modules`: Module dependencies (installed via `bolt module install`)

### inventory.yaml

The inventory file defines target nodes and their connection settings.

**Basic structure:**

```yaml
groups:
  - name: web-servers
    targets:
      - name: web-01
        uri: web-01.example.com
      - name: web-02
        uri: web-02.example.com
    config:
      ssh:
        user: deploy
        private-key: ~/.ssh/id_rsa
```

**Complete example with multiple transports:**

```yaml
groups:
  # SSH targets
  - name: linux-servers
    targets:
      - name: server-01
        uri: server-01.example.com
      - name: server-02
        uri: 192.168.1.100
    config:
      transport: ssh
      ssh:
        user: admin
        private-key: ~/.ssh/id_rsa
        port: 22
        host-key-check: true
        connect-timeout: 10

  # WinRM targets
  - name: windows-servers
    targets:
      - name: win-01
        uri: win-01.example.com
    config:
      transport: winrm
      winrm:
        user: Administrator
        password: ${WINDOWS_PASSWORD}
        ssl: true
        ssl-verify: false

  # Local execution
  - name: localhost
    targets:
      - name: local
        uri: localhost
    config:
      transport: local

  # Docker containers
  - name: containers
    targets:
      - name: app-container
        uri: app-container
    config:
      transport: docker

# Global configuration (applied to all targets)
config:
  transport: ssh
  ssh:
    port: 22
    host-key-check: true
    connect-timeout: 10
```

**Target configuration options:**

- `name`: Unique target identifier (used in Pabawi)
- `uri`: Connection URI (hostname, IP, or container name)
- `alias`: Alternative name for the target (optional)
- `config`: Connection settings (transport-specific)
- `vars`: Custom variables (optional)

**Transport types:**

1. **SSH** (most common):

   ```yaml
   config:
     transport: ssh
     ssh:
       user: username
       private-key: /path/to/key
       password: ${SSH_PASSWORD}  # Use environment variables
       port: 22
       host-key-check: true
   ```

2. **WinRM** (Windows):

   ```yaml
   config:
     transport: winrm
     winrm:
       user: Administrator
       password: ${WINRM_PASSWORD}
       ssl: true
       ssl-verify: false
   ```

3. **Local**:

   ```yaml
   config:
     transport: local
   ```

4. **Docker**:

   ```yaml
   config:
     transport: docker
   ```

### Modules Directory

The `modules/` directory contains Bolt modules with tasks and plans.

**Structure:**

```
modules/
├── mymodule/
│   ├── tasks/
│   │   ├── task1.sh
│   │   └── task1.json
│   └── metadata.json
└── anothermodule/
    └── tasks/
        └── task2.py
```

**Installing modules:**

```bash
# Install from Puppet Forge
bolt module install example42-tp

# Install from Puppetfile
bolt module install
```

**Common modules for Pabawi:**

- `example42/tp`: Tiny Puppet for package management
- `example42/psick`: PSICK module with Puppet agent task
- `puppetlabs/stdlib`: Standard library functions

## Command Whitelist Configuration

The command whitelist is a critical security feature that controls which commands can be executed on target nodes.

### Security Modes

#### 1. Locked Down (Recommended for Production)

Only specific commands are allowed:

```bash
BOLT_COMMAND_WHITELIST_ALLOW_ALL=false
BOLT_COMMAND_WHITELIST='["ls","pwd","whoami","uptime","df -h","free -m"]'
BOLT_COMMAND_WHITELIST_MATCH_MODE=exact
```

**Use case:** Production environments where only specific diagnostic commands should be allowed.

#### 2. Flexible (Development/Staging)

Allow commands with arguments:

```bash
BOLT_COMMAND_WHITELIST_ALLOW_ALL=false
BOLT_COMMAND_WHITELIST='["ls","cat","grep","systemctl","journalctl"]'
BOLT_COMMAND_WHITELIST_MATCH_MODE=prefix
```

**Use case:** Development or staging environments where operators need flexibility but still want some restrictions.

#### 3. Open (Development Only)

Allow any command:

```bash
BOLT_COMMAND_WHITELIST_ALLOW_ALL=true
```

**Use case:** Local development or trusted environments. **Not recommended for production.**

### Whitelist Examples

#### System Monitoring

```bash
BOLT_COMMAND_WHITELIST='[
  "uptime",
  "df -h",
  "free -m",
  "top -bn1",
  "ps aux",
  "netstat -tulpn",
  "ss -tulpn"
]'
BOLT_COMMAND_WHITELIST_MATCH_MODE=exact
```

#### Log Viewing

```bash
BOLT_COMMAND_WHITELIST='[
  "cat /var/log",
  "tail /var/log",
  "grep",
  "journalctl"
]'
BOLT_COMMAND_WHITELIST_MATCH_MODE=prefix
```

#### Service Management

```bash
BOLT_COMMAND_WHITELIST='[
  "systemctl status",
  "systemctl restart",
  "systemctl start",
  "systemctl stop",
  "service"
]'
BOLT_COMMAND_WHITELIST_MATCH_MODE=prefix
```

#### Web Server Operations

```bash
BOLT_COMMAND_WHITELIST='[
  "nginx -t",
  "nginx -s reload",
  "apache2ctl configtest",
  "apache2ctl graceful",
  "curl -I",
  "wget --spider"
]'
BOLT_COMMAND_WHITELIST_MATCH_MODE=exact
```

### Best Practices

1. **Start restrictive**: Begin with a minimal whitelist and add commands as needed
2. **Use prefix mode carefully**: Only use prefix matching when necessary, as it's less secure
3. **Document your whitelist**: Keep a record of why each command is allowed
4. **Regular audits**: Review and update the whitelist periodically
5. **Environment-specific**: Use different whitelists for dev, staging, and production
6. **Avoid dangerous commands**: Never whitelist destructive commands like `rm`, `dd`, `mkfs`, etc.

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

**Characteristics:**

- Containerized application
- Volume mounts for Bolt project and database
- Environment variables via docker-compose

**docker-compose.yml:**

```yaml
version: '3.8'

services:
  pabawi:
    image: pabawi:0.1.0
    container_name: pabawi
    ports:
      - "3000:3000"
    volumes:
      # Mount Bolt project (read-only)
      - /path/to/bolt-project:/bolt-project:ro
      # Mount database (persistent)
      - pabawi-data:/data
      # Mount SSL keys (read-only)
      - ~/.ssh:/root/.ssh:ro
      # Mount SSL certificates for integrations (read-only)
      - /path/to/ssl/certs:/ssl-certs:ro
      # Mount Hiera control repository (read-only)
      - /path/to/control-repo:/control-repo:ro
    environment:
      PORT: 3000
      HOST: 0.0.0.0
      BOLT_PROJECT_PATH: /bolt-project
      BOLT_COMMAND_WHITELIST_ALLOW_ALL: "false"
      BOLT_COMMAND_WHITELIST: '["ls","pwd","uptime","systemctl status"]'
      BOLT_COMMAND_WHITELIST_MATCH_MODE: exact
      LOG_LEVEL: info
      DATABASE_PATH: /data/executions.db
      BOLT_EXECUTION_TIMEOUT: 300000
      CACHE_INVENTORY_TTL: 60000
      CACHE_FACTS_TTL: 300000
      CONCURRENT_EXECUTION_LIMIT: 10
      
      # PuppetDB Integration
      PUPPETDB_ENABLED: "true"
      PUPPETDB_SERVER_URL: "https://puppetdb.example.com"
      PUPPETDB_PORT: 8081
      PUPPETDB_SSL_ENABLED: "true"
      PUPPETDB_SSL_CA: "/ssl-certs/ca.pem"
      PUPPETDB_SSL_CERT: "/ssl-certs/client.pem"
      PUPPETDB_SSL_KEY: "/ssl-certs/client-key.pem"
      PUPPETDB_TIMEOUT: 30000
      PUPPETDB_CACHE_TTL: 300000
      
      # Puppetserver Integration
      PUPPETSERVER_ENABLED: "true"
      PUPPETSERVER_SERVER_URL: "https://puppet.example.com"
      PUPPETSERVER_PORT: 8140
      PUPPETSERVER_SSL_ENABLED: "true"
      PUPPETSERVER_SSL_CA: "/ssl-certs/ca.pem"
      PUPPETSERVER_SSL_CERT: "/ssl-certs/client.pem"
      PUPPETSERVER_SSL_KEY: "/ssl-certs/client-key.pem"
      PUPPETSERVER_TIMEOUT: 30000
      PUPPETSERVER_CACHE_TTL: 300000
      
      # Hiera Integration
      HIERA_ENABLED: "true"
      HIERA_CONTROL_REPO_PATH: "/control-repo"
      HIERA_CONFIG_PATH: "hiera.yaml"
      HIERA_ENVIRONMENTS: '["production","staging"]'
      HIERA_FACT_SOURCE_PREFER_PUPPETDB: "true"
      HIERA_CACHE_ENABLED: "true"
      HIERA_CACHE_TTL: 300000
      
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  pabawi-data:
```

**Starting with Docker Compose:**

```bash
# Start the container
docker-compose up -d

# View logs
docker-compose logs -f

# Stop the container
docker-compose down
```

**Building the Docker image:**

```bash
# Build multi-stage image
docker build -t pabawi:0.1.0 .

# Or use the provided script
./scripts/docker-build-multiarch.sh
```

### Kubernetes Deployment

**Characteristics:**

- Scalable deployment
- ConfigMap for configuration
- Persistent volume for database
- Secret for sensitive data

**ConfigMap:**

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: pabawi-config
data:
  PORT: "3000"
  HOST: "0.0.0.0"
  BOLT_PROJECT_PATH: "/bolt-project"
  BOLT_COMMAND_WHITELIST_ALLOW_ALL: "false"
  BOLT_COMMAND_WHITELIST_MATCH_MODE: "exact"
  LOG_LEVEL: "info"
  DATABASE_PATH: "/data/executions.db"
  BOLT_EXECUTION_TIMEOUT: "300000"
  CACHE_INVENTORY_TTL: "60000"
  CACHE_FACTS_TTL: "300000"
  CONCURRENT_EXECUTION_LIMIT: "10"
```

**Deployment:**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: pabawi
spec:
  replicas: 1  # Note: Database is not shared, use 1 replica
  selector:
    matchLabels:
      app: pabawi
  template:
    metadata:
      labels:
        app: pabawi
    spec:
      containers:
      - name: pabawi
        image: pabawi:0.1.0
        ports:
        - containerPort: 3000
        envFrom:
        - configMapRef:
            name: pabawi-config
        env:
        - name: BOLT_COMMAND_WHITELIST
          value: '["ls","pwd","uptime"]'
        volumeMounts:
        - name: bolt-project
          mountPath: /bolt-project
          readOnly: true
        - name: data
          mountPath: /data
        - name: ssh-keys
          mountPath: /root/.ssh
          readOnly: true
        livenessProbe:
          httpGet:
            path: /api/health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /api/health
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
      volumes:
      - name: bolt-project
        configMap:
          name: bolt-project-files
      - name: data
        persistentVolumeClaim:
          claimName: pabawi-data
      - name: ssh-keys
        secret:
          secretName: ssh-keys
          defaultMode: 0600
```

**Service:**

```yaml
apiVersion: v1
kind: Service
metadata:
  name: pabawi
spec:
  selector:
    app: pabawi
  ports:
  - port: 80
    targetPort: 3000
  type: LoadBalancer
```

## Troubleshooting

### Configuration Issues

#### Problem: "Bolt configuration files not found"

**Cause:** `BOLT_PROJECT_PATH` is incorrect or files are missing.

**Solution:**

1. Verify the path exists: `ls -la $BOLT_PROJECT_PATH`
2. Check for required files:

   ```bash
   ls -la $BOLT_PROJECT_PATH/inventory.yaml
   ls -la $BOLT_PROJECT_PATH/bolt-project.yaml
   ```

3. Ensure the path is absolute or relative to the server's working directory

#### Problem: "All commands are rejected"

**Cause:** `BOLT_COMMAND_WHITELIST_ALLOW_ALL=false` with empty whitelist.

**Solution:**

1. Enable allow-all mode: `BOLT_COMMAND_WHITELIST_ALLOW_ALL=true`
2. Or add commands to whitelist: `BOLT_COMMAND_WHITELIST='["ls","pwd"]'`

#### Problem: "Command not in whitelist" with prefix mode

**Cause:** Command doesn't start with any whitelist entry.

**Solution:**

1. Check the whitelist: `echo $BOLT_COMMAND_WHITELIST`
2. Verify match mode: `echo $BOLT_COMMAND_WHITELIST_MATCH_MODE`
3. Add the command prefix to whitelist

### Database Issues

#### Problem: "Database error: unable to open database file"

**Cause:** Database directory doesn't exist or lacks write permissions.

**Solution:**

1. Create the directory: `mkdir -p $(dirname $DATABASE_PATH)`
2. Set permissions: `chmod 755 $(dirname $DATABASE_PATH)`
3. Verify write access: `touch $DATABASE_PATH && rm $DATABASE_PATH`

#### Problem: "Database is locked"

**Cause:** Multiple processes accessing the same database file.

**Solution:**

1. Ensure only one Pabawi instance is running
2. Check for stale lock files: `ls -la $DATABASE_PATH-*`
3. Stop all instances and restart

### Performance Issues

#### Problem: "Slow inventory loading"

**Cause:** Large inventory with no caching.

**Solution:**

1. Enable inventory caching: `CACHE_INVENTORY_TTL=60000`
2. Increase cache TTL for static inventories
3. Consider optimizing Bolt inventory structure

#### Problem: "Too many concurrent executions"

**Cause:** `CONCURRENT_EXECUTION_LIMIT` too high for system resources.

**Solution:**

1. Reduce limit: `CONCURRENT_EXECUTION_LIMIT=5`
2. Monitor system resources (CPU, memory)
3. Increase `MAX_QUEUE_SIZE` if needed

#### Problem: "Execution queue full"

**Cause:** More executions queued than `MAX_QUEUE_SIZE`.

**Solution:**

1. Increase queue size: `MAX_QUEUE_SIZE=100`
2. Increase concurrent limit: `CONCURRENT_EXECUTION_LIMIT=10`
3. Wait for current executions to complete

### Streaming Issues

#### Problem: "Streaming connection drops"

**Cause:** Network timeout or proxy configuration.

**Solution:**

1. Check network connectivity
2. Configure proxy to allow SSE connections
3. Increase streaming buffer: `STREAMING_BUFFER_MS=200`

#### Problem: "Output truncated"

**Cause:** Output exceeds `STREAMING_MAX_OUTPUT_SIZE`.

**Solution:**

1. Increase limit: `STREAMING_MAX_OUTPUT_SIZE=52428800` (50 MB)
2. Or reduce task verbosity
3. Check logs for truncation warnings

### Bolt Integration Issues

#### Problem: "Bolt command timeout"

**Cause:** Execution exceeds `BOLT_EXECUTION_TIMEOUT`.

**Solution:**

1. Increase timeout: `BOLT_EXECUTION_TIMEOUT=600000` (10 minutes)
2. Optimize Bolt tasks to run faster
3. Check target node connectivity

#### Problem: "Cannot parse Bolt output"

**Cause:** Bolt CLI returning unexpected format.

**Solution:**

1. Enable expert mode to see raw output
2. Verify Bolt CLI version: `bolt --version`
3. Check `bolt-project.yaml` has `color: false`
4. Review Bolt CLI logs

### Environment Variable Issues

#### Problem: "Configuration not applied"

**Cause:** Environment variables not loaded.

**Solution:**

1. Verify `.env` file location (should be in backend directory)
2. Check file permissions: `ls -la backend/.env`
3. Restart the server after changes
4. Use `printenv` to verify variables are set

#### Problem: "JSON parse error in BOLT_COMMAND_WHITELIST"

**Cause:** Invalid JSON syntax.

**Solution:**

1. Validate JSON: `echo $BOLT_COMMAND_WHITELIST | jq .`
2. Use single quotes around the value
3. Escape special characters properly
4. Example: `BOLT_COMMAND_WHITELIST='["ls","pwd"]'`

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

## Additional Resources

- [Bolt Documentation](https://puppet.com/docs/bolt/)
- [Pabawi API Documentation](./api.md)
- [Pabawi User Guide](./user-guide.md) (coming soon)
- [Troubleshooting Guide](./troubleshooting.md) (coming soon)

## Support

For configuration assistance:

1. Check this guide and the troubleshooting section
2. Enable expert mode for detailed error information
3. Review server logs for configuration errors
4. Consult the Bolt documentation for Bolt-specific issues
