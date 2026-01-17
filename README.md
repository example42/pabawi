# Pabawi

<table>
<tr>
<td width="150">
  <img src="frontend/favicon/web-app-manifest-512x512.png" alt="Pabawi Logo" width="128" height="128">
</td>
<td>
  <h3>Classic Infrastructures Command & Control Awesomeness</h3>
  <p>Pabawi is a web frontend for infrastructure management, inventory and remote execution. It currently provides integrations with Puppet, Bolt, PuppetDB, and Hiera. It supports both Puppet Enterprise and Open Source Puppet / OpenVox. It provides a unified web interface for managing infrastructure, executing commands, viewing system information, and tracking operations across your entire environment.</p>
</td>
</tr>
</table>

## Table of Contents

- [Security Notice](#security-notice)
- [Features](#features)
  - [Core Capabilities](#core-capabilities)
  - [Advanced Features](#advanced-features)
- [Project Structure](#project-structure)
- [Screenshots](#screenshots)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Development / Debugging](#development--debugging)
- [Build](#build)
- [Configuration](#configuration)
  - [Basic Configuration](#basic-configuration)
  - [Bolt Integration](#bolt-integration)
  - [PuppetDB Integration](#puppetdb-integration)
  - [PuppetServer Integration](#puppetserver-integration)
  - [Hiera Integration](#hiera-integration)
- [Testing](#testing)
  - [Unit and Integration Tests](#unit-and-integration-tests)
  - [End-to-End Tests](#end-to-end-tests)
  - [Development Pre-commit Hooks](#development-pre-commit-hooks)
- [Docker Deployment](#docker-deployment)
  - [Quick Start](#quick-start)
  - [Running with Docker Compose](#running-with-docker-compose)
- [Troubleshooting](#troubleshooting)
  - [Common Issues](#common-issues)
- [Roadmap](#roadmap)
  - [Planned Features](#planned-features)
  - [Version History](#version-history)
- [License](#license)
- [Support](#support)
  - [Documentation](#documentation)
  - [Getting Help](#getting-help)
- [Acknowledgments](#acknowledgments)
- [Documentation](#documentation-1)
  - [Getting Started](#getting-started)
  - [API Reference](#api-reference)
  - [Integration Setup](#integration-setup)
  - [Additional Resources](#additional-resources)

## Security Notice

**⚠️ IMPORTANT: Currently Pabawi is designed for local use by Puppet administrators and developers on their workstations.**

- **No Built-in Authentication**: Pabawi currently has no user authentication or authorization system
- **Localhost Access Only**: The application should only be accessed via `localhost` or `127.0.0.1`
- **Network Access Not Recommended**: Do not expose Pabawi directly to network access without external authentication
- **Production Deployment**: If network access is required, use a reverse proxy (nginx, Apache) with proper authentication and SSL termination
- **Privileged Operations**: Pabawi can execute commands and tasks on your infrastructure, based on your Bolt configurations - restrict access accordingly

For production or multi-user environments, implement external authentication through a reverse proxy before allowing network access.

## Features

### Core Capabilities

- **Multi-Source Inventory**: View and manage nodes from Bolt inventory and PuppetDB
- **Command Execution**: Run ad-hoc commands on remote nodes with whitelist security
- **Task Execution**: Execute Bolt tasks with parameters automatic discovery
- **Package Management**: Install and manage packages across your infrastructure
- **Execution History**: Track all operations with detailed results and re-execution capability
- **Dynamic Inventory**: Automatically discover nodes from PuppetDB
- **Node Facts**: View comprehensive system information from Puppet agents
- **Puppet Reports**: Browse detailed Puppet run reports with metrics and resource changes
- **Catalog Inspection**: Examine compiled Puppet catalogs and resource relationships
- **Event Tracking**: Monitor individual resource changes and failures over time
- **Catalogs comprison**: Compare and show differences in catalogs from different environments
- **Hiera Data Browser**: Explore hierarchical configuration data and key usage analysis

### Advanced Features

- **Re-execution**: Quickly repeat previous operations with preserved or modified parameters
- **Expert Mode**: View complete command lines and full output for debugging and auditing
- **Real-time Streaming**: Monitor command and task execution with live output
- **Multi-Source Architecture**: Seamlessly integrate data from multiple backend systems
- **Graceful Degradation**: Continue operating when individual integrations are unavailable

## Project Structure

```text
padawi/
├── frontend/          # Svelte 5 + Vite frontend
│   ├── src/
│   │   ├── components/    # UI components
│   │   ├── pages/         # Page components
│   │   └── lib/           # Utilities and stores
│   ├── package.json
│   └── vite.config.ts
├── backend/           # Node.js + TypeScript API server
│   ├── src/
│   │   ├── bolt/          # Bolt integration
│   │   ├── integrations/  # Plugin architecture
│   │   │   ├── bolt/      # Bolt plugin
│   │   │   ├── puppetdb/  # PuppetDB integration
│   │   │   ├── puppetserver/ # Puppetserver integration
│   │   │   └── hiera/     # Hiera integration
│   │   ├── database/      # SQLite database
│   │   ├── routes/        # API endpoints
│   │   └── services/      # Business logic
│   ├── test/              # Unit and integration tests
│   ├── package.json
│   └── tsconfig.json
├── docs/              # Documentation
└── package.json       # Root workspace configuration
```

## Screenshots

> **📸 [View Complete Screenshots Gallery](docs/screenshots.md)** - Comprehensive visual documentation of all Pabawi features and interfaces.

### Inventory and Node detail page

<img src="docs/screenshots/inventory.png" alt="Inventory Page" width="400"> <img src="docs/screenshots/node-detail-page.png" alt="Node Detail Page" width="400">

*Node inventory with multi-source support and node detail interface for operations*

### Task Execution and Detaila

<img src="docs/screenshots/task-execution.png" alt="Task Execution" width="400"> <img src="docs/screenshots/execution-details.png" alt="Execution Details" width="400">

*Bolt task execution interface and and detailed execution results with re-run capabilities*

### Puppet reports and Bolt executions
<img src="docs/screenshots/puppet-reports.png" alt="Puppet Reports" width="400">
<img src="docs/screenshots/executions-list.png" alt="Executions List" width="400"> 

*Puppet run reports with detailed metrics and Bolt Execution history with filtering *

## Prerequisites

- Node.js 20+
- npm 9+
- Contrainer engine (when used via container image)

### Bolt Integration

- Bolt CLI installed
- A local bolt project directory
- Eventual ssh keys used in Bolt configuration

### PuppetDB Integration

- Network access to PuppetDB port 8081
- A local certificate signed the the PuppetCA used by PuppetDB

### PuppetServer Integration

- Network access to PuppetServer port 8140
- A local certificate signed the the PuppetCA used by PuppetServer

### Hiera Integration

- A local copy of your control-repo, with eventual external modules in Puppetfile
- If PuppetDB integration is not active, node facts files must be present on a local directory

## Installation

```bash
# Install all dependencies
npm run install:all
```

## Development / debugging

```bash
# Run backend (port 3000)
npm run dev:backend

# Run frontend (port 5173)
npm run dev:frontend
```

### Accessing the Application

**⚠️ Security Reminder: Access Pabawi only via localhost for security**

**Development Mode** (when running both servers separately):

- **Frontend UI**: <http://localhost:5173> (Main application interface)
- **Backend API**: <http://localhost:3000/api> (API endpoints)

**Production Mode** (Docker or built application):

- **Application**: <http://localhost:3000> (Frontend and API served together)
- The backend serves the built frontend as static files

**Network Access**: If you need to access Pabawi from other machines, use SSH port forwarding or implement a reverse proxy with proper authentication. Do not expose Pabawi directly to the network without authentication.

## Build

```bash
# Build both frontend and backend
npm run build
```

## Configuration

### Basic Configuration

Copy `backend/.env.example` to `backend/.env` and configure the integrations you want, starting from general settings:

```env
# Pabawi General Configurations
PORT=3000
LOG_LEVEL=info
DATABASE_PATH=./data/executions.db
```

### Bolt integration

```env
# Bolt Related settings
BOLT_PROJECT_PATH=.
BOLT_COMMAND_WHITELIST_ALLOW_ALL=false
BOLT_COMMAND_WHITELIST=["ls","pwd","whoami"]
BOLT_EXECUTION_TIMEOUT=300000
```

### PuppetDB Integration

To enable PuppetDB integration, add to `backend/.env`:

```env
# Enable and configure PuppetDB integration
PUPPETDB_ENABLED=true
PUPPETDB_SERVER_URL=https://puppetdb.example.com
PUPPETDB_PORT=8081

# Token based Authentication (Puppet Enterprise only)
PUPPETDB_TOKEN=your-token-here

# Certs based Authentication (Puppet Enterprise and Open Source Puppet)
PUPPETDB_SSL_ENABLED=true
PUPPETDB_SSL_CA=/path/to/ca.pem
PUPPETDB_SSL_CERT=/path/to/cert.pem
PUPPETDB_SSL_KEY=/path/to/key.pem
PUPPETDB_SSL_REJECT_UNAUTHORIZED=true
```

See [PuppetDB Integration Setup Guide](docs/puppetdb-integration-setup.md) for detailed configuration instructions.

### PuppetServer Integration

To enable PuppetServer integration, add to `backend/.env`:

```env
# Enable and configure PuppetServer integration
PUPPETSERVER_ENABLED=true
PUPPETSERVER_SERVER_URL=https://puppet.example.com
PUPPETSERVERT_PORT=8140

# Token based Authentication (Puppet Enterprise only)
PUPPETSERVER_TOKEN=your-token-here

# Certs based Authentication (Puppet Enterprise and Open Source Puppet)
PUPPETSERVER_SSL_ENABLED=true
PUPPETSERVER_SSL_CA=/path/to/ca.pem
PUPPETSERVER_SSL_CERT=/path/to/cert.pem
PUPPETSERVER_SSL_KEY=/path/to/key.pem
PUPPETSERVER_SSL_REJECT_UNAUTHORIZED=true
```

See [PuppetServer Integration Setup Guide](docs/puppetserver-integration-setup.md) for detailed configuration instructions.


### Hiera Integration

To enable Hiera integration, add to `backend/.env`:

```env
# Enable Hiera
HIERA_ENABLED=true
HIERA_CONTROL_REPO_PATH=/path/to/control-repo

# Optional Configuration
HIERA_CONFIG_PATH=hiera.yaml
HIERA_ENVIRONMENTS=["production","development"]

# Fact Source Configuration
HIERA_FACT_SOURCE_PREFER_PUPPETDB=true
HIERA_FACT_SOURCE_LOCAL_PATH=/path/to/facts

# Cache Configuration
HIERA_CACHE_ENABLED=true
HIERA_CACHE_TTL=300000
HIERA_CACHE_MAX_ENTRIES=10000

# Code Analysis Configuration
HIERA_CODE_ANALYSIS_ENABLED=true
HIERA_CODE_ANALYSIS_LINT_ENABLED=true
```


## Testing

### Unit and Integration Tests

```bash
# Run all unit and integration tests
npm test

# Run backend tests only
npm test --workspace=backend

# Run frontend tests only
npm test --workspace=frontend
```

### End-to-End Tests

```bash
# Run all E2E tests
npm run test:e2e

# Run E2E tests with UI (interactive)
npm run test:e2e:ui

# Run E2E tests in headed mode (visible browser)
npm run test:e2e:headed
```

See [E2E Testing Guide](docs/e2e-testing.md) for detailed information about end-to-end testing.

### Development Pre-commit Hooks

This project uses pre-commit hooks to ensure code quality and security before commits.

```bash
# Install pre-commit (requires Python)
pip install pre-commit

# Or using homebrew on macOS
brew install pre-commit

# Install the git hooks
pre-commit install
pre-commit install --hook-type commit-msg

# Run all hooks on all files
pre-commit run --all-files

# Run specific hook
pre-commit run eslint --all-files

# Update hooks to latest versions
pre-commit autoupdate
```

```bash
# Skip pre-commit hooks (not recommended)
git commit --no-verify -m "message"
```

## Docker Deployment

For comprehensive Docker deployment instructions including all integrations, see the [Docker Deployment Guide](docs/docker-deployment.md).

### Quick Start

### Running the Docker Image

```bash
# Using the provided script (adapt as needed)
./scripts/docker-run.sh

# Or, without the need to git clone, manually executing a command as follows:
docker run -d \
  --name pabawi \
  --user "$(id -u):1001" \ # Your user must be able to read all the mounted files
  -p 127.0.0.1:3000:3000 \
  --platform "amd64" \ # amd64 or arm64
  -v "$(pwd):/bolt-project:ro" \
  -v "$(pwd)/data:/data" \
  -v "$(pwd)/certs:/certs" \ 
  -v "$HOME/.ssh:/home/pabawi/.ssh" \
  --env-file ./env \
  example42/padawi:latest
```

Access the application at <http://localhost:3000>

** Important**: The amount of volume mounts is up to you and depends on where, in the host filesystem, are the files which are needed by the Pabawi instance running inside the container. Also, the paths referenced in your .env file must be relative to container file system.

Examples:

| Kind of data | Path on the host | Volume Mount option | Env setting |
| ----------- | ---------------- | ------------------- | ----------- |
| Bolt project dir | $HOME/bolt-project | -v "${HOME}/bolt-project:/bolt:ro" | BOLT_PROJECT_PATH=/bolt | 
| Control Repo | $HOME/control-repo | -v "${HOME}/control-repo:/control-repo:ro" | HIERA_CONTROL_REPO_PATH=/control-repo | 
| Pabawi Data | $HOME/pabawi/data | -v "${HOME}/pabawi/data:/data" | DATABASE_PATH=/data/pabawi.db | 
| Puppet certs - Ca | $HOME/puppet/certs/ca.pem | -v "${HOME}/puppet/certs:/certs" | PUPPETSERVER_SSL_CA=/certs/ca.pem | 
| Puppet certs - Pabawi user cert | $HOME/puppet/certs/pabawi.pem | -v "${HOME}/puppet/certs:/certs" | PUPPETDB_SSL_CERT=/certs/pabawi.pem | 
| Puppet certs - Pabawi user key | $HOME/puppet/certs/private/pabawi.pem | -v "${HOME}/puppet/certs:/certs" | PUPPETDB_SSL_KEY=/certs/pabawi.pem | 

PUPPETSERVER_SSL_* settings can use the same paths of the relevant PUPPETDB_SSL_ ones.

**⚠️ Security Note**: With current version is always better to expose access on;y via localhost. If you run pabawi on a remote node, use SSH port forwarding:
```bash
# SSH port forwarding for remote access
ssh -L 3000:localhost:3000 user@your-pabawi-host
```

If you want to allow Pabawi access to different users, you should configure a reverse proxy with authentication.


### Running with Docker Compose

The docker-compose.yml file includes comprehensive configuration for all integrations:

```bash
# Start the service
docker-compose up -d

# View logs
docker-compose logs -f

# Stop the service
docker-compose down
```

#### Enabling Integrations

To enable integrations, create a `.env` file in the project root with your configuration:

```env
# PuppetDB Integration
PUPPETDB_ENABLED=true
PUPPETDB_SERVER_URL=https://puppetdb.example.com
PUPPETDB_PORT=8081
PUPPETDB_TOKEN=your-token-here
PUPPETDB_SSL_ENABLED=true
PUPPETDB_SSL_CA=/ssl-certs/ca.pem
PUPPETDB_SSL_CERT=/ssl-certs/client.pem
PUPPETDB_SSL_KEY=/ssl-certs/client-key.pem

# Puppetserver Integration
PUPPETSERVER_ENABLED=true
PUPPETSERVER_SERVER_URL=https://puppet.example.com
PUPPETSERVER_PORT=8140
PUPPETSERVER_SSL_ENABLED=true
PUPPETSERVER_SSL_CA=/ssl-certs/ca.pem
PUPPETSERVER_SSL_CERT=/ssl-certs/client.pem
PUPPETSERVER_SSL_KEY=/ssl-certs/client-key.pem

# Hiera Integration
HIERA_ENABLED=true
HIERA_CONTROL_REPO_PATH=/control-repo
HIERA_ENVIRONMENTS=["production","staging"]
HIERA_FACT_SOURCE_PREFER_PUPPETDB=true
```

#### Volume Mounts for Integrations

Update the docker-compose.yml volumes section to include your SSL certificates and control repository:

```yaml
volumes:
  # Existing mounts
  - ./bolt-project:/bolt-project:ro
  - ./data:/data
  
  # SSL certificates for PuppetDB/Puppetserver
  - /path/to/ssl/certs:/ssl-certs:ro
  
  # Hiera control repository
  - /path/to/control-repo:/control-repo:ro
```

Access the application at <http://localhost:3000>


### Troubleshooting

### Common Issues

#### Database Permission Errors

If you see `SQLITE_CANTOPEN: unable to open database file`, the container user (UID 1001) doesn't have write access to the `/data` volume.

**On Linux:**

```bash
# Set correct ownership on the data directory
sudo chown -R 1001:1001 ./data
```

**On macOS/Windows:**
Docker Desktop handles permissions automatically. Ensure the directory exists:

```bash
mkdir -p ./data
```

**Using the docker-run.sh script:**
The provided script automatically handles permissions on Linux systems.

#### PuppetDB Connection Issues

If PuppetDB integration shows "Disconnected":

1. Verify PuppetDB is running and accessible
2. Check configuration in `backend/.env`
3. Test connectivity: `curl https://puppetdb.example.com:8081/pdb/meta/v1/version`
4. Review logs with `LOG_LEVEL=debug`
5. See [PuppetDB Integration Setup Guide](docs/puppetdb-integration-setup.md)

#### Hiera Integration Issues

If Hiera integration shows "Not Found" for all keys:

1. Verify control repository path is correct (`HIERA_CONTROL_REPO_PATH`)
2. Check `hiera.yaml` exists in control repository root
3. Ensure hieradata directories exist and contain YAML files
4. Verify node facts are available (PuppetDB or local files)
5. Check hierarchy path interpolation with available facts
6. Review logs with `LOG_LEVEL=debug` for detailed error messages

#### Expert Mode Not Showing Full Output

If expert mode doesn't show complete output:

1. Ensure expert mode is enabled (toggle in navigation)
2. Check execution was run with expert mode enabled
3. Verify database has `stdout` and `stderr` columns
4. For historical executions, only those run in v0.2.0+ have full output

See [Troubleshooting Guide](docs/troubleshooting.md) for more solutions.


## Roadmap

### Planned Features

- **Additional Integrations**: Ansible, Choria, Tiny Puppet
- **Additional Integrations (to evaluate)**: Terraform, AWS CLI, Azure CLI, Kubernetes
- **Scheduled Executions**: Cron-like scheduling for recurring tasks
- **Custom Dashboards**: User-configurable dashboard widgets
- **RBAC**: Role-based access control and user/groups management
- **Audit Logging**: Comprehensive audit trail
- **CLI**: Command Line tool

### Version History

- **v0.4.0**: Hiera integration, puppetserver CA management removal, enhanced plugin architecture
- **v0.3.0**: Puppetserver integration, interface enhancements
- **v0.2.0**: PuppetDB integration, re-execution, expert mode enhancements
- **v0.1.0**: Initial release with Bolt integration

## License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.

## Support

### Documentation

- [Architecture Documentation](docs/architecture.md) - System architecture and plugin design
- [Configuration Guide](docs/configuration.md)
- [User Guide](docs/user-guide.md)
- [API Documentation](docs/api.md)
- [PuppetDB Integration Setup](docs/puppetdb-integration-setup.md)

### Getting Help

1. Check the documentation
2. Review [Troubleshooting Guide](docs/troubleshooting.md)
3. Enable expert mode for detailed diagnostics
4. Search existing GitHub Issues
5. Create a new issue with:
   - Version information
   - Configuration (sanitized)
   - Steps to reproduce
   - Error messages and logs

## Acknowledgments

Pabawi builds on excellent open-source projects:

- **Puppet Bolt**: Remote task execution engine
- **PuppetDB**: Centralized Puppet data storage
- **Svelte 5**: Reactive UI framework
- **Node.js**: Backend runtime
- **TypeScript**: Type-safe development
- **SQLite**: Embedded database

Special thanks to all contributors and the Puppet community.

## Documentation

### Getting Started

- [Architecture Documentation](docs/architecture.md) - System architecture and plugin design
- [Configuration Guide](docs/configuration.md) - Complete configuration reference
- [User Guide](docs/user-guide.md) - Comprehensive user documentation
- [API Documentation](docs/api.md) - REST API reference

### API Reference

- [Integrations API Documentation](docs/integrations-api.md) - Complete API reference for all integrations
- [API Endpoints Reference](docs/api-endpoints-reference.md) - Quick reference table of all endpoints
- [Authentication Guide](docs/authentication.md) - Authentication setup and troubleshooting
- [Error Codes Reference](docs/error-codes.md) - Complete error code reference

### Integration Setup

- [PuppetDB Integration Setup](docs/puppetdb-integration-setup.md) - PuppetDB configuration guide
- [Puppetserver Setup](docs/uppetserver-integration-setup.md) - Puppetserver configuration guide
- [PuppetDB API Documentation](docs/puppetdb-api.md) - PuppetDB-specific API endpoints

### Additional Resources

- [E2E Testing Guide](docs/e2e-testing.md) - End-to-end testing documentation
- [Troubleshooting Guide](docs/troubleshooting.md) - Common issues and solutions

