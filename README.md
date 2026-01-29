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
  - [Bolt Integration](#bolt-integration)
  - [PuppetDB Integration](#puppetdb-integration)
  - [PuppetServer Integration](#puppetserver-integration)
  - [Hiera Integration](#hiera-integration)
- [Installation](#installation)
- [Development / debugging](#development--debugging)
  - [Accessing the Application](#accessing-the-application)
- [Build](#build)
- [Configuration](#configuration)
- [Testing](#testing)
  - [Unit and Integration Tests](#unit-and-integration-tests)
  - [End-to-End Tests](#end-to-end-tests)
  - [Development Pre-commit Hooks](#development-pre-commit-hooks)
- [Docker Deployment](#docker-deployment)
  - [Quick Start](#quick-start)
- [Troubleshooting](#troubleshooting)
- [Roadmap](#roadmap)
  - [Planned Features](#planned-features)
  - [Version History](#version-history)
- [License](#license)
- [Support](#support)
  - [Documentation](#documentation)
  - [Getting Help](#getting-help)
- [Acknowledgments](#acknowledgments)
- [Documentation](#documentation)

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
- **Catalogs diff**: Compare and show differences in catalogs from different environments
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
│   │   ├── bolt/          # Bolt integration (temp)
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

*Puppet run reports with detailed metrics and Bolt Execution history with filtering*

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

Pabawi uses a `.env` file for configuration. Copy `backend/.env.example` to `backend/.env` to get started.

For detailed configuration options including Bolt, PuppetDB, PuppetServer, and Hiera integration settings, please refer to the [Configuration Guide](docs/configuration.md).

For API details, see the [Integrations API Documentation](docs/integrations-api.md).

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

To start Pabawi with Docker Compose using the default configuration:

```bash
docker-compose up -d
```

This will start the application at <http://localhost:3000>.

## Troubleshooting

For solutions to common issues including installation, configuration, and integration problems, please refer to the comprehensive [Troubleshooting Guide](docs/troubleshooting.md).

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

- **v0.5.0**: Report filtering, puppet run history visualization, enhanced expert mode with frontend logging
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
- [PuppetDB Integration Setup](docs/integrations/puppetdb.md)

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

- [Technical Summary](docs/description.md) - High-level technical overview and goals
- [Architecture Documentation](docs/architecture.md) - System architecture and plugin design
- [Repository Structure](docs/repo_structure_and_config.md) - Guide to repository files and configuration
- [Configuration Guide](docs/configuration.md) - Complete configuration reference
- [User Guide](docs/user-guide.md) - Comprehensive user documentation
- [API Documentation](docs/api.md) - REST API reference

### API Reference

- [Integrations API Documentation](docs/integrations-api.md) - Complete API reference for all integrations
- [API Endpoints Reference](docs/api-endpoints-reference.md) - Quick reference table of all endpoints
- [Authentication Guide](docs/authentication.md) - Authentication setup and troubleshooting
- [Error Codes Reference](docs/error-codes.md) - Complete error code reference

### Integration Setup

- [PuppetDB Integration Setup](docs/integrations/puppetdb.md) - PuppetDB configuration guide
- [Puppetserver Setup](docs/integrations/puppetserver.md) - Puppetserver configuration guide
- [PuppetDB API Documentation](docs/puppetdb-api.md) - PuppetDB-specific API endpoints

### Additional Resources

- [E2E Testing Guide](docs/e2e-testing.md) - End-to-end testing documentation
- [Troubleshooting Guide](docs/troubleshooting.md) - Common issues and solutions
